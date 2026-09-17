import { describe, it, expect } from "vitest";
import {
  addDays,
  convert,
  daysBetween,
  mapUrl,
  phase,
  settlements,
  settlementBalances,
} from "./domain";
import type { Fx, Trip } from "./types";
const fx: Fx = {
  date: "2026-09-15",
  target_date: "2026-09-15",
  source: "fixture",
  rates: { USD: 1, TWD: 32, JPY: 150 },
};
describe("旅行日期與匯率", () => {
  it("跨月份日期與行前、旅後階段", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
    const trip = {
      start_date: "2026-10-01",
      end_date: "2026-10-07",
      n_days: 7,
    } as Trip;
    expect(phase(trip, "2026-09-30")).toMatchObject({
      day: 1,
      left: 7,
      before: true,
      label: "1 天後出發",
    });
    expect(phase(trip, "2026-10-08")).toMatchObject({
      day: 7,
      left: 0,
      after: true,
    });
  });
  it("同幣別不需匯率，缺少外幣資料不能假設1:1", () => {
    expect(convert(1500, "JPY", "TWD", fx)).toBe(320);
    expect(convert(100, "TWD", "TWD", { ...fx, date: null, rates: {} })).toBe(
      100,
    );
    expect(convert(100, "EUR", "TWD", fx)).toBeNull();
  });
  it("安全編碼地名與精確Place ID", () => {
    const url = new URL(mapUrl("A&B <寺>", "京都", "a/b?c"));
    expect(url.searchParams.get("query")).toBe("A&B <寺> 京都");
    expect(url.searchParams.get("query_place_id")).toBe("a/b?c");
  });
  it("結算使用整數分，避免浮點尾差", () => {
    const b = (name: string, balance: number) => ({
      member_id: name,
      display_name: name,
      balance_home: balance,
      paid_home: 0,
      owed_share_home: 0,
    });
    expect(settlements([b("A", 33.33), b("B", 66.67), b("C", -100)])).toEqual([
      { from: "C", to: "A", amount: 33.33 },
      { from: "C", to: "B", amount: 66.67 },
    ]);
  });
});

it("三人分帳的顯示與建議轉帳都結清，尾差分配不受順序影響", () => {
  const balances = [
    {
      member_id: "a",
      display_name: "A",
      paid_home: 10,
      owed_share_home: 10 / 3,
      balance_home: 20 / 3,
    },
    {
      member_id: "b",
      display_name: "B",
      paid_home: 0,
      owed_share_home: 10 / 3,
      balance_home: -10 / 3,
    },
    {
      member_id: "c",
      display_name: "C",
      paid_home: 0,
      owed_share_home: 10 / 3,
      balance_home: -10 / 3,
    },
  ];
  const rounded = settlementBalances(balances);
  expect(
    rounded.reduce((s, b) => s + Math.round(b.balance_home * 100), 0),
  ).toBe(0);
  expect(settlementBalances([...balances].reverse()).reverse()).toEqual(
    rounded,
  );
  const remaining = Object.fromEntries(
    rounded.map((b) => [b.display_name, Math.round(b.balance_home * 100)]),
  );
  for (const transfer of settlements(balances)) {
    remaining[transfer.from] += Math.round(transfer.amount * 100);
    remaining[transfer.to] -= Math.round(transfer.amount * 100);
  }
  expect(Object.values(remaining)).toEqual([0, 0, 0]);
});
