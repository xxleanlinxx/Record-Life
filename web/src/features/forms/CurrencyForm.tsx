import EditorShell from "./EditorShell";
import { Field } from "../../components/ui";
import { api } from "../../lib/api";
import { convert, money } from "../../lib/domain";
import { homeCurrencies } from "../../lib/domain";
import type { HomeCurrency } from "../../lib/contracts";
import { useDraft, type FormProps } from "./shared";
export default function CurrencyForm({
  data,
  ...props
}: FormProps<"currency">) {
  const { v, ccy, dirty, version } = useDraft<{ home: HomeCurrency }>(
    {
      home: homeCurrencies.find(
        (c) => c === data.trip.home_currency,
      ) as HomeCurrency,
    },
    data.revision,
  );
  const converted = convert(
    data.trip.budget_home,
    data.trip.home_currency,
    v.home,
    data.fx,
  );
  return (
    <EditorShell
      {...props}
      title="更換本位幣"
      dirty={dirty}
      onSubmit={async () => {
        await api.changeCurrency(data.trip.trip_id, v.home, version!);
      }}
    >
      <Field label="新的本位幣">{ccy("home", true)}</Field>
      <p className="info-banner">
        此操作會換算整趟旅程的預算與既有支出。原始花費幣別、金額及歷史匯率紀錄仍會保留。
      </p>
      <p>
        總預算：{money(data.trip.budget_home, data.trip.home_currency)} →{" "}
        {converted === null ? "請先更新匯率" : money(converted, v.home)}
      </p>
    </EditorShell>
  );
}
