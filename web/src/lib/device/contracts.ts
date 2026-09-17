import { z } from "zod";
const text = z.string().trim().max(240),
  required = text.min(1),
  money = z.number().finite().nonnegative().max(999999999999);
const ccy = z.enum(["TWD", "USD", "EUR", "GBP", "JPY", "KRW"]),
  home = z.enum(["TWD", "USD", "EUR", "GBP"]),
  category = z.enum([
    "Transport",
    "Stay",
    "Food",
    "Sights",
    "Shopping",
    "Other",
  ]);
const date = z.iso.date(),
  place = {
    place: text.default(""),
    locality: text.default(""),
    google_id: text.default(""),
  },
  notes = z.string().max(4000).default("");
export const tripCreate = z.object({
  name: required.max(120),
  start: date,
  end: date,
  home,
  local: ccy,
  budget: money,
  members: z.array(required.max(80)).min(1).max(50),
});
export const tripEdit = z.object({
  name: required.max(120),
  start: date,
  end: date,
  local: ccy,
  budget: money,
  category_budgets: z.record(z.string(), money),
});
export const expense = z.object({
  title: required,
  category,
  amount: money.min(0.01),
  currency: ccy,
  when: date,
  payer: required,
  split: z.array(required).min(1).max(50),
  submission_id: required.min(8).max(100),
  shopping_id: z.number().int().positive().nullable().optional(),
  replaces: z.number().int().positive().nullable().optional(),
});
export const activity = z.object({
  day: z.number().int().min(1).max(366),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  kind: z.enum(["flight", "transport", "hotel", "sight", "food", "shop"]),
  title: required,
  ...place,
  cost: money,
  currency: ccy,
  notes,
});
export const booking = z.object({
  kind: z.enum(["flight", "hotel", "reservation"]),
  title: required,
  provider: text.default(""),
  ref: text.default(""),
  confirmation: text.default(""),
  origin: text.default(""),
  destination: text.default(""),
  start: z.iso.datetime({ local: true }),
  end: z.iso.datetime({ local: true }),
  start_zone: required,
  end_zone: required,
  ...place,
  price: money.nullable(),
  currency: ccy,
  notes,
});
export const shopping = z.object({
  title: required,
  where: text.default(""),
  price: money,
  currency: ccy,
});
export const member = z.object({ name: required.max(80) }),
  currencyChange = z.object({ home }),
  bought = z.object({ bought: z.boolean() });
