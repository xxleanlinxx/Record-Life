import { z } from "zod";
import type { Currency, Fx } from "../types";
import { addDays, currencies, today } from "../domain";
import type { Engine } from "./engine";
export const cutoff = () => addDays(today(), -1);
export interface RateSnapshot {
  date: string;
  source: string;
  rates: Record<Currency, number>;
}
export function validateRates(
  date: string,
  rates: Record<string, number>,
  source: string,
  target = cutoff(),
): RateSnapshot {
  if (
    !z.iso.date().safeParse(date).success ||
    date > target ||
    Object.keys(rates).length !== 6 ||
    !currencies.every((c) => Number.isFinite(rates[c]) && rates[c] > 0) ||
    rates.USD !== 1
  )
    throw new Error("匯率來源未提供完整的 D-1 快照。");
  return { date, rates: rates as Record<Currency, number>, source };
}
export async function fetchRates(): Promise<RateSnapshot> {
  const target = cutoff();
  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?${new URLSearchParams({ base: "USD", quotes: currencies.filter((c) => c !== "USD").join(","), date: target })}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error();
    const records = z
      .array(
        z.object({
          date: z.iso.date(),
          base: z.literal("USD"),
          quote: z.string(),
          rate: z.number().positive(),
        }),
      )
      .length(5)
      .parse(await response.json());
    if (new Set(records.map((r) => r.date)).size !== 1) throw new Error();
    return validateRates(
      records[0].date,
      { USD: 1, ...Object.fromEntries(records.map((r) => [r.quote, r.rate])) },
      "frankfurter.dev/v2",
      target,
    );
  } catch {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error("目前無法更新匯率，保留最後一次完整快照。");
    const body = z
      .object({
        result: z.literal("success"),
        time_last_update_unix: z.number(),
        rates: z.record(z.string(), z.number()),
      })
      .parse(await response.json());
    return validateRates(
      new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10),
      Object.fromEntries(currencies.map((c) => [c, body.rates[c]])),
      "open.er-api.com",
      target,
    );
  }
}
export async function fxInfo(e: Engine): Promise<Fx> {
  const [{ date }] = await e.rows<{ date: string | null }>(
    `select max(rate_date) date from (select rate_date from dim_fx_rate where base_ccy='USD' and rate_date<=? and source<>'seed' and quote_ccy in ('USD','EUR','GBP','JPY','TWD','KRW') and rate>0 group by rate_date having count(distinct quote_ccy)=6)`,
    [cutoff()],
  );
  const rows = date
    ? await e.rows<{ quote_ccy: Currency; rate: number; source: string }>(
        "select quote_ccy,rate,source from dim_fx_rate where base_ccy='USD' and rate_date=?",
        [date],
      )
    : [];
  return {
    date,
    source: rows[0]?.source ?? null,
    target_date: cutoff(),
    rates: Object.fromEntries(rows.map((r) => [r.quote_ccy, r.rate])),
  };
}
export async function rate(e: Engine, from: Currency, to: Currency) {
  if (from === to) return { factor: 1, date: null };
  const fx = await fxInfo(e),
    a = fx.rates[from],
    b = fx.rates[to];
  if (!fx.date || !a || !b)
    throw new Error("還沒有可用匯率。請先更新匯率，或以本位幣記帳。");
  return { factor: b / a, date: fx.date };
}
export async function storeRates(e: Engine, snapshot: RateSnapshot) {
  for (const [ccy, value] of Object.entries(snapshot.rates))
    await e.exec(
      "insert or ignore into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,'USD',?,?,?)",
      [snapshot.date, ccy, value, snapshot.source],
    );
}
