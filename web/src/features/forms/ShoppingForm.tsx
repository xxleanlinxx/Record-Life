import EditorShell from "./EditorShell";
import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import type { ShoppingInput } from "../../lib/contracts";
import { useDraft, type FormProps } from "./shared";
type Draft = Omit<ShoppingInput, "price"> & { price: string };
export default function ShoppingForm({
  editor,
  data,
  ...actions
}: FormProps<"shopping">) {
  const row = editor.row;
  const { input, ccy, amount, v, dirty, version } = useDraft<Draft>(
    {
      title: row?.title ?? "",
      where: row?.where_hint ?? "",
      price: String(row?.planned_price ?? 0),
      currency: row?.planned_ccy ?? data.trip.local_currency,
    },
    data.revision,
  );
  return (
    <EditorShell
      {...actions}
      title={row ? "編輯物品" : "想帶回家的東西"}
      dirty={dirty}
      onSubmit={async () => {
        await api.saveShopping(
          data.trip.trip_id,
          { ...v, price: Number(v.price) },
          version!,
          row?.item_id,
        );
      }}
      onDelete={
        row
          ? () =>
              api.deleteItem(
                data.trip.trip_id,
                "shopping",
                row.item_id,
                version!,
              )
          : undefined
      }
    >
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
        <Field label="幣別">{ccy("currency")}</Field>
      </div>
    </EditorShell>
  );
}
