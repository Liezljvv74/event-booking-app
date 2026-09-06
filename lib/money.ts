/**
 * Money helpers. The store holds integer cents; only these functions
 * convert to and from the decimal strings a person types or reads.
 */

/**
 * Parse user input ("250", "250.5", "R 1 250,75") into integer cents.
 * Returns null when the text holds no usable number, so callers can show a
 * validation message rather than silently storing 0.
 */
export function parseCents(input: string): number | null {
  const stripped = input.replace(/[^\d.,-]/g, "").replace(/\s/g, "");
  // A comma is the decimal separator when no dot is present, and a thousands
  // mark when one is.
  const lastComma = stripped.includes(".") ? "" : ".";
  const cleaned = stripped
    .replace(/,(?=[^,]*$)/, lastComma)
    .replace(/,/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/** Format integer cents as a plain decimal string, e.g. 125050 -> "1250.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

/**
 * Format integer cents for display using the viewer's locale.
 * No currency symbol: the spec never names a currency.
 */
export function formatAmount(cents: number, symbol = ""): string {
  const amount = (Math.round(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // A non-breaking space, so a figure never wraps away from its symbol at the
  // end of a line and leaves an R sitting on its own.
  return symbol === "" ? amount : `${symbol}\u00a0${amount}`;
}

/** Sum integer cents. Exact by construction, unlike summing floats. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
