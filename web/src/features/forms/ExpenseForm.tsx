import EditorShell from "./EditorShell";
import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import { useRef } from "react";
import { convert, categories, money, today } from "../../lib/domain";
import { roundMoney } from "../../lib/money";
import type { Category } from "../../lib/types";
import type { ExpenseInput } from "../../lib/contracts";
import { useDraft, type FormProps } from "./shared";
type Draft = Omit<
  ExpenseInput,
  "amount" | "submission_id" | "shopping_id" | "replaces"
> & { amount: string };
export default function ExpenseForm({
  editor,
  data,
  ...actions
}: FormProps<"expense">) {
  const { row, shopping } = editor;
  const oldShares = (editor.splits ?? data.splits).filter(
    (s) => s.expense_id === row?.expense_id,
  );
  const { v, change, input, select, ccy, amount, dirty, version } =
    useDraft<Draft>(
      {
        title: row?.title ?? shopping?.title ?? "",
        amount: String(row?.amount ?? shopping?.planned_price ?? ""),
        currency:
          row?.currency ?? shopping?.planned_ccy ?? data.trip.local_currency,
        category: row?.category ?? (shopping ? "Shopping" : "Food"),
        when:
          row?.spent_at.slice(0, 10) ??
          (today() > data.trip.end_date ? data.trip.end_date : today()),
        payer: row?.member_id ?? data.members[0].member_id,
        split: row
          ? oldShares.map((s) => s.member_id)
          : data.members.map((m) => m.member_id),
        split_mode: "preserve",
      },
      editor.revision ?? data.revision,
    );
  const submission = useRef(crypto.randomUUID()).current;
  const linked = data.shopping.find((s) => s.expense_id === row?.expense_id);
  const preserveAmount =
    !!row &&
    v.currency === row.currency &&
    roundMoney(Number(v.amount) || 0) === row.amount;
  const converted = preserveAmount
    ? row.amount_home
    : convert(
        Number(v.amount) || 0,
        v.currency,
        data.trip.home_currency,
        data.fx,
      );
  const unequal = oldShares.some(
    (s) => Math.abs(s.share - 1 / oldShares.length) > 1e-6,
  );
  const preserveSplit =
    !!row &&
    v.split_mode === "preserve" &&
    oldShares.length === v.split.length &&
    oldShares.every((s) => v.split.includes(s.member_id));
  return (
    <EditorShell
      {...actions}
      title={row ? "編輯這筆支出" : "記下一筆花費"}
      subtitle="花多少、誰付款，剩下的交給旅行手帳。"
      dirty={dirty}
      onSubmit={async () => {
        await api.saveExpense(
          data.trip.trip_id,
          {
            ...v,
            amount: Number(v.amount),
            submission_id: submission,
            shopping_id: shopping?.item_id ?? linked?.item_id ?? null,
            replaces: row?.expense_id ?? null,
          },
          version!,
        );
      }}
      onDelete={
        row
          ? () =>
              api.deleteItem(
                data.trip.trip_id,
                "expenses",
                row.expense_id,
                version!,
              )
          : undefined
      }
    >
      <>
        <div className="amount-entry">
          <Field label="支出金額">{amount("amount")}</Field>
          <Field label="幣別">{ccy("currency")}</Field>
        </div>
        <div className="conversion-preview">
          {converted === null
            ? "尚無可用匯率，請到設定更新匯率。"
            : `約 ${money(converted, data!.trip.home_currency)}`}
          {data?.fx.date && v.currency !== data.trip.home_currency && (
            <small>
              {preserveAmount
                ? `沿用原入帳金額與 ${row?.fx_rate_date ?? "1:1"} 匯率`
                : `參考 ${data.fx.date} 匯率；儲存時鎖定換算金額`}
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
                onClick={() => change("category", k as Category)}
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
                data!.members.map((m) => [m.member_id, m.display_name]),
              ),
            )}
          </Field>
        </div>
        <fieldset className="choice-field">
          <legend>
            一起分攤的人{" "}
            <small>{preserveSplit ? "保留原分攤比例" : "平均分攤"}</small>
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
                        : v.split.filter((s: string) => s !== m.member_id),
                    )
                  }
                />
                {m.display_name}
                {preserveSplit &&
                  ` · ${Math.round((oldShares.find((s) => s.member_id === m.member_id)?.share ?? 0) * 100)}%`}
              </label>
            ))}
          </div>
        </fieldset>
        {unequal && (
          <label className="split-reset">
            <input
              type="checkbox"
              checked={v.split_mode === "equal"}
              onChange={(e) =>
                change("split_mode", e.target.checked ? "equal" : "preserve")
              }
            />
            改為平均分攤
          </label>
        )}
        {(editor.shopping || linked) && (
          <p className="info-banner">
            儲存後，購物清單會同步標記為「已買到、已記帳」。
          </p>
        )}
      </>
    </EditorShell>
  );
}
