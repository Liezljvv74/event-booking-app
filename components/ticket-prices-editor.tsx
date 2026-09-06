"use client";

/**
 * The editor for an event's ticket prices, and the row state behind it.
 *
 * An event can be sold at several prices at once, so this is a list a person
 * adds lines to rather than a field. It is used both when creating an event
 * and when editing one on Manage events; the state lives in a hook here so
 * those two screens share the parsing and the validation rather than each
 * keeping their own copy of it.
 */

import { useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import type { TicketPriceInput } from "@/lib/repository";
import type { TicketPrice } from "@/lib/types";
import { DENSE_FIELD_CLASS } from "@/components/form-styles";

/** One line as typed, before it is money. */
export interface PriceRow {
  /**
   * A React key and nothing else. Stored prices get their ids in the
   * repository, so a line still being typed does not need one.
   */
  key: number;
  amount: string;
  includes: string;
}

const fieldClass = DENSE_FIELD_CLASS;

/** What the rows hold, in a form two of them can be compared by. */
function rowsSignature(rows: readonly PriceRow[]): string {
  return JSON.stringify(
    rows.map((row) => [row.amount.trim(), row.includes.trim()]),
  );
}

/** The signature the editor would show for prices already stored. */
export function signatureOfPrices(prices: readonly TicketPrice[]): string {
  return JSON.stringify(
    prices.map((price) => [
      formatCents(price.amountCents),
      price.includes.trim(),
    ]),
  );
}

export interface TicketPriceRows {
  rows: PriceRow[];
  add: () => void;
  removeRow: (key: number) => void;
  setAmount: (key: number, value: string) => void;
  setIncludes: (key: number, value: string) => void;
  /** Replace every line, for when the stored event changes underneath. */
  reset: (prices: readonly TicketPrice[]) => void;
  /** Ready for the repository, or the reason they are not. */
  toInputs: () => { prices: TicketPriceInput[] } | { error: string };
  signature: string;
}

/**
 * Hold the lines of the editor.
 *
 * Keys only ever count upwards, including across a reset, so a line can
 * never inherit the identity — and with it the cursor — of a line that was
 * just removed.
 */
export function useTicketPriceRows(
  initial: readonly TicketPrice[],
  options: { startWithBlank?: boolean } = {},
): TicketPriceRows {
  /**
   * The lines, and the next key to hand out, in one piece of state.
   *
   * The keys have to come from somewhere that survives a re-render and only
   * ever counts upwards. A ref would do it, but every one of these callbacks
   * would then be writing to it while React renders; keeping the counter in
   * the state means each new key is worked out inside the updater, from the
   * value that was actually current.
   */
  const [state, setState] = useState<{ rows: PriceRow[]; nextKey: number }>(
    () => {
      const existing = initial.map((price, index) => ({
        key: index,
        amount: formatCents(price.amountCents),
        includes: price.includes,
      }));

      // A fresh event opens with one empty line, so the prices are visibly
      // somewhere to be filled in rather than behind a button.
      return existing.length === 0 && options.startWithBlank === true
        ? { rows: [{ key: 0, amount: "", includes: "" }], nextKey: 1 }
        : { rows: existing, nextKey: existing.length };
    },
  );

  const rows = state.rows;

  const change = (key: number, apply: (row: PriceRow) => PriceRow) =>
    setState((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.key === key ? apply(row) : row)),
    }));

  return {
    rows,
    add: () =>
      setState((current) => ({
        rows: [
          ...current.rows,
          { key: current.nextKey, amount: "", includes: "" },
        ],
        nextKey: current.nextKey + 1,
      })),
    removeRow: (key) =>
      setState((current) => ({
        ...current,
        rows: current.rows.filter((row) => row.key !== key),
      })),
    setAmount: (key, value) =>
      change(key, (row) => ({ ...row, amount: value })),
    setIncludes: (key, value) =>
      change(key, (row) => ({ ...row, includes: value })),
    reset: (prices) =>
      setState((current) => ({
        rows: prices.map((price, index) => ({
          key: current.nextKey + index,
          amount: formatCents(price.amountCents),
          includes: price.includes,
        })),
        nextKey: current.nextKey + prices.length,
      })),
    toInputs: () => {
      const prices: TicketPriceInput[] = [];

      for (const row of rows) {
        const amount = row.amount.trim();
        const includes = row.includes.trim();

        // A line touched by nobody is not a price and not a mistake: the
        // form opens with an empty one, and adding a line then thinking
        // better of it should not have to be undone before saving.
        if (amount === "" && includes === "") continue;

        if (amount === "") {
          return {
            error: `Enter a price for "${includes}", or clear that line.`,
          };
        }

        const cents = parseCents(amount);
        if (cents === null || cents < 0) {
          return { error: `"${row.amount}" is not a price of zero or more.` };
        }

        prices.push({ amountCents: cents, includes });
      }

      return { prices };
    },
    signature: rowsSignature(rows),
  };
}

interface Props {
  control: TicketPriceRows;
  disabled?: boolean;
  /**
   * Distinguishes one editor's fields from another's on a screen showing
   * several events, for both accessible names and the data attributes.
   */
  scope?: string;
  /** Named in the accessible labels, so each field says which event it is. */
  ofWhat?: string;
}

export function TicketPricesEditor({
  control,
  disabled = false,
  scope = "",
  ofWhat = "",
}: Props) {
  const suffix = ofWhat === "" ? "" : ` of ${ofWhat}`;

  return (
    <div data-ticket-prices={scope || undefined}>
      {/* One label for the block. The fields themselves are unlabelled —
          three across leaves no room, and an amount beside a description
          reads as what it is — but without this the New event form would
          show a row of nameless boxes between the name and the date. */}
      <div className="text-xs font-medium text-ink-soft">
        Ticket prices
      </div>

      {control.rows.length > 0 && (
        <ul className="mt-1 grid gap-x-3 gap-y-1.5 @lg:grid-cols-2 @3xl:grid-cols-3">
          {control.rows.map((row, index) => (
            /* Price, what it includes, and the cross that deletes the pair,
               kept together as one group so three fit on a line. */
            <li
              key={row.key}
              data-ticket-price-row={index}
              className="grid grid-cols-[5rem_1fr_auto] items-center gap-1"
            >
              <input
                type="text"
                inputMode="decimal"
                value={row.amount}
                disabled={disabled}
                aria-label={`Ticket price ${index + 1}${suffix}`}
                data-ticket-amount={index}
                onChange={(changed) =>
                  control.setAmount(row.key, changed.target.value)
                }
                className={fieldClass}
                placeholder="0.00"
              />

              <input
                type="text"
                value={row.includes}
                disabled={disabled}
                aria-label={`What ticket price ${index + 1}${suffix} includes`}
                data-ticket-includes={index}
                onChange={(changed) =>
                  control.setIncludes(row.key, changed.target.value)
                }
                className={fieldClass}
                placeholder="What it includes"
              />

              {/* Square, so it reads as a cross rather than a word. The
                  accessible name still says which price it would delete. */}
              <button
                type="button"
                onClick={() => control.removeRow(row.key)}
                disabled={disabled}
                aria-label={`Remove ticket price ${index + 1}${suffix}`}
                title="Delete this price"
                data-ticket-remove={index}
                className="h-11 w-11 shrink-0 rounded-md border border-line text-base leading-none text-ink-soft hover:bg-muted disabled:opacity-50 sm:h-9 sm:w-9"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={control.add}
        disabled={disabled}
        data-ticket-add
        className="mt-1.5 h-9 rounded-md border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
      >
        {control.rows.length === 0
          ? "+ Add a ticket price"
          : "+ Add another price"}
      </button>
    </div>
  );
}
