/** Round decimal input half up, consistently with Python Decimal.
 * Integer arithmetic avoids binary ties such as 1.005 and 10.075.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error("金額必須是有限數值。");
  const [coefficient, exponent = "0"] = Math.abs(value).toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = BigInt(whole + fraction);
  const shift = 2 + Number(exponent) - fraction.length;
  let cents: bigint;
  if (shift >= 0) cents = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    cents = digits / divisor + ((digits % divisor) * 2n >= divisor ? 1n : 0n);
  }
  return (Math.sign(value) * Number(cents)) / 100;
}
