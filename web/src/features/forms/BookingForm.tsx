import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import { zones } from "../../lib/domain";
import type { BookingInput } from "../../lib/contracts";
import EditorShell from "./EditorShell";
import { useDraft, PlaceFields, NotesField, type FormProps } from "./shared";

type Draft = Omit<BookingInput, "price"> & { price: string };
export default function BookingForm({
  editor,
  data,
  ...actions
}: FormProps<"booking">) {
  const row = editor.row;
  const { v, change, input, select, ccy, amount, dirty, version } =
    useDraft<Draft>(
      {
        title: row?.title ?? "",
        kind: row?.kind ?? "flight",
        provider: row?.provider ?? "",
        ref: row?.ref_code ?? "",
        confirmation: row?.confirmation ?? "",
        origin: row?.origin ?? "",
        destination: row?.destination ?? "",
        start: row?.starts_at.slice(0, 16) ?? `${data.trip.start_date}T09:00`,
        end: row?.ends_at.slice(0, 16) ?? `${data.trip.start_date}T12:00`,
        start_zone: row?.start_zone ?? "Asia/Taipei",
        end_zone: row?.end_zone ?? "Asia/Tokyo",
        place: row?.place ?? "",
        locality: row?.locality ?? "",
        google_id: row?.gmaps_place_id ?? "",
        price: String(row?.price ?? ""),
        currency: row?.price_ccy ?? data.trip.local_currency,
        notes: row?.notes ?? "",
      },
      data.revision,
    );
  const zoneOptions = {
    ...zones,
    [v.start_zone]: zones[v.start_zone] ?? v.start_zone,
    [v.end_zone]: zones[v.end_zone] ?? v.end_zone,
  };
  return (
    <EditorShell
      {...actions}
      title={row ? "編輯預訂" : "收好一筆預訂"}
      dirty={dirty}
      onSubmit={async () => {
        await api.saveBooking(
          data.trip.trip_id,
          { ...v, price: v.price === "" ? null : Number(v.price) },
          version!,
          row?.booking_id,
        );
      }}
      onDelete={
        row
          ? () =>
              api.deleteItem(
                data.trip.trip_id,
                "bookings",
                row.booking_id,
                version!,
              )
          : undefined
      }
    >
      <div className="form-grid booking-form">
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
              {input("origin", { maxLength: 240, placeholder: "TPE" })}
            </Field>
            <Field label="抵達機場">
              {input("destination", { maxLength: 240, placeholder: "KIX" })}
            </Field>
          </>
        )}
        <fieldset className="booking-time-group wide">
          <legend>{v.kind === "hotel" ? "入住" : "開始"}</legend>
          <div className="form-grid">
            <Field label={v.kind === "hotel" ? "入住時間" : "開始時間"}>
              {input("start", { type: "datetime-local", required: true })}
            </Field>
            <Field label="開始地時區">
              {select("start_zone", zoneOptions)}
            </Field>
          </div>
        </fieldset>
        <fieldset className="booking-time-group wide">
          <legend>{v.kind === "hotel" ? "退房" : "結束"}</legend>
          <div className="form-grid">
            <Field label={v.kind === "hotel" ? "退房時間" : "結束時間"}>
              {input("end", { type: "datetime-local", required: true })}
            </Field>
            <Field label="結束地時區">{select("end_zone", zoneOptions)}</Field>
          </div>
        </fieldset>
        {v.kind !== "flight" && <PlaceFields value={v} onChange={change} />}
        <Field label="預訂代碼" wide>
          {input("confirmation", { maxLength: 240 })}
        </Field>
        <details className="advanced wide">
          <summary>平台、金額與備註（選填）</summary>
          <div className="form-grid">
            <Field label="航空公司／預訂平台">
              {input("provider", { maxLength: 240 })}
            </Field>
            <Field label="航班或訂單編號">
              {input("ref", { maxLength: 240 })}
            </Field>
            <Field label="預訂金額（選填）">{amount("price", false)}</Field>
            <Field label="幣別">{ccy("currency")}</Field>
            <NotesField
              value={v.notes}
              onChange={(value) => change("notes", value)}
            />
          </div>
        </details>
      </div>
      <p className="info-banner">
        請填當地時間。預訂金額不計入支出，付款後再記帳。
      </p>
    </EditorShell>
  );
}
