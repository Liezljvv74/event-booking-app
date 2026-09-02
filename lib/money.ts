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
  const cleaned = input
    .replace(/[^\d.,-]/g, "")
    .replace(/\s/g, "")
    // Treat a comma as the decimal separator when no dot is present.
    .replace(/,(?=[^,]*$)/, (match, offset: number, whole: string) =>
      whole.includes(".") ? "" : ".",
    )
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
export function formatAmount(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Sum integer cents. Exact by construction, unlike summing floats. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
