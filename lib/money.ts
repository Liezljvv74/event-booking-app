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
export function formatAmount(cents: number, currency = ""): string {
  const value = Math.round(cents) / 100;

  // Always two decimals, currency or no currency. The store holds hundredths
  // of a unit whatever the currency is called, and `Intl` would round a yen
  // figure to whole yen — showing a number that is not the number that was
  // typed. Faithful beats conventional here.
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  if (currency === "") return value.toLocaleString(undefined, digits);

  // Which symbol, which side of the figure it sits and what separates the
  // thousands all differ by currency and by the reader's own locale, and this
  // knows all of it. `narrowSymbol` prefers "R" to "ZAR"; it is missing from
  // some engines, and an unknown code throws, so both fall back rather than
  // break a screen over a number's decoration.
  try {
    return value.toLocaleString(undefined, {
      ...digits,
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
  } catch {
    try {
      return value.toLocaleString(undefined, {
        ...digits,
        style: "currency",
        currency,
      });
    } catch {
      return value.toLocaleString(undefined, digits);
    }
  }
}

/** Sum integer cents. Exact by construction, unlike summing floats. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
