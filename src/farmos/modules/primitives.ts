import Decimal from "decimal.js";
export function cents(value: string | number) {
  const d = new Decimal(value);
  if (!d.isFinite() || d.isNegative() || d.decimalPlaces() > 2)
    throw Error("Money must be nonnegative dollars with at most two decimals.");
  const n = d.mul(100).toNumber();
  if (!Number.isSafeInteger(n)) throw Error("Money exceeds supported range.");
  return n;
}

export const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value / 100,
  );

export const qty = (value: Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(6).toNumber();

export function requirePositive(value: number, label = "Quantity") {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    new Decimal(value).decimalPlaces() > 6
  )
    throw Error(label + " must be positive with at most six decimals.");
}
