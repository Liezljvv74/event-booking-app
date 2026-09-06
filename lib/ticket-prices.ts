/**
 * Reading an event's ticket prices: which one a new guest starts on, and how
 * one reads on screen. Shared by the New booking form and the guest rows, so
 * a price is offered the same way wherever a guest is priced.
 */

import { formatAmount } from "./money";
import type { TicketPrice } from "./types";

/**
 * The lowest of an event's prices, or undefined when it has none.
 *
 * A new guest starts here rather than on whichever price happens to have
 * been entered first. The cheapest is what a party is quoted unless they ask
 * for the fuller ticket, so it is the answer that needs no thought in the
 * common case — and a default nobody looked at then undercharges rather than
 * billing someone for something they never agreed to.
 *
 * Ties keep the price entered first, so the choice does not move about.
 */
export function cheapestTicketPrice(
  prices: readonly TicketPrice[],
): TicketPrice | undefined {
  return prices.reduce<TicketPrice | undefined>(
    (cheapest, price) =>
      cheapest === undefined || price.amountCents < cheapest.amountCents
        ? price
        : cheapest,
    undefined,
  );
}

/** "500.00 — Dinner, drinks, table wine", or just the amount if it says nothing. */
export function describeTicketPrice(price: TicketPrice, symbol = ""): string {
  const amount = formatAmount(price.amountCents, symbol);
  return price.includes === "" ? amount : `${amount} — ${price.includes}`;
}
