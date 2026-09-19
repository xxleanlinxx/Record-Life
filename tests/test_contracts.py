import datetime as dt
import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import duckdb
import pytest
from core import db, services

FIXTURES = json.loads((Path(__file__).parent / "fixtures/domain.json").read_text())


@pytest.mark.parametrize("case", FIXTURES["rounding"])
def test_shared_rounding(case):
    assert services.money(case["input"]) == Decimal(str(case["expected"]))


@pytest.mark.parametrize("case", FIXTURES["times"])
def test_shared_time(case):
    local = dt.datetime.fromisoformat(case["local"])
    if case["valid"]:
        assert services.utc_time(local, case["zone"]) == dt.datetime.fromisoformat(case["utc"])
    else:
        with pytest.raises((ValueError, KeyError)):
            services.utc_time(local, case["zone"])


def test_description_edit_preserves_rebased_booking_and_weighted_splits():
    con = duckdb.connect(":memory:")
    try:
        db.ensure_schema(con)
        tid = services.create_trip(con, "Test", dt.date(2026, 10, 1), dt.date(2026, 10, 7), "TWD", "JPY", 10000, ["A", "B"])
        members = [r[0] for r in con.execute("select member_id from dim_member order by display_name").fetchall()]
        def rates(day, jpy):
            con.executemany("insert into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,'USD',?,?,'test')", [(day, c, r) for c, r in {"USD":1,"TWD":32,"JPY":jpy,"EUR":.85,"GBP":.75,"KRW":1350}.items()])
        rates("2026-09-15", 150)
        body = dict(tid=tid,title="Lunch",category="Food",amount=1500,currency="JPY",when=dt.date(2026,10,1),payer=members[0],split=members)
        original = services.save_expense(con, **body, submission_id=uuid4().hex)
        con.execute("update dwd_expense_split set share=case when member_id=? then .75 else .25 end where expense_id=?", [members[0], original])
        services.change_home_currency(con, tid, "USD")
        rates("2026-09-16", 160)
        columns = "booked_home_amount,booked_home_currency,fx_home_currency,applied_fx_rate,fx_rate_date"
        before = con.execute(f"select {columns} from dwd_expense where expense_id=?", [original]).fetchone()
        edited = services.save_expense(con, **{**body, "title":"Renamed"}, submission_id=uuid4().hex, replaces=original)
        assert con.execute(f"select {columns} from dwd_expense where expense_id=?", [edited]).fetchone() == before
        assert con.execute("select share from dwd_expense_split where expense_id=? order by share", [edited]).fetchall() == [(0.25,), (0.75,)]
        changed = services.save_expense(con, **{**body, "amount":1600}, submission_id=uuid4().hex, replaces=edited, split_mode="equal")
        assert con.execute("select booked_home_amount from dwd_expense where expense_id=?", [changed]).fetchone()[0] == Decimal("10")
        assert con.execute("select share from dwd_expense_split where expense_id=?", [changed]).fetchall() == [(0.5,), (0.5,)]
    finally:
        con.close()
