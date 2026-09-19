import { describe, expect, it } from "vitest";
import fixtures from "../../../tests/fixtures/domain.json";
import { roundMoney } from "./money";
import { utcTime } from "./device/services";

describe("Python / TypeScript shared contracts", () => {
  it.each(fixtures.rounding)(
    "round $input to $expected",
    ({ input, expected }) => {
      expect(roundMoney(input)).toBe(expected);
    },
  );
  it.each(fixtures.times)(
    "local time $local in $zone",
    ({ local, zone, valid, utc }) => {
      if (valid) expect(utcTime(local, zone)).toBe(Date.parse(utc!));
      else expect(() => utcTime(local, zone)).toThrow();
    },
  );
});
