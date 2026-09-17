import { z } from "zod";
import { Engine, type Param } from "./engine";
import { initialize, refresh, tables } from "./schema";
import { ApiError } from "../errors";
import { daysBetween } from "../domain";
import * as contracts from "./contracts";
import { utcTime } from "./services";
const cell = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const envelope = z.object({
  format: z.literal("record-life"),
  version: z.literal(1),
  tables: z.record(z.string(), z.array(z.record(z.string(), cell))),
});
export async function exportJSON(e: Engine) {
  const data: Record<string, unknown> = {};
  for (const table of tables)
    data[table] = await e.rows(`select * from ${table}`);
  return {
    format: "record-life",
    version: 1,
    exported_at: new Date().toISOString(),
    tables: data,
  };
}
export async function importJSON(data: unknown): Promise<Engine> {
  const backup = envelope.parse(data);
  if (
    Object.keys(backup.tables).length !== tables.length ||
    tables.some((t) => !Array.isArray(backup.tables[t]))
  )
    throw new ApiError("備份缺少必要的資料表，尚未變更目前資料。", 400);
  if (
    Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0) > 50000
  )
    throw new ApiError("備份超過此個人版本的 50,000 筆匯入限制。", 400);
  const e = await Engine.open();
  try {
    await initialize(e);
    await e.exec("BEGIN");
    for (const table of tables) {
      const columns = await e.rows<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name=? order by ordinal_position`,
        [table],
      );
      const names = columns
        .map((c) => c.column_name)
        .filter((c) => !(table === "dim_trip" && c === "n_days"));
      for (const row of backup.tables[table]) {
        if (
          Object.keys(row).some(
            (key) =>
              !names.includes(key) &&
              !(table === "dim_trip" && key === "n_days"),
          )
        )
          throw new Error("備份含有不支援的欄位，請使用相容版本。");
        // Require all fields in the exported schema; do not silently rebuild missing history.
        if (names.some((key) => !(key in row)))
          throw new Error("備份欄位不完整，請從原版本重新匯出。");
        await e.exec(
          `insert ${table === "dim_currency" || table === "dim_category" ? "or replace " : ""}into ${table}(${names.join(",")}) values (${names.map(() => "?").join(",")})`,
          names.map((k) => row[k] as Param),
        );
      }
    }
    await validate(e);
    for (const { trip_id } of await e.rows<{ trip_id: string }>(
      "select trip_id from dim_trip",
    ))
      await refresh(e, trip_id);
    await e.exec("COMMIT");
    return e;
  } catch (error) {
    await e.close();
    throw error;
  }
}
async function validate(e: Engine) {
  const checks = [
    `select 1 from dim_trip where end_date<start_date or n_days>366 or not isfinite(budget_home) or budget_home<0 or length(trim(name))=0`,
    `select 1 from dim_trip t where not exists(select 1 from dim_member m where m.trip_id=t.trip_id)`,
    `select 1 from dim_member group by trip_id,display_name having count(*)>1`,
    `select 1 from dim_trip_budget where not isfinite(planned_home) or planned_home<0`,
    `select 1 from dim_trip t join dim_trip_budget b using(trip_id) group by t.trip_id,t.budget_home having sum(b.planned_home)>t.budget_home+0.01`,
    `select 1 from dim_fx_rate where not isfinite(rate) or rate<=0 or base_ccy<>'USD' or (quote_ccy='USD' and rate<>1)`,
    `select 1 from dwd_expense e join dim_member m using(member_id) join dim_trip t on e.trip_id=t.trip_id where e.trip_id<>m.trip_id or not isfinite(amount) or amount<=0 or booked_home_amount is null or booked_home_amount<0 or booked_home_currency is null or booked_home_currency<>t.home_currency or fx_home_currency is null or fx_home_currency not in ('TWD','USD','EUR','GBP','JPY','KRW') or applied_fx_rate is null or applied_fx_rate<=0 or is_deleted is null or (not is_deleted and cast(spent_at as date)>end_date) or day_no<>greatest(0,date_diff('day',start_date,cast(spent_at as date))+1)`,
    `select 1 from dwd_currency_change where factor<=0 or not isfinite(factor) or from_ccy not in ('TWD','USD','EUR','GBP') or to_ccy not in ('TWD','USD','EUR','GBP')`,
    `select 1 from dwd_expense_split s join dwd_expense e using(expense_id) join dim_member m on s.member_id=m.member_id where e.trip_id<>m.trip_id or not isfinite(s.share) or s.share<=0`,
    `select e.expense_id from dwd_expense e left join dwd_expense_split s using(expense_id) group by e.expense_id having abs(coalesce(sum(s.share),0)-1)>0.000001`,
    `select 1 from dwd_itinerary_item i join dim_trip t using(trip_id) where day_no<1 or day_no>n_days or not isfinite(planned_cost) or planned_cost<0`,
    `select 1 from dwd_shopping_item s left join dwd_expense e using(expense_id) where planned_price<0 or not isfinite(planned_price) or (s.expense_id is not null and (not s.is_bought or e.is_deleted or s.trip_id<>e.trip_id))`,
    `select expense_id from dwd_shopping_item where expense_id is not null group by expense_id having count(*)>1`,
  ];
  for (const query of checks)
    if ((await e.rows(`${query} limit 1`)).length)
      throw new ApiError(
        "備份的日期、金額、分攤或資料關聯不完整；目前資料仍保留。",
        400,
      );
  // Match the public contracts for non-financial event fields too.
  for (const row of await e.rows<Record<string, any>>(
    "select * from dwd_itinerary_item",
  ))
    contracts.activity.parse({
      day: row.day_no,
      time: row.start_time,
      kind: row.kind,
      title: row.title,
      cost: row.planned_cost,
      currency: row.planned_ccy,
      notes: row.notes ?? "",
    });
  for (const row of await e.rows<Record<string, any>>(
    "select * from dwd_booking",
  )) {
    const b = contracts.booking.parse({
      kind: row.kind,
      title: row.title,
      start: row.starts_at.replace(" ", "T"),
      end: row.ends_at.replace(" ", "T"),
      start_zone: row.start_zone,
      end_zone: row.end_zone,
      price: row.price,
      currency: row.price_ccy,
      notes: row.notes ?? "",
    });
    if (utcTime(b.end, b.end_zone) < utcTime(b.start, b.start_zone))
      throw new Error("備份的預訂起訖時間不正確。");
  }
  for (const row of await e.rows<Record<string, any>>("select * from dim_trip"))
    if (daysBetween(row.start_date, row.end_date) > 365)
      throw new Error("備份旅程日期無效。");
}
