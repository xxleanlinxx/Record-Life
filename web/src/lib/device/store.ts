import { ZodError } from "zod";
import { Engine } from "./engine";
import { initialize, migrate, seed } from "./schema";
import { readSnapshot, readMetadata, saveSnapshot } from "./persistence";
import { ApiError } from "../errors";
import { exportJSON, importJSON, type BackupProgress } from "./backup";
import { fetchRates, fxInfo, storeRates } from "./fx";
import * as services from "./services";
import type { Bundle, Revision } from "../types";
let engine: Engine | undefined, generation: string | undefined;
let queue: Promise<unknown> = Promise.resolve();
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("record-life-device")
    : null;
channel?.addEventListener("message", () =>
  window.dispatchEvent(new Event("record-life-device-change")),
);
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = () =>
    navigator.locks
      ? navigator.locks.request("record-life-device-db", fn)
      : fn();
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
async function current() {
  if (!window.isSecureContext)
    throw new ApiError("裝置資料庫需要 HTTPS 或 localhost 才能安全運行。", 400);
  const meta = await readMetadata();
  if (!engine || meta?.generation !== generation) {
    const snapshot = await readSnapshot();
    await engine?.close();
    engine = undefined;
    const loaded = await Engine.open(snapshot?.bytes);
    try {
      if (!snapshot) {
        await initialize(loaded);
        const saved = await saveSnapshot(await loaded.bytes());
        generation = saved.generation;
      } else if (await migrate(loaded)) {
        const saved = await saveSnapshot(
          await loaded.bytes(),
          snapshot.generation,
        );
        generation = saved.generation;
        channel?.postMessage("changed");
      } else generation = snapshot.generation;
      engine = loaded;
    } catch (error) {
      await loaded.close();
      throw error;
    }
  }
  return engine!;
}
async function transaction<T>(e: Engine, fn: () => Promise<T>): Promise<T> {
  await e.exec("BEGIN");
  let committed = false;
  try {
    const result = await fn();
    await e.exec("COMMIT");
    committed = true;
    const saved = await saveSnapshot(await e.bytes(), generation);
    generation = saved.generation;
    channel?.postMessage("changed");
    return result;
  } catch (error) {
    if (committed) {
      await e.close();
      engine = undefined;
      generation = undefined;
    } else await e.exec("ROLLBACK");
    throw error;
  }
}
async function snapshot(
  e: Engine,
  tid: string,
  summary = false,
): Promise<Bundle> {
  const revision = await services.revision(e, tid),
    trip = await services.trip(e, tid);
  return {
    revision,
    trip,
    members: await e.rows(
      "select * from dim_member where trip_id=? order by is_owner desc,display_name",
      [tid],
    ),
    itinerary: await e.rows(
      "select i.*,p.name place,p.locality,p.gmaps_place_id from dwd_itinerary_item i left join dim_place p using(place_id) where i.trip_id=? order by day_no,start_time,item_id",
      [tid],
    ),
    bookings: await e.rows(
      "select b.*,p.name place,p.locality,p.gmaps_place_id from dwd_booking b left join dim_place p using(place_id) where b.trip_id=? order by starts_at,booking_id",
      [tid],
    ),
    shopping: await e.rows(
      "select * from dwd_shopping_item where trip_id=? order by is_bought,item_id",
      [tid],
    ),
    expenses: await e.rows(
      "select e.*,m.display_name payer from v_dwd_expense_home e join dim_member m using(member_id) where e.trip_id=? order by " +
        (summary ? "expense_id" : "spent_at") +
        " desc,expense_id desc" +
        (summary ? " limit 20" : ""),
      [tid],
    ),
    splits: await e.rows(
      "select s.* from dwd_expense_split s join (select expense_id from v_dwd_expense_home where trip_id=? order by " +
        (summary ? "expense_id" : "spent_at") +
        " desc,expense_id desc" +
        (summary ? " limit 20" : "") +
        ") e using(expense_id)",
      [tid],
    ),
    daily: await e.rows(
      "select * from dws_trip_daily where trip_id=? order by day_no",
      [tid],
    ),
    categories: await e.rows(
      "select * from dws_trip_category where trip_id=? order by actual_home desc,category",
      [tid],
    ),
    balances: await e.rows(
      "select b.*,m.display_name from dws_member_balance b join dim_member m using(member_id) where b.trip_id=? order by m.display_name",
      [tid],
    ),
    fx: await fxInfo(e),
  };
}
export async function localRequest<T>(
  path: string,
  init: RequestInit = {},
  expected?: Revision,
): Promise<T> {
  try {
    // Keep slow external FX requests outside the database lock.
    if (path === "/fx/refresh") {
      let rates;
      try {
        rates = await fetchRates();
      } catch {
        return (await exclusive(async () => ({
          ...(await fxInfo(await current())),
          error: "目前無法更新匯率，保留最後一次完整快照。",
        }))) as T;
      }
      return (await exclusive(async () => {
        const e = await current();
        return transaction(e, async () => {
          await storeRates(e, rates);
          return fxInfo(e);
        });
      })) as T;
    }
    return (await exclusive(async () => {
      const e = await current(),
        method = init.method ?? "GET",
        body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (path === "/bootstrap")
        return {
          trips: await e.rows(
            "select * from dim_trip order by start_date desc,trip_id",
          ),
          fx: await fxInfo(e),
        };
      if (path === "/backup") return exportJSON(e);
      if (path.startsWith("/backup/"))
        return exportJSON(e, decodeURIComponent(path.slice(8)));
      const url = new URL(path, "https://record-life.local");
      const parts = url.pathname.split("/").filter(Boolean),
        tid = parts[1],
        kind = parts[2],
        itemId = parts[3] === undefined ? undefined : Number(parts[3]);
      if (parts[0] === "trips" && tid && !kind && method === "GET")
        return snapshot(e, tid, url.searchParams.get("summary") === "1");
      if (
        parts[0] === "trips" &&
        tid &&
        kind === "expenses" &&
        method === "GET"
      ) {
        const revision = await services.revision(e, tid);
        const q = url.searchParams.get("q") ?? "",
          category = url.searchParams.get("category") ?? "all";
        const page = Number(url.searchParams.get("page") ?? "1");
        if (
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > 1000000 ||
          q.length > 240 ||
          (category !== "all" &&
            ![
              "Transport",
              "Stay",
              "Food",
              "Sights",
              "Shopping",
              "Other",
            ].includes(category))
        )
          throw new ApiError("請確認搜尋條件與頁碼。", 422);
        const source =
          "from v_dwd_expense_home e join dim_member m using(member_id) where e.trip_id=? and (?='all' or e.category=?) and contains(lower(e.title || ' ' || m.display_name),lower(?))";
        const params = [tid, category, category, q];
        const expenses = await e.rows(
          "select e.*,m.display_name payer " +
            source +
            " order by spent_at desc,expense_id desc limit 50 offset ?",
          [...params, (page - 1) * 50],
        );
        const splits = await e.rows(
          "select s.* from dwd_expense_split s join (select expense_id " +
            source +
            " order by spent_at desc,expense_id desc limit 50 offset ?) e using(expense_id)",
          [...params, (page - 1) * 50],
        );
        const [{ n }] = await e.rows<{ n: number }>(
          "select count(*) n " + source,
          params,
        );
        return { revision, expenses, splits, total: n };
      }
      return transaction(e, async () => {
        if (path === "/demo") {
          if ((await e.rows("select trip_id from dim_trip limit 1")).length)
            throw new ApiError("已經有旅程資料，無法再次載入範例。", 409);
          await seed(e);
          return { trip_id: "t1" };
        }
        if (path === "/trips" && method === "POST")
          return services.createTrip(e, body);
        if (parts[0] !== "trips" || !tid)
          throw new ApiError("找不到這項操作。", 404);
        if (
          method === "PUT" ||
          method === "PATCH" ||
          method === "DELETE" ||
          kind === "currency"
        )
          await services.checkRevision(e, tid, expected);
        if (method === "DELETE" && itemId !== undefined)
          return services.remove(e, tid, kind, itemId);
        if (!kind && method === "PUT") return services.editTrip(e, tid, body);
        if (kind === "currency" && method === "POST")
          return services.changeCurrency(e, tid, body);
        if (kind === "members" && method === "POST")
          return services.addMember(e, tid, body);
        if (kind === "expenses" && method === "POST")
          return services.saveExpense(e, tid, body, expected);
        if (kind === "shopping" && method === "PATCH" && itemId !== undefined)
          return services.bought(e, tid, itemId, body);
        if (method === "POST" || method === "PUT") {
          if (kind === "activities")
            return services.saveActivity(e, tid, body, itemId);
          if (kind === "bookings")
            return services.saveBooking(e, tid, body, itemId);
          if (kind === "shopping")
            return services.saveShopping(e, tid, body, itemId);
        }
        throw new ApiError("找不到這項操作。", 404);
      });
    })) as T;
  } catch (error) {
    if (error instanceof ZodError)
      throw new ApiError(
        "請修正標示的欄位後再儲存。",
        422,
        "validation",
        Object.fromEntries(
          error.issues.map((issue) => [
            issue.path.join("."),
            "請確認內容、日期或金額格式。",
          ]),
        ),
      );
    throw error;
  }
}
export async function binaryBackup() {
  return exclusive(async () => {
    await current();
    const stored = await readSnapshot();
    return stored!.bytes;
  });
}
export async function backupPreview(data: unknown, progress?: BackupProgress) {
  const e = await importJSON(data, progress);
  try {
    return {
      trips: await e.rows<{ name: string }>("select name from dim_trip"),
      bytes: await e.bytes(),
      expenses: (
        await e.rows<{ n: number }>(
          "select count(*) n from dwd_expense where not is_deleted",
        )
      )[0].n,
    };
  } finally {
    await e.close();
  }
}
export async function restoreBackup(
  data: unknown,
  expectedGeneration: string,
  progress?: BackupProgress,
) {
  const replacement = await importJSON(data, progress);
  return installBackup(replacement, expectedGeneration);
}
export async function restorePreview(
  bytes: Uint8Array,
  expectedGeneration: string,
) {
  const replacement = await Engine.open(bytes);
  return installBackup(replacement, expectedGeneration);
}
async function installBackup(replacement: Engine, expectedGeneration: string) {
  try {
    await exclusive(async () => {
      await current();
      if (generation !== expectedGeneration)
        throw new ApiError(
          "資料在預覽後已更新，請重新選擇備份再確認還原。",
          409,
        );
      const saved = await saveSnapshot(await replacement.bytes(), generation);
      const old = engine;
      engine = replacement;
      generation = saved.generation;
      await old?.close();
      channel?.postMessage("changed");
    });
  } catch (error) {
    await replacement.close();
    throw error;
  }
}
export async function storageStatus() {
  return exclusive(async () => {
    await current();
    const snapshot = await readMetadata();
    return {
      generation: snapshot!.generation,
      savedAt: snapshot!.savedAt,
      bytes: snapshot!.byteLength,
      persisted: await navigator.storage.persisted(),
    };
  });
}
