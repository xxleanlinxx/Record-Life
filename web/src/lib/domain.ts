import type { Balance, Currency, Fx, Trip } from "./types";

export const currencies: Currency[] = [
  "TWD",
  "JPY",
  "USD",
  "EUR",
  "GBP",
  "KRW",
];
export const homeCurrencies: Currency[] = ["TWD", "USD", "EUR", "GBP"];
export const currencyNames: Record<Currency, string> = {
  TWD: "台幣",
  JPY: "日圓",
  USD: "美元",
  EUR: "歐元",
  GBP: "英鎊",
  KRW: "韓元",
};
export const categories = {
  Transport: "交通",
  Stay: "住宿",
  Food: "餐飲",
  Sights: "景點",
  Shopping: "購物",
  Other: "其他",
} as const;
export const kinds = {
  flight: "航班",
  transport: "交通",
  hotel: "住宿",
  sight: "景點",
  food: "餐飲",
  shop: "購物",
} as const;
export const categoryColors = {
  Transport: "#567790",
  Stay: "#806b9c",
  Food: "#d8824b",
  Sights: "#56917c",
  Shopping: "#bd7182",
  Other: "#818a8a",
};
export const zones: Record<string, string> = {
  "Asia/Taipei": "台北",
  "Asia/Tokyo": "東京",
  "Asia/Seoul": "首爾",
  "America/Los_Angeles": "洛杉磯 / 舊金山",
  "America/New_York": "紐約",
  "Europe/London": "倫敦",
  "Europe/Paris": "巴黎",
  UTC: "UTC",
};

export function money(amount: number, ccy: Currency) {
  const symbol = {
    TWD: "NT$",
    JPY: "¥",
    USD: "US$",
    EUR: "€",
    GBP: "£",
    KRW: "₩",
  }[ccy];
  return `${amount < 0 ? "−" : ""}${symbol}${Math.abs(amount).toLocaleString("zh-TW", { maximumFractionDigits: ccy === "JPY" || ccy === "KRW" ? 0 : 2 })}`;
}
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  fx: Fx,
): number | null {
  if (from === to) return amount;
  const a = fx.rates[from],
    b = fx.rates[to];
  return a && b && fx.date ? (amount / a) * b : null;
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dateValue(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}
export function addDays(value: string, n: number) {
  const d = dateValue(value);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round(
    (dateValue(b).getTime() - dateValue(a).getTime()) / 86400000,
  );
}
export function shortDate(value: string) {
  return dateValue(value).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}
export function weekday(value: string) {
  return dateValue(value).toLocaleDateString("zh-TW", {
    weekday: "short",
    timeZone: "UTC",
  });
}
export function phase(trip: Trip, now = today()) {
  const day = daysBetween(trip.start_date, now) + 1;
  return {
    day: Math.min(trip.n_days, Math.max(1, day)),
    left: day < 1 ? trip.n_days : Math.max(0, trip.n_days - day + 1),
    label:
      day < 1
        ? `${1 - day} 天後出發`
        : day > trip.n_days
          ? "旅行已結束"
          : `旅行第 ${day} 天`,
    before: day < 1,
    after: day > trip.n_days,
  };
}
export function mapUrl(name: string, city?: string | null, id?: string | null) {
  const p = new URLSearchParams({
    api: "1",
    query: [name, city].filter(Boolean).join(" "),
  });
  if (id) p.set("query_place_id", id);
  return `https://www.google.com/maps/search/?${p}`;
}
export function directions(a: string, b: string) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: a, destination: b, travelmode: "transit" })}`;
}
/** Allocate indivisible cents by largest remainder; preserve the aggregate balance.
 * Stable member IDs break ties so input ordering cannot change a settlement.
 * This is a settlement presentation; the original ledger precision is retained.
 */
export function settlementBalances(balances: Balance[]): Balance[] {
  const parts = balances.map((b, index) => {
    const exact = Math.round(b.balance_home * 100 * 1e6) / 1e6;
    const cents = Math.floor(exact);
    return { index, id: b.member_id, exact, cents, fraction: exact - cents };
  });
  const total = Math.round(parts.reduce((sum, b) => sum + b.exact, 0));
  const remainder = total - parts.reduce((sum, b) => sum + b.cents, 0);
  const order = [...parts].sort(
    (a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id),
  );
  for (let i = 0; i < remainder; i++) order[i].cents++;
  return parts.map((p) => ({
    ...balances[p.index],
    balance_home: p.cents / 100,
  }));
}
export function settlements(balances: Balance[]) {
  balances = settlementBalances(balances);
  const debt = balances
    .filter((b) => b.balance_home < -0.005)
    .map((b) => ({
      name: b.display_name,
      amount: Math.round(-b.balance_home * 100),
    }));
  const credit = balances
    .filter((b) => b.balance_home > 0.005)
    .map((b) => ({
      name: b.display_name,
      amount: Math.round(b.balance_home * 100),
    }));
  const result: { from: string; to: string; amount: number }[] = [];
  for (const d of debt)
    for (const c of credit) {
      const amount = Math.min(d.amount, c.amount);
      if (amount > 0) {
        result.push({ from: d.name, to: c.name, amount: amount / 100 });
        d.amount -= amount;
        c.amount -= amount;
      }
    }
  return result;
}
export function errorMessage(error: unknown) {
  const value =
    error instanceof Error ? error.message : "暫時無法完成，請再試一次。";
  const translations: Record<string, string> = {
    "Failed to fetch": "目前無法連線，輸入內容已保留。請檢查連線後再試一次。",
    "Category budgets cannot exceed the total budget.":
      "分類預算加總超過總預算，請調整後再儲存。",
    "Move itinerary items within the new trip length first.":
      "縮短旅程前，請先調整超出日期的行程。",
    "Trip end must include all recorded expenses.":
      "結束日期需包含已記錄的支出日期。",
    "Member name already exists.": "這位旅伴已經在名單中。",
    "No complete FX snapshot available. Refresh rates before saving foreign-currency expenses.":
      "還沒有可用匯率。請先更新匯率，或以本位幣記帳。",
    "Shopping item is missing or already linked to an expense.":
      "這件物品已經記過帳，請到支出紀錄確認。",
    "End time must be after start time, accounting for time zones.":
      "請確認時區與起訖時間：結束時間不能早於開始時間。",
    "Enter at least one member; member names must be unique.":
      "請至少填一位旅伴，且名字不可重複。",
  };
  return translations[value] ?? value;
}
