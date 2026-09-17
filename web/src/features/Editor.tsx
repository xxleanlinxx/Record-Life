import { useEffect, useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Modal } from "../components/ui";
import { api, ApiError } from "../lib/api";
import {
  addDays,
  categories,
  convert,
  currencies,
  currencyNames,
  errorMessage,
  homeCurrencies,
  kinds,
  money,
  today,
  zones,
} from "../lib/domain";
import type { Bundle, Editor as EditorType } from "../lib/types";

type Values = Record<string, any>;
function initial(editor: EditorType, data?: Bundle): Values {
  const t = data?.trip,
    day = t ? (today() > t.end_date ? t.end_date : today()) : today();
  if (editor.kind === "expense") {
    const row = editor.row,
      s = editor.shopping;
    return {
      title: row?.title ?? s?.title ?? "",
      amount: row?.amount ?? s?.planned_price ?? "",
      currency: row?.currency ?? s?.planned_ccy ?? t?.local_currency ?? "TWD",
      category: row?.category ?? (s ? "Shopping" : "Food"),
      when: row?.spent_at.slice(0, 10) ?? day,
      payer: row?.member_id ?? data?.members[0]?.member_id,
      split: row
        ? data?.splits
            .filter((x) => x.expense_id === row.expense_id)
            .map((x) => x.member_id)
        : data?.members.map((m) => m.member_id),
    };
  }
  if (editor.kind === "activity") {
    const row = editor.row;
    return {
      title: row?.title ?? "",
      day: row?.day_no ?? editor.day ?? 1,
      time: row?.start_time ?? "09:00",
      kind: row?.kind ?? "sight",
      place: row?.place ?? "",
      locality: row?.locality ?? "",
      google_id: row?.gmaps_place_id ?? "",
      cost: row?.planned_cost ?? 0,
      currency: row?.planned_ccy ?? t?.local_currency,
      notes: row?.notes ?? "",
    };
  }
  if (editor.kind === "booking") {
    const row = editor.row;
    return {
      title: row?.title ?? "",
      kind: row?.kind ?? "flight",
      provider: row?.provider ?? "",
      ref: row?.ref_code ?? "",
      confirmation: row?.confirmation ?? "",
      origin: row?.origin ?? "",
      destination: row?.destination ?? "",
      start:
        row?.starts_at.slice(0, 16) ?? `${t?.start_date.slice(0, 10)}T09:00`,
      end: row?.ends_at.slice(0, 16) ?? `${t?.start_date.slice(0, 10)}T12:00`,
      start_zone: row?.start_zone ?? "Asia/Taipei",
      end_zone: row?.end_zone ?? "Asia/Tokyo",
      place: row?.place ?? "",
      locality: row?.locality ?? "",
      google_id: row?.gmaps_place_id ?? "",
      price: row?.price ?? "",
      currency: row?.price_ccy ?? t?.local_currency,
      notes: row?.notes ?? "",
    };
  }
  if (editor.kind === "shopping") {
    const row = editor.row;
    return {
      title: row?.title ?? "",
      where: row?.where_hint ?? "",
      price: row?.planned_price ?? 0,
      currency: row?.planned_ccy ?? t?.local_currency,
    };
  }
  if (editor.kind === "currency") return { home: t?.home_currency ?? "TWD" };
  const create = editor.create;
  return {
    name: create ? "" : (t?.name ?? ""),
    start: create ? today() : t?.start_date.slice(0, 10),
    end: create ? addDays(today(), 4) : t?.end_date.slice(0, 10),
    home: "TWD",
    local: create ? "JPY" : (t?.local_currency ?? "JPY"),
    budget: create ? 30000 : (t?.budget_home ?? 0),
    members: "我",
    category_budgets: Object.fromEntries(
      data?.categories.map((c) => [c.category, c.planned_home]) ??
        Object.keys(categories).map((c) => [c, 0]),
    ),
  };
}
export default function Editor({
  editor,
  data,
  close,
  saved,
  reload,
}: {
  editor: EditorType;
  data?: Bundle;
  close: () => void;
  saved: (tid?: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [v, set] = useState(() => initial(editor, data)),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const errorRef = useRef<HTMLDivElement>(null),
    submission = useRef(crypto.randomUUID()),
    revision = useRef(data?.revision),
    saving = useRef(false);
  const isEdit = "row" in editor && !!editor.row,
    create = editor.kind === "trip" && editor.create,
    base = `/trips/${data?.trip.trip_id}`;
  const title = {
    expense: isEdit ? "編輯這筆支出" : "記下一筆花費",
    activity: isEdit ? "編輯行程" : "新增一個停留點",
    booking: isEdit ? "編輯預訂" : "收好一筆預訂",
    shopping: isEdit ? "編輯物品" : "想帶回家的東西",
    trip: create ? "下一趟，想去哪裡？" : "旅程與預算設定",
    currency: "更換本位幣",
  }[editor.kind];
  const change = (key: string, value: any) => {
    set((x) => ({ ...x, [key]: value }));
    setDirty(true);
  };
  const input = (
    key: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <input
      {...props}
      value={v[key] ?? ""}
      onChange={(e) => change(key, e.target.value)}
    />
  );
  const select = (key: string, options: Record<string, string>) => (
    <select value={v[key]} onChange={(e) => change(key, e.target.value)}>
      {Object.entries(options).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
  const ccy = (key = "currency", home = false) =>
    select(
      key,
      Object.fromEntries(
        (home ? homeCurrencies : currencies).map((c) => [
          c,
          `${c} · ${currencyNames[c]}`,
        ]),
      ),
    );
  const amount = (key: string, required = true) =>
    input(key, {
      type: "number",
      inputMode: "decimal",
      min: key === "amount" ? ".01" : "0",
      max: 999999999999,
      step: ".01",
      required,
    });
  const place = (
    <>
      <Field label="地點名稱">
        {input("place", { placeholder: "例如：清水寺" })}
      </Field>
      <Field label="城市或地址">
        {input("locality", { placeholder: "例如：京都" })}
      </Field>
    </>
  );
  const notes = (
    <Field label="備註" wide>
      <textarea
        rows={3}
        value={v.notes}
        maxLength={4000}
        onChange={(e) => change("notes", e.target.value)}
      />
    </Field>
  );
  const linked =
    editor.kind === "expense" && editor.row
      ? data?.shopping.find((s) => s.expense_id === editor.row!.expense_id)
      : undefined;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      let tid: string | undefined;
      if (editor.kind === "expense") {
        if (!v.split.length) throw new Error("請至少選擇一位分攤旅伴。");
        await api.write(
          `${base}/expenses`,
          {
            ...v,
            amount: Number(v.amount),
            submission_id: submission.current,
            shopping_id: editor.shopping?.item_id ?? linked?.item_id ?? null,
            replaces: editor.row?.expense_id ?? null,
          },
          "POST",
          revision.current,
        );
      } else if (editor.kind === "trip") {
        if (create) {
          const res = await api.write<{ trip_id: string }>("/trips", {
            ...v,
            budget: Number(v.budget),
            members: v.members
              .split(/[、,\n]/)
              .map((s: string) => s.trim())
              .filter(Boolean),
            category_budgets: undefined,
          });
          tid = res.trip_id;
        } else {
          const { home, members, ...body } = v;
          await api.write(
            base,
            {
              ...body,
              budget: Number(v.budget),
              category_budgets: Object.fromEntries(
                Object.entries(v.category_budgets).map(([k, n]) => [
                  k,
                  Number(n),
                ]),
              ),
            },
            "PUT",
            revision.current,
          );
        }
      } else if (editor.kind === "currency")
        await api.write(`${base}/currency`, v, "POST", revision.current);
      else {
        const kind =
            editor.kind === "activity"
              ? "activities"
              : editor.kind === "booking"
                ? "bookings"
                : "shopping",
          row = "row" in editor ? editor.row : undefined,
          id = row
            ? "booking_id" in row
              ? row.booking_id
              : row.item_id
            : undefined;
        const body = { ...v };
        for (const k of ["day", "cost", "price"])
          if (k in body)
            body[k] = body[k] === "" && k === "price" ? null : Number(body[k]);
        await api.write(
          `${base}/${kind}${id !== undefined ? `/${id}` : ""}`,
          body,
          id !== undefined ? "PUT" : "POST",
          revision.current,
        );
      }
      await saved(tid);
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(errorMessage(e));
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      if (!("row" in editor) || !editor.row) return;
      const row = editor.row,
        id =
          "expense_id" in row
            ? row.expense_id
            : "booking_id" in row
              ? row.booking_id
              : row.item_id,
        kind = {
          expense: "expenses",
          activity: "activities",
          booking: "bookings",
          shopping: "shopping",
        }[editor.kind];
      await api.remove(`${base}/${kind}/${id}`, revision.current!);
      await saved();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  const converted =
    data && editor.kind === "expense"
      ? convert(
          Number(v.amount) || 0,
          v.currency,
          data.trip.home_currency,
          data.fx,
        )
      : null;
  return (
    <Modal
      title={title}
      subtitle={
        editor.kind === "expense"
          ? "花多少、誰付款，剩下的交給旅行手帳。"
          : undefined
      }
      dirty={dirty}
      busy={busy}
      onClose={close}
    >
      <form onSubmit={submit}>
        <div className="sheet-body">
          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              className="error-banner"
              role="alert"
            >
              {error}
              {conflict && (
                <button
                  type="button"
                  onClick={async () => {
                    await reload();
                    close();
                  }}
                >
                  捨棄變更並載入最新資料
                </button>
              )}
            </div>
          )}
          {deleting ? (
            <div className="delete-confirm">
              <h3>確定刪除這筆紀錄？</h3>
              <p>
                {editor.kind === "expense"
                  ? "支出與分帳會一起重新計算；關聯的購物物品會回到未記帳狀態。"
                  : "刪除後，這筆紀錄會從旅程移除。"}
              </p>
              <Button
                variant="secondary"
                onClick={() => setDeleting(false)}
                type="button"
              >
                保留紀錄
              </Button>{" "}
              <Button
                variant="danger"
                busy={busy}
                onClick={remove}
                type="button"
              >
                確認刪除
              </Button>
            </div>
          ) : (
            <>
              {editor.kind === "expense" && (
                <>
                  <div className="amount-entry">
                    <Field label="支出金額">{amount("amount")}</Field>
                    <Field label="幣別">{ccy()}</Field>
                  </div>
                  <div className="conversion-preview">
                    {converted === null
                      ? "尚無可用匯率，請到設定更新匯率。"
                      : `約 ${money(converted, data!.trip.home_currency)}`}
                    {data?.fx.date &&
                      v.currency !== data.trip.home_currency && (
                        <small>
                          參考 {data.fx.date} 匯率；儲存時鎖定換算金額
                        </small>
                      )}
                  </div>
                  <fieldset className="choice-field">
                    <legend>花費分類</legend>
                    <div className="category-choices">
                      {Object.entries(categories).map(([k, label]) => (
                        <button
                          type="button"
                          key={k}
                          aria-pressed={v.category === k}
                          onClick={() => change("category", k)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="form-grid">
                    <Field label="花費名稱" wide>
                      {input("title", {
                        required: true,
                        maxLength: 240,
                        placeholder: "例如：巷口的咖啡與早餐",
                      })}
                    </Field>
                    <Field label="付款日期">
                      {input("when", {
                        type: "date",
                        max: data?.trip.end_date.slice(0, 10),
                        required: true,
                      })}
                    </Field>
                    <Field label="誰先付款">
                      {select(
                        "payer",
                        Object.fromEntries(
                          data!.members.map((m) => [
                            m.member_id,
                            m.display_name,
                          ]),
                        ),
                      )}
                    </Field>
                  </div>
                  <fieldset className="choice-field">
                    <legend>
                      一起分攤的人 <small>平均分攤</small>
                    </legend>
                    <div className="member-choices">
                      {data!.members.map((m) => (
                        <label key={m.member_id}>
                          <input
                            type="checkbox"
                            checked={v.split.includes(m.member_id)}
                            onChange={(e) =>
                              change(
                                "split",
                                e.target.checked
                                  ? [...v.split, m.member_id]
                                  : v.split.filter(
                                      (s: string) => s !== m.member_id,
                                    ),
                              )
                            }
                          />
                          {m.display_name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {(editor.shopping || linked) && (
                    <p className="info-banner">
                      儲存後，購物清單會同步標記為「已買到、已記帳」。
                    </p>
                  )}
                </>
              )}
              {editor.kind === "activity" && (
                <div className="form-grid">
                  <Field label="行程名稱" wide>
                    {input("title", {
                      required: true,
                      maxLength: 240,
                      placeholder: "例如：在清水寺散步",
                    })}
                  </Field>
                  <Field label="旅行第幾天">
                    {select(
                      "day",
                      Object.fromEntries(
                        Array.from({ length: data!.trip.n_days }, (_, i) => [
                          i + 1,
                          `Day ${i + 1} · ${addDays(data!.trip.start_date, i)}`,
                        ]),
                      ),
                    )}
                  </Field>
                  <Field label="開始時間">
                    {input("time", { type: "time", required: true })}
                  </Field>
                  <Field label="行程類型">{select("kind", kinds)}</Field>
                  {place}
                  <Field label="預計花費">{amount("cost")}</Field>
                  <Field label="幣別">{ccy()}</Field>
                  {notes}
                </div>
              )}
              {editor.kind === "booking" && (
                <>
                  <div className="form-grid">
                    <Field label="預訂類型">
                      {select("kind", {
                        flight: "航班",
                        hotel: "住宿",
                        reservation: "餐廳訂位",
                      })}
                    </Field>
                    <Field label="預訂名稱">
                      {input("title", {
                        required: true,
                        maxLength: 240,
                        placeholder: "例如：台北 → 關西",
                      })}
                    </Field>
                    {v.kind === "flight" && (
                      <>
                        <Field label="出發機場">
                          {input("origin", { placeholder: "TPE" })}
                        </Field>
                        <Field label="抵達機場">
                          {input("destination", { placeholder: "KIX" })}
                        </Field>
                      </>
                    )}
                    <Field label={v.kind === "hotel" ? "入住時間" : "開始時間"}>
                      {input("start", {
                        type: "datetime-local",
                        required: true,
                      })}
                    </Field>
                    <Field label="開始地時區">
                      {select("start_zone", zones)}
                    </Field>
                    <Field label={v.kind === "hotel" ? "退房時間" : "結束時間"}>
                      {input("end", { type: "datetime-local", required: true })}
                    </Field>
                    <Field label="結束地時區">
                      {select("end_zone", zones)}
                    </Field>
                    <Field label="預訂代碼">
                      {input("confirmation", { maxLength: 240 })}
                    </Field>
                    <Field label="航空公司／預訂平台">
                      {input("provider", { maxLength: 240 })}
                    </Field>
                    <Field label="航班或訂單編號">
                      {input("ref", { maxLength: 240 })}
                    </Field>
                    {v.kind !== "flight" && place}
                    <Field label="預訂金額（選填）">
                      {amount("price", false)}
                    </Field>
                    <Field label="幣別">{ccy()}</Field>
                    {notes}
                  </div>
                  <p className="info-banner">
                    請填當地時間。預訂金額不計入支出，付款後再記帳。
                  </p>
                </>
              )}
              {editor.kind === "shopping" && (
                <div className="form-grid">
                  <Field label="物品名稱" wide>
                    {input("title", {
                      required: true,
                      maxLength: 240,
                      placeholder: "例如：抹茶伴手禮",
                    })}
                  </Field>
                  <Field label="在哪裡買" wide>
                    {input("where", {
                      maxLength: 240,
                      placeholder: "店名、地區或購物提醒",
                    })}
                  </Field>
                  <Field label="預計價格">{amount("price")}</Field>
                  <Field label="幣別">{ccy()}</Field>
                </div>
              )}
              {editor.kind === "trip" && (
                <>
                  <div className="form-grid">
                    <Field label="旅程名稱" wide>
                      {input("name", {
                        required: true,
                        maxLength: 120,
                        placeholder: "例如：京都的五個秋日",
                      })}
                    </Field>
                    <Field label="出發日期">
                      {input("start", { type: "date", required: true })}
                    </Field>
                    <Field label="結束日期">
                      {input("end", {
                        type: "date",
                        required: true,
                        min: v.start,
                      })}
                    </Field>
                    {create && (
                      <Field label="本位幣" hint="預算與分帳統一以這個幣別顯示">
                        {ccy("home", true)}
                      </Field>
                    )}
                    <Field label="當地幣別">{ccy("local")}</Field>
                    <Field
                      label={`總預算${create ? "" : `（${data?.trip.home_currency}）`}`}
                    >
                      {amount("budget")}
                    </Field>
                    {create && (
                      <Field
                        label="旅伴名字"
                        hint="以逗號分隔，第一位為你自己"
                        wide
                      >
                        {input("members", {
                          required: true,
                          placeholder: "我、小安",
                        })}
                      </Field>
                    )}
                  </div>
                  {!create && (
                    <details className="advanced">
                      <summary>分配分類預算（選填）</summary>
                      <div className="form-grid">
                        {Object.entries(categories).map(([k, label]) => (
                          <Field key={k} label={label}>
                            <input
                              type="number"
                              min="0"
                              step=".01"
                              value={v.category_budgets[k]}
                              onChange={(e) =>
                                change("category_budgets", {
                                  ...v.category_budgets,
                                  [k]: e.target.value,
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
              {editor.kind === "currency" && (
                <>
                  <Field label="新的本位幣">{ccy("home", true)}</Field>
                  <p className="info-banner">
                    此操作會換算整趟旅程的預算與既有支出。原始花費幣別、金額及歷史匯率紀錄仍會保留。
                  </p>
                  <p>
                    總預算：
                    {money(
                      data!.trip.budget_home,
                      data!.trip.home_currency,
                    )} →{" "}
                    {convert(
                      data!.trip.budget_home,
                      data!.trip.home_currency,
                      v.home,
                      data!.fx,
                    ) === null
                      ? "請先更新匯率"
                      : money(
                          convert(
                            data!.trip.budget_home,
                            data!.trip.home_currency,
                            v.home,
                            data!.fx,
                          )!,
                          v.home,
                        )}
                  </p>
                </>
              )}
              {(editor.kind === "activity" || editor.kind === "booking") && (
                <details className="advanced">
                  <summary>精確地點設定（選填）</summary>
                  <Field
                    label="Google Place ID"
                    hint="有 Place ID 時，可連到精確地點；未填則以名稱搜尋。"
                  >
                    {input("google_id", { maxLength: 240 })}
                  </Field>
                </details>
              )}
            </>
          )}
        </div>
        {!deleting && (
          <footer className="sheet-footer">
            {isEdit && (
              <button
                type="button"
                className="icon-button delete-button"
                aria-label="刪除紀錄"
                onClick={() => setDeleting(true)}
                disabled={busy}
              >
                <Trash2 size={20} />
              </button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={(e) =>
                e.currentTarget
                  .closest("dialog")
                  ?.dispatchEvent(new Event("cancel", { cancelable: true }))
              }
              disabled={busy}
            >
              取消
            </Button>
            <Button type="submit" busy={busy}>
              {busy ? "儲存中…" : create ? "建立旅程" : "儲存紀錄"}
            </Button>
          </footer>
        )}
      </form>
    </Modal>
  );
}
