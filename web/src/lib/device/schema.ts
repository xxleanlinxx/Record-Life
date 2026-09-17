import dim from "../../../../sql/00_dim.sql?raw";
import dwd from "../../../../sql/10_dwd.sql?raw";
import dws from "../../../../sql/20_dws.sql?raw";
import migration from "../../../../sql/40_v1.sql?raw";
import seedSQL from "../../../../sql/30_seed.sql?raw";
import { Engine } from "./engine";
export const tables = [
  "dim_currency",
  "dim_category",
  "dim_fx_rate",
  "dim_place",
  "dim_trip",
  "dim_member",
  "dim_trip_budget",
  "dwd_expense",
  "dwd_expense_split",
  "dwd_itinerary_item",
  "dwd_booking",
  "dwd_shopping_item",
  "dwd_currency_change",
] as const;
export async function initialize(e: Engine) {
  await e.exec(
    `${dim}\n${dwd}\n${migration}\ncreate table schema_version(version integer primary key);insert into schema_version values (1);\ncreate table app_trip_revision(trip_id varchar primary key, revision bigint not null);`,
  );
  await views(e);
}
export async function views(e: Engine) {
  await e.exec(
    `create or replace view v_dwd_expense_home as select e.*,booked_home_currency home_currency,booked_home_amount amount_home from dwd_expense e where not is_deleted;\n${dws}`,
  );
}
export async function refresh(e: Engine, tid: string) {
  await e.exec(
    "delete from dws_trip_daily where trip_id=? and day_no>(select n_days from dim_trip where trip_id=?)",
    [tid, tid],
  );
  for (const table of [
    "dws_trip_daily",
    "dws_trip_category",
    "dws_member_balance",
  ])
    await e.exec(
      `insert or replace into ${table} select * from v_${table} where trip_id=?`,
      [tid],
    );
  await e.exec(
    "insert into app_trip_revision values (?,1) on conflict(trip_id) do update set revision=app_trip_revision.revision+1",
    [tid],
  );
}
export async function seed(e: Engine) {
  await e.exec(seedSQL);
  await e.exec(`update dwd_expense e set booked_home_amount=e.amount,booked_home_currency=t.home_currency,fx_home_currency=t.home_currency,applied_fx_rate=1 from dim_trip t where e.trip_id=t.trip_id and e.currency=t.home_currency and e.booked_home_amount is null;
 update dwd_expense e set booked_home_amount=e.amount/rf.rate*rh.rate,booked_home_currency=t.home_currency,fx_home_currency=t.home_currency,applied_fx_rate=rh.rate/rf.rate from dim_trip t,dim_fx_rate rf,dim_fx_rate rh where e.trip_id=t.trip_id and e.booked_home_amount is null and rf.rate_date=e.fx_rate_date and rh.rate_date=e.fx_rate_date and rf.base_ccy='USD' and rh.base_ccy='USD' and rf.quote_ccy=e.currency and rh.quote_ccy=t.home_currency;`);
  await refresh(e, "t1");
}
