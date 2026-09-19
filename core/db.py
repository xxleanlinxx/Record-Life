"""Single-process DuckDB access, schema migrations and atomic summary refresh."""
import argparse
from contextlib import contextmanager
import os
import pathlib
import threading
import duckdb
from functools import lru_cache

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_PATH = pathlib.Path(os.environ.get("RECORD_LIFE_DB", ROOT / "data" / "record_life.duckdb"))
SQL_DIR = ROOT / "sql"
LOCK = threading.RLock()

@lru_cache(maxsize=1)
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))
    ensure_schema(con)
    return con

@contextmanager
def transaction(con):
    with LOCK:
        con.execute("begin")
        try:
            yield con
            con.execute("commit")
        except Exception:
            con.execute("rollback")
            raise

def run_sql_file(con, name):
    con.execute((SQL_DIR / name).read_text(encoding="utf-8"))

def ensure_schema(con, seed=False):
    with transaction(con):
        _migrate_trip_currency_constraints(con)
        for name in ("00_dim.sql", "10_dwd.sql"):
            run_sql_file(con, name)
        con.execute("create table if not exists schema_version(version integer primary key)")
        if not con.execute("select 1 from schema_version where version=1").fetchone():
            run_sql_file(con, "40_v1.sql")
            _backfill_expenses(con)
            con.execute("insert into schema_version values (1)")
        # Reinstall the booked-amount view after the legacy base scripts.
        con.execute("create or replace view v_dwd_expense_home as select e.*, booked_home_currency home_currency, booked_home_amount amount_home from dwd_expense e where not is_deleted")
        run_sql_file(con,"20_dws.sql")
        con.execute("create table if not exists app_trip_revision(trip_id varchar primary key, revision bigint not null)")
        if seed and not con.execute("select 1 from dim_trip").fetchone():
            run_sql_file(con, "30_seed.sql")
            _backfill_expenses(con)
        for (tid,) in con.execute("select trip_id from dim_trip").fetchall():
            _refresh_dws(con, tid)

def _migrate_trip_currency_constraints(con):
    """DuckDB updates FK columns via delete/insert, which blocks referenced trips.

    Replace the two currency FKs with equivalent supported-currency checks.
    Rebuild only the affected dependency graph, preserving every detail column.
    The caller's transaction rolls back the entire migration on any failure.
    """
    if not con.execute("select 1 from duckdb_constraints() where table_name='dim_trip' and constraint_type='FOREIGN KEY'").fetchone():
        return
    order = ["dim_trip","dim_member","dim_trip_budget","dwd_expense","dwd_itinerary_item",
        "dwd_booking","dwd_shopping_item","dwd_expense_split","dwd_currency_change"]
    existing = {r[0] for r in con.execute("select table_name from information_schema.tables where table_schema='main' and table_type='BASE TABLE'").fetchall()}
    columns = {}
    for table in order:
        if table in existing:
            columns[table] = [r[0] for r in con.execute(f"describe {table}").fetchall() if not (table=='dim_trip' and r[0]=='n_days')]
            names = ",".join(columns[table])
            con.execute(f"create temporary table migrate_{table} as select {names} from {table}")
    for view in ("v_dws_trip_daily","v_dws_trip_category","v_dws_member_balance","v_dwd_expense_home"):
        con.execute(f"drop view if exists {view}")
    for table in reversed(order):
        con.execute(f"drop table if exists {table}")
    for name in ("00_dim.sql","10_dwd.sql","40_v1.sql"):
        run_sql_file(con,name)
    for table,names in columns.items():
        names = ",".join(names)
        con.execute(f"insert into {table}({names}) select {names} from migrate_{table}")
        con.execute(f"drop table migrate_{table}")
    _backfill_expenses(con)
    con.execute("create table if not exists schema_version(version integer primary key)")
    con.execute("insert or ignore into schema_version values (1)")

def _backfill_expenses(con):
    con.execute("""update dwd_expense e set booked_home_amount=e.amount,
        booked_home_currency=t.home_currency,fx_home_currency=t.home_currency,applied_fx_rate=1
        from dim_trip t where e.trip_id=t.trip_id and e.currency=t.home_currency and e.booked_home_amount is null""")
    con.execute("""update dwd_expense e set booked_home_amount=e.amount/rf.rate*rh.rate,
        booked_home_currency=t.home_currency, fx_home_currency=t.home_currency,
        applied_fx_rate=rh.rate/rf.rate
        from dim_trip t, dim_fx_rate rf, dim_fx_rate rh
        where e.trip_id=t.trip_id and e.booked_home_amount is null
        and rf.rate_date=e.fx_rate_date and rh.rate_date=e.fx_rate_date
        and rf.base_ccy='USD' and rh.base_ccy='USD'
        and rf.quote_ccy=e.currency and rh.quote_ccy=t.home_currency""")
    missing = con.execute("select count(*) from dwd_expense where booked_home_amount is null").fetchone()[0]
    if missing:
        raise ValueError(f"{missing} legacy expense(s) lack their pinned FX snapshot; restore the rates before migrating.")

def touch_trip(con, trip_id):
    con.execute("insert into app_trip_revision values (?,1) on conflict(trip_id) do update set revision=app_trip_revision.revision+1",[trip_id])

def _refresh_dws(con, trip_id):
    con.execute("delete from dws_trip_daily where trip_id=? and day_no>(select n_days from dim_trip where trip_id=?)",[trip_id,trip_id])
    for table in ("dws_trip_daily", "dws_trip_category", "dws_member_balance"):
        con.execute(f"insert or replace into {table} select * from v_{table} where trip_id=?", [trip_id])
    touch_trip(con, trip_id)

def refresh_dws(con, trip_id):
    with transaction(con):
        _refresh_dws(con, trip_id)

def q(con, sql, params=None):
    with LOCK:
        frame = con.execute(sql, params or []).df()
    for name in ("start_date", "end_date", "rate_date", "fx_rate_date"):
        if name in frame and str(frame[name].dtype).startswith("datetime64"):
            frame[name] = frame[name].dt.date
    return frame

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--init", action="store_true")
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--sync-fx", action="store_true")
    args = parser.parse_args()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))
    ensure_schema(con, seed=args.demo)
    if args.sync_fx:
        from core.fx import ensure_rates
        print("rates:", ensure_rates(con, force=True))
    print("ok →", DB_PATH)
    con.close()
