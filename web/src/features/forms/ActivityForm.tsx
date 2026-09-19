import EditorShell from "./EditorShell";
import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import { addDays, kinds } from "../../lib/domain";
import type { ActivityInput } from "../../lib/contracts";
import { useDraft, PlaceFields, NotesField, type FormProps } from "./shared";
type Draft = Omit<ActivityInput, "day" | "cost"> & {
  day: string;
  cost: string;
};
export default function ActivityForm({
  editor,
  data,
  ...actions
}: FormProps<"activity">) {
  const row = editor.row;
  const { v, change, input, select, ccy, amount, dirty, version } =
    useDraft<Draft>(
      {
        title: row?.title ?? "",
        day: String(row?.day_no ?? editor.day ?? 1),
        time: row?.start_time ?? "09:00",
        kind: row?.kind ?? "sight",
        place: row?.place ?? "",
        locality: row?.locality ?? "",
        google_id: row?.gmaps_place_id ?? "",
        cost: String(row?.planned_cost ?? 0),
        currency: row?.planned_ccy ?? data.trip.local_currency,
        notes: row?.notes ?? "",
      },
      data.revision,
    );
  return (
    <EditorShell
      {...actions}
      title={row ? "編輯行程" : "新增一個停留點"}
      dirty={dirty}
      onSubmit={async () => {
        await api.saveActivity(
          data.trip.trip_id,
          { ...v, day: Number(v.day), cost: Number(v.cost) },
          version!,
          row?.item_id,
        );
      }}
      onDelete={
        row
          ? () =>
              api.deleteItem(
                data.trip.trip_id,
                "activities",
                row.item_id,
                version!,
              )
          : undefined
      }
    >
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
        <PlaceFields value={v} onChange={change} />
        <Field label="預計花費">{amount("cost")}</Field>
        <Field label="幣別">{ccy("currency")}</Field>
        <NotesField
          value={v.notes}
          onChange={(value) => change("notes", value)}
        />
      </div>
    </EditorShell>
  );
}
