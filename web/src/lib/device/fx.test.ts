import { describe, it, expect } from "vitest";
import { validateRates } from "./fx";
const rates = { USD: 1, TWD: 32, JPY: 150, EUR: 0.85, GBP: 0.75, KRW: 1350 };
describe("D-1 快照驗證", () => {
  it("接受假日前最近完整快照，保留來源真實日期", () => {
    expect(validateRates("2026-09-11", rates, "test", "2026-09-13").date).toBe(
      "2026-09-11",
    );
  });
  it("拒絕未來、缺幣、零值、無限值及錯誤基準", () => {
    expect(() =>
      validateRates("2026-09-14", rates, "test", "2026-09-13"),
    ).toThrow();
    const { TWD: _, ...missing } = rates;
    for (const invalid of [
      missing,
      { ...rates, TWD: 0 },
      { ...rates, JPY: Infinity },
      { ...rates, USD: 2 },
    ])
      expect(() =>
        validateRates("2026-09-11", invalid, "test", "2026-09-13"),
      ).toThrow();
  });
});
