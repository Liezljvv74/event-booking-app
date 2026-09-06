/**
 * The currencies an event can be priced in, and how one reads.
 *
 * A currency is chosen from a list rather than typed as a symbol. Typing "R"
 * says what character to put in front of a number and nothing else; choosing
 * *South African rand* says which currency the money is in, and lets the
 * browser decide how it is written — which symbol, which side of the figure it
 * goes, and what separates the thousands. Those differ by currency and by the
 * reader's own locale, and `Intl` already knows all of it.
 *
 * The list is short on purpose: the currencies a venue in this part of the
 * world is plausibly paid in, plus the ones anyone might be paid in anywhere.
 * It is a list to pick from in a second, not a reference work.
 */

export interface Currency {
  /** ISO 4217, which is what `Intl` wants and what is stored. */
  code: string;
  name: string;
}

/**
 * Rand first, as the one most likely to be wanted here, then the rest by
 * name. "None" is not in the list — it is the empty code, and the absence of
 * a currency is a real answer rather than a currency called nothing.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: "ZAR", name: "South African rand" },
  { code: "AUD", name: "Australian dollar" },
  { code: "BWP", name: "Botswana pula" },
  { code: "BRL", name: "Brazilian real" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "DKK", name: "Danish krone" },
  { code: "EUR", name: "Euro" },
  { code: "INR", name: "Indian rupee" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "MZN", name: "Mozambican metical" },
  { code: "NAD", name: "Namibian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "GBP", name: "Pound sterling" },
  { code: "SEK", name: "Swedish krona" },
  { code: "CHF", name: "Swiss franc" },
  { code: "AED", name: "UAE dirham" },
  { code: "USD", name: "US dollar" },
];

/** Whether this is a currency the app offers. The empty code means none. */
export function isKnownCurrency(code: string): boolean {
  return code === "" || CURRENCIES.some((currency) => currency.code === code);
}

/** The currency's own name, or "None" for the empty code. */
export function currencyName(code: string): string {
  if (code === "") return "None";
  return CURRENCIES.find((currency) => currency.code === code)?.name ?? code;
}
