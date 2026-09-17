export type Currency = "TWD" | "JPY" | "USD" | "EUR" | "GBP" | "KRW";
export type Category =
  "Transport" | "Stay" | "Food" | "Sights" | "Shopping" | "Other";
export type Kind = "flight" | "transport" | "hotel" | "sight" | "food" | "shop";
export interface Trip {
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  n_days: number;
  home_currency: Currency;
  local_currency: Currency;
  budget_home: number;
}
export interface Member {
  member_id: string;
  display_name: string;
  is_owner: boolean;
}
export interface Fx {
  date: string | null;
  source: string | null;
  target_date: string;
  rates: Partial<Record<Currency, number>>;
  error?: string | null;
}
export interface Place {
  place: string | null;
  locality: string | null;
  gmaps_place_id: string | null;
}
export interface Activity extends Place {
  item_id: number;
  day_no: number;
  start_time: string;
  kind: Kind;
  title: string;
  planned_cost: number;
  planned_ccy: Currency;
  notes: string | null;
}
export interface Booking extends Place {
  booking_id: number;
  kind: "flight" | "hotel" | "reservation";
  title: string;
  provider: string | null;
  ref_code: string | null;
  confirmation: string | null;
  origin: string | null;
  destination: string | null;
  starts_at: string;
  ends_at: string;
  start_zone: string;
  end_zone: string;
  price: number | null;
  price_ccy: Currency;
  notes: string | null;
}
export interface Shopping {
  item_id: number;
  title: string;
  where_hint: string;
  planned_price: number;
  planned_ccy: Currency;
  is_bought: boolean;
  expense_id: number | null;
}
export interface Expense {
  expense_id: number;
  day_no: number;
  spent_at: string;
  title: string;
  category: Category;
  amount: number;
  currency: Currency;
  member_id: string;
  payer: string;
  amount_home: number;
  fx_rate_date: string | null;
}
export interface Daily {
  day_no: number;
  day_label: string;
  spent_home: number;
  n_entries: number;
  cum_spent_home: number;
}
export interface CategoryBudget {
  category: Category;
  planned_home: number;
  actual_home: number;
  delta_home: number;
  share_of_spend: number | null;
}
export interface Balance {
  member_id: string;
  display_name: string;
  paid_home: number;
  owed_share_home: number;
  balance_home: number;
}
export interface Bundle {
  trip: Trip;
  revision: number;
  members: Member[];
  itinerary: Activity[];
  bookings: Booking[];
  shopping: Shopping[];
  expenses: Expense[];
  splits: { expense_id: number; member_id: string; share: number }[];
  daily: Daily[];
  categories: CategoryBudget[];
  balances: Balance[];
  fx: Fx;
}
export interface Bootstrap {
  trips: Trip[];
  fx: Fx;
}
export type Editor =
  | { kind: "expense"; row?: Expense; shopping?: Shopping }
  | { kind: "activity"; row?: Activity; day?: number }
  | { kind: "booking"; row?: Booking }
  | { kind: "shopping"; row?: Shopping }
  | { kind: "trip"; create?: boolean }
  | { kind: "currency" };
export type OpenEditor = (editor: Editor) => void;
