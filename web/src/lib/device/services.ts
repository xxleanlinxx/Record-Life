import { Temporal } from "@js-temporal/polyfill";
import { Engine, type Param } from "./engine";
import * as c from "./contracts";
import { categories, daysBetween } from "../domain";
import { ApiError } from "../errors";
import type { Trip } from "../types";
import { rate } from "./fx";
import { refresh } from "./schema";

const id = () => crypto.randomUUID();
const amount = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const invalid = (message: string): never => {
  throw new ApiError(message, 400);
};
export async function trip(e: Engine, tid: string) {
  const rows = await e.rows<Trip>("select * from dim_trip where trip_id=?", [
    tid,
  ]);
  if (!rows.length) throw new ApiError("找不到這趟旅程。", 404);
  return rows[0];
}
export async function revision(e: Engine, tid: string) {
  await trip(e, tid);
  return (
    await e.rows<{ revision: number }>(
      "select revision from app_trip_revision where trip_id=?",
      [tid],
    )
  )[0].revision;
}
export async function checkRevision(e: Engine, tid: string, expected?: number) {
  if ((await revision(e, tid)) !== expected)
    throw new ApiError(
      "資料已在其他頁面更新。請重新載入後再試，避免覆蓋新的內容。",
      409,
    );
}
async function next(e: Engine, table: string, key: string) {
  return (
    await e.rows<{ id: number }>(
      `select coalesce(max(${key}),0)+1 id from ${table}`,
    )
  )[0].id;
}
async function requireItem(
  e: Engine,
  tid: string,
  table: string,
  key: string,
  value: number,
) {
  if (
    !(
      await e.rows(`select ${key} from ${table} where trip_id=? and ${key}=?`, [
        tid,
        value,
      ])
    ).length
  )
    throw new ApiError("找不到這項資料，可能已被刪除。", 404);
}
async function place(
  e: Engine,
  name: string,
  locality: string,
  googleId: string,
) {
  if (!name) return null;
  const pid = id();
  await e.exec(
    "insert into dim_place(place_id,name,locality,gmaps_place_id) values (?,?,?,?)",
    [pid, name, locality, googleId || null],
  );
  return pid;
}
function duration(start: string, end: string) {
  const n = daysBetween(start, end) + 1;
  if (n < 1 || n > 366) invalid("旅程長度需介於 1 到 366 天。");
  return n;
}
export async function createTrip(e: Engine, body: unknown) {
  const b = c.tripCreate.parse(body);
  duration(b.start, b.end);
  if (new Set(b.members).size !== b.members.length)
    invalid("旅伴名字不可重複。");
  const tid = id();
  await e.exec(
    "insert into dim_trip(trip_id,name,start_date,end_date,dates_label,home_currency,local_currency,budget_home) values (?,?,?,?,?,?,?,?)",
    [
      tid,
      b.name,
      b.start,
      b.end,
      `${b.start} — ${b.end}`,
      b.home,
      b.local,
      amount(b.budget),
    ],
  );
  for (const [i, name] of b.members.entries())
    await e.exec("insert into dim_member values (?,?,?,?)", [
      id(),
      tid,
      name,
      i === 0,
    ]);
  for (const key of Object.keys(categories))
    await e.exec("insert into dim_trip_budget values (?,?,0)", [tid, key]);
  await refresh(e, tid);
  return { trip_id: tid };
}
export async function editTrip(e: Engine, tid: string, body: unknown) {
  const b = c.tripEdit.parse(body),
    old = await trip(e, tid),
    n = duration(b.start, b.end);
  if (
    (
      await e.rows(
        "select 1 from dwd_itinerary_item where trip_id=? and day_no>? limit 1",
        [tid, n],
      )
    ).length
  )
    invalid("縮短旅程前，請先調整超出日期的行程。");
  if (
    (
      await e.rows(
        "select 1 from dwd_expense where trip_id=? and not is_deleted and cast(spent_at as date)>? limit 1",
        [tid, b.end],
      )
    ).length
  )
    invalid("結束日期需包含已記錄的支出日期。");
  const budgets = Object.keys(categories).map(
    (key) => [key, amount(b.category_budgets[key] ?? 0)] as const,
  );
  if (budgets.reduce((sum, [, v]) => sum + v, 0) > amount(b.budget) + 1e-8)
    invalid("分類預算加總超過總預算，請調整後再儲存。");
  await e.exec(
    "update dim_trip set name=?,start_date=?,end_date=?,dates_label=?,local_currency=?,budget_home=? where trip_id=?",
    [
      b.name,
      b.start,
      b.end,
      `${b.start} — ${b.end}`,
      b.local,
      amount(b.budget),
      tid,
    ],
  );
  for (const [key, value] of budgets)
    await e.exec("insert or replace into dim_trip_budget values (?,?,?)", [
      tid,
      key,
      value,
    ]);
  if (old.start_date !== b.start)
    await e.exec(
      "update dwd_expense set day_no=greatest(0,date_diff('day',cast(? as date),cast(spent_at as date))+1) where trip_id=?",
      [b.start, tid],
    );
  await refresh(e, tid);
  return { ok: true };
}
export async function addMember(e: Engine, tid: string, body: unknown) {
  const { name } = c.member.parse(body);
  await trip(e, tid);
  if (
    (
      await e.rows(
        "select 1 from dim_member where trip_id=? and display_name=?",
        [tid, name],
      )
    ).length
  )
    invalid("這位旅伴已經在名單中。");
  await e.exec("insert into dim_member values (?,?,?,false)", [
    id(),
    tid,
    name,
  ]);
  await refresh(e, tid);
  return { ok: true };
}
export async function changeCurrency(e: Engine, tid: string, body: unknown) {
  const { home } = c.currencyChange.parse(body),
    old = await trip(e, tid);
  if (home === old.home_currency) return { ok: true };
  const { factor, date } = await rate(e, old.home_currency, home);
  await e.exec(
    "update dim_trip set home_currency=?,budget_home=budget_home*? where trip_id=?",
    [home, factor, tid],
  );
  await e.exec(
    "update dim_trip_budget set planned_home=planned_home*? where trip_id=?",
    [factor, tid],
  );
  await e.exec(
    "update dwd_expense set booked_home_amount=booked_home_amount*?,booked_home_currency=? where trip_id=?",
    [factor, home, tid],
  );
  await e.exec(
    "insert into dwd_currency_change(change_id,trip_id,from_ccy,to_ccy,factor,rate_date) values (?,?,?,?,?,?)",
    [id(), tid, old.home_currency, home, factor, date],
  );
  await refresh(e, tid);
  return { ok: true };
}
async function voidExpense(e: Engine, tid: string, eid: number) {
  if (
    !(
      await e.rows(
        "select 1 from dwd_expense where trip_id=? and expense_id=? and not is_deleted",
        [tid, eid],
      )
    ).length
  )
    invalid("這筆支出已不存在，請重新載入。");
  await e.exec(
    "update dwd_shopping_item set expense_id=null,is_bought=false,updated_at=now() where expense_id=?",
    [eid],
  );
  await e.exec("update dwd_expense set is_deleted=true where expense_id=?", [
    eid,
  ]);
}
export async function saveExpense(
  e: Engine,
  tid: string,
  body: unknown,
  expected?: number,
) {
  const b = c.expense.parse(body),
    existing = await e.rows<{ expense_id: number }>(
      "select expense_id from dwd_expense where trip_id=? and submission_id=?",
      [tid, b.submission_id],
    );
  if (existing.length) return { expense_id: existing[0].expense_id };
  if (b.replaces != null) await checkRevision(e, tid, expected);
  const t = await trip(e, tid),
    members = (
      await e.rows<{ member_id: string }>(
        "select member_id from dim_member where trip_id=?",
        [tid],
      )
    ).map((m) => m.member_id),
    split = [...new Set(b.split)];
  if (!members.includes(b.payer) || split.some((m) => !members.includes(m)))
    invalid("付款人與分攤旅伴必須來自這趟旅程。");
  if (b.when > t.end_date) invalid("付款日期不能晚於旅程結束日期。");
  if (b.shopping_id != null) {
    const item = await e.rows<{ expense_id: number | null }>(
      "select expense_id from dwd_shopping_item where trip_id=? and item_id=?",
      [tid, b.shopping_id],
    );
    if (
      !item.length ||
      (item[0].expense_id !== null && item[0].expense_id !== b.replaces)
    )
      invalid("這件物品已經記過帳，請到支出紀錄確認。");
  }
  const { factor, date } = await rate(e, b.currency, t.home_currency),
    eid = await next(e, "dwd_expense", "expense_id"),
    paid = amount(b.amount);
  if (b.replaces != null) await voidExpense(e, tid, b.replaces);
  await e.exec(
    `insert into dwd_expense(expense_id,trip_id,day_no,spent_at,title,category,amount,currency,member_id,fx_rate_date,booked_home_amount,booked_home_currency,fx_home_currency,applied_fx_rate,submission_id) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      eid,
      tid,
      Math.max(0, daysBetween(t.start_date, b.when) + 1),
      `${b.when} 12:00:00`,
      b.title,
      b.category,
      paid,
      b.currency,
      b.payer,
      date,
      paid * factor,
      t.home_currency,
      t.home_currency,
      factor,
      b.submission_id,
    ],
  );
  for (const m of split)
    await e.exec("insert into dwd_expense_split values (?,?,?)", [
      eid,
      m,
      1 / split.length,
    ]);
  if (b.shopping_id != null)
    await e.exec(
      "update dwd_shopping_item set expense_id=?,is_bought=true,updated_at=now() where item_id=?",
      [eid, b.shopping_id],
    );
  await refresh(e, tid);
  return { expense_id: eid };
}
export async function saveActivity(
  e: Engine,
  tid: string,
  body: unknown,
  itemId?: number,
) {
  const b = c.activity.parse(body),
    t = await trip(e, tid);
  if (b.day > t.n_days) invalid("行程日期超出旅程範圍。");
  if (itemId !== undefined)
    await requireItem(e, tid, "dwd_itinerary_item", "item_id", itemId);
  const pid = await place(e, b.place, b.locality, b.google_id),
    values: Param[] = [
      b.day,
      b.time.slice(0, 5),
      b.kind,
      b.title,
      pid,
      amount(b.cost),
      b.currency,
      b.notes,
    ];
  if (itemId === undefined)
    await e.exec(
      "insert into dwd_itinerary_item values (?,?,?,?,?,?,?,?,?,?)",
      [await next(e, "dwd_itinerary_item", "item_id"), tid, ...values],
    );
  else
    await e.exec(
      "update dwd_itinerary_item set day_no=?,start_time=?,kind=?,title=?,place_id=?,planned_cost=?,planned_ccy=?,notes=? where trip_id=? and item_id=?",
      [...values, tid, itemId],
    );
  await refresh(e, tid);
  return { ok: true };
}
export function utcTime(local: string, zone: string) {
  return Temporal.PlainDateTime.from(local).toZonedDateTime(zone, {
    disambiguation: "reject",
  }).epochMilliseconds;
}
export async function saveBooking(
  e: Engine,
  tid: string,
  body: unknown,
  bid?: number,
) {
  const b = c.booking.parse(body);
  await trip(e, tid);
  let start: number, end: number;
  try {
    start = utcTime(b.start, b.start_zone);
    end = utcTime(b.end, b.end_zone);
  } catch {
    invalid(
      "請確認時區與當地時間；夏令時間切換造成的不存在或重複時間，請改用明確時間。",
    );
  }
  if (end! < start!)
    invalid("請確認時區與起訖時間：結束時間不能早於開始時間。");
  if (bid !== undefined)
    await requireItem(e, tid, "dwd_booking", "booking_id", bid);
  const pid = await place(e, b.place, b.locality, b.google_id),
    values: Param[] = [
      b.kind,
      b.title,
      b.provider,
      b.ref,
      b.confirmation,
      b.origin,
      b.destination,
      b.start,
      b.end,
      pid,
      b.price === null ? null : amount(b.price),
      b.currency,
      b.notes,
      b.start_zone,
      b.end_zone,
    ];
  if (bid === undefined)
    await e.exec(
      "insert into dwd_booking(booking_id,trip_id,kind,title,provider,ref_code,confirmation,origin,destination,starts_at,ends_at,place_id,price,price_ccy,notes,start_zone,end_zone) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [await next(e, "dwd_booking", "booking_id"), tid, ...values],
    );
  else
    await e.exec(
      "update dwd_booking set kind=?,title=?,provider=?,ref_code=?,confirmation=?,origin=?,destination=?,starts_at=?,ends_at=?,place_id=?,price=?,price_ccy=?,notes=?,start_zone=?,end_zone=? where trip_id=? and booking_id=?",
      [...values, tid, bid],
    );
  await refresh(e, tid);
  return { ok: true };
}
export async function saveShopping(
  e: Engine,
  tid: string,
  body: unknown,
  itemId?: number,
) {
  const b = c.shopping.parse(body);
  await trip(e, tid);
  const values: Param[] = [b.title, b.where, amount(b.price), b.currency];
  if (itemId === undefined) {
    let value = (
      await e.rows<{ id: number }>("select nextval('seq_shopping') id")
    )[0].id;
    while (
      (await e.rows("select 1 from dwd_shopping_item where item_id=?", [value]))
        .length
    )
      value = (
        await e.rows<{ id: number }>("select nextval('seq_shopping') id")
      )[0].id;
    await e.exec(
      "insert into dwd_shopping_item(item_id,trip_id,title,where_hint,planned_price,planned_ccy) values (?,?,?,?,?,?)",
      [value, tid, ...values],
    );
  } else {
    await requireItem(e, tid, "dwd_shopping_item", "item_id", itemId);
    await e.exec(
      "update dwd_shopping_item set title=?,where_hint=?,planned_price=?,planned_ccy=?,updated_at=now() where trip_id=? and item_id=?",
      [...values, tid, itemId],
    );
  }
  await refresh(e, tid);
  return { ok: true };
}
export async function bought(
  e: Engine,
  tid: string,
  itemId: number,
  body: unknown,
) {
  const b = c.bought.parse(body);
  await requireItem(e, tid, "dwd_shopping_item", "item_id", itemId);
  const [item] = await e.rows<{ expense_id: number | null }>(
    "select expense_id from dwd_shopping_item where item_id=?",
    [itemId],
  );
  if (item.expense_id !== null && !b.bought)
    invalid("請先刪除對應支出，再取消已購買。");
  await e.exec(
    "update dwd_shopping_item set is_bought=?,updated_at=now() where item_id=?",
    [b.bought, itemId],
  );
  await refresh(e, tid);
  return { ok: true };
}
export async function remove(
  e: Engine,
  tid: string,
  kind: string,
  itemId: number,
) {
  if (kind === "expenses") await voidExpense(e, tid, itemId);
  else {
    const mapping: Record<string, [string, string]> = {
      activities: ["dwd_itinerary_item", "item_id"],
      bookings: ["dwd_booking", "booking_id"],
      shopping: ["dwd_shopping_item", "item_id"],
    };
    if (!mapping[kind]) throw new ApiError("找不到這項資料。", 404);
    const [table, key] = mapping[kind];
    await requireItem(e, tid, table, key, itemId);
    await e.exec(`delete from ${table} where trip_id=? and ${key}=?`, [
      tid,
      itemId,
    ]);
  }
  await refresh(e, tid);
  return { ok: true };
}
