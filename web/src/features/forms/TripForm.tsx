import EditorShell from "./EditorShell";
import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import { addDays, categories, today } from "../../lib/domain";
import type { Currency, Bundle, Editor } from "../../lib/types";
import type { HomeCurrency } from "../../lib/contracts";
import { useDraft, type EditorActions } from "./shared";
interface Draft {
  name: string;
  start: string;
  end: string;
  home: HomeCurrency;
  local: Currency;
  budget: string;
  members: string;
  category_budgets: Record<string, string>;
}
export default function TripForm({
  editor,
  data,
  ...actions
}: EditorActions & {
  editor: Extract<Editor, { kind: "trip" }>;
  data?: Bundle;
}) {
  const create = !!editor.create;
  const { v, change, input, ccy, amount, dirty, version } = useDraft<Draft>(
    {
      name: create ? "" : data!.trip.name,
      start: create ? today() : data!.trip.start_date,
      end: create ? addDays(today(), 4) : data!.trip.end_date,
      home: "TWD",
      local: create ? "JPY" : data!.trip.local_currency,
      budget: String(create ? 30000 : data!.trip.budget_home),
      members: "我",
      category_budgets: Object.fromEntries(
        Object.keys(categories).map((c) => [
          c,
          String(
            data?.categories.find((b) => b.category === c)?.planned_home ?? 0,
          ),
        ]),
      ),
    },
    data?.revision,
  );
  return (
    <EditorShell
      {...actions}
      title={create ? "下一趟，想去哪裡？" : "旅程與預算設定"}
      create={create}
      dirty={dirty}
      onSubmit={async () => {
        if (create)
          return (
            await api.createTrip({
              name: v.name,
              start: v.start,
              end: v.end,
              home: v.home,
              local: v.local,
              budget: Number(v.budget),
              members: v.members
                .split(/[、,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          ).trip_id;
        await api.updateTrip(
          data!.trip.trip_id,
          {
            name: v.name,
            start: v.start,
            end: v.end,
            local: v.local,
            budget: Number(v.budget),
            category_budgets: Object.fromEntries(
              Object.entries(v.category_budgets).map(([k, n]) => [
                k,
                Number(n),
              ]),
            ),
          },
          version!,
        );
      }}
    >
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
            <Field label="旅伴名字" hint="以逗號分隔，第一位為你自己" wide>
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
                    name={`category_budgets.${k}`}
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
    </EditorShell>
  );
}
