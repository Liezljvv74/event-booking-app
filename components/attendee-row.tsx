"use client";

import { useState } from "react";
import {
  FIELD_LABEL_CLASS,
  FIELD_SHAPE,
  TICK_SHAPE,
} from "@/components/form-styles";
import { formatCents, parseCents } from "@/lib/money";
import { tableOccupancy, type AttendeePatch } from "@/lib/repository";
import { describeTicketPrice } from "@/lib/ticket-prices";
import type { Attendee, AttendeeStatus, Event } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { enterMovesDown } from "@/components/list-keys";

const STATUS_LABELS: Record<AttendeeStatus, string> = {
  paid: "Paid",
  pay_at_venue: "Pay at venue",
  not_paying: "Not paying",
  cancelled: "Cancelled",
};

/**
 * The statuses this dropdown offers. Cancelling is not among them: it is the
 * Cancel button's job, because cancelling takes the guest out of the party
 * and there is no un-cancelling, which is too much to hang on picking a line
 * in a dropdown.
 */
const LIVE_STATUSES: readonly AttendeeStatus[] = [
  "paid",
  "pay_at_venue",
  "not_paying",
];

/**
 * How wide a party has to be before its guests can be a table.
 *
 * Seven columns have a floor of 594px — the six fixed tracks, the six gaps
 * between them and the name column with its 7rem minimum — so this is that,
 * rounded up to 38rem for a little slack.
 *
 * Asked of the **container** rather than of the window, and that is the whole
 * of the fix. A `sm:` breakpoint answers "is the screen wide", which turns out
 * not to be the question: a party card can be narrow on a very wide screen.
 * Two separate bands of width proved it. On a tablet between 640px and about
 * 830px the list is one column and a party had 398 to 526px; from 1280px the
 * list ran two abreast and each party had 494 to 574px. Both are under 594, so
 * both hid the last columns behind a sideways scroll inside the card — and no
 * viewport breakpoint can tell either of them apart from the 900px screen
 * where the same one-column layout has 658px and fits perfectly well.
 *
 * Written out in full at every use below, `@min-[38rem]/guests:` and its
 * `@max-` twin, and never assembled from a constant. Tailwind reads the source
 * text for class names it should generate CSS for; a name built at runtime by
 * interpolating a prefix is a name it never sees, and the utility simply does
 * not exist in the stylesheet. Which is silent — the markup looks right, the
 * class is on the element, and nothing happens.
 */

/**
 * One grid template shared by the header and every row, so the columns line
 * up without a real table — and only once the party is wide enough to hold
 * it. Below that a guest is a stacked card carrying its own field names, and
 * the header goes away.
 *
 * The fields are in one order either way. The card stacks that order top to
 * bottom, the grid lays the same order out left to right, and nothing is
 * moved by `order-*` or by a grid line — so Tab, and a screen reader, follow
 * the eye in the card exactly as they do in the table. Agreeing on one order
 * is what put Status up beside the name and moved Regular down beside the
 * cross: a card has to say who this guest is and whether they have paid
 * before it says anything else, and the row has to read the way the card
 * does.
 */
export const ATTENDEE_GRID =
  "@min-[38rem]/guests:grid @min-[38rem]/guests:items-center " +
  "@min-[38rem]/guests:gap-2 " +
  "@min-[38rem]/guests:grid-cols-[1.25rem_minmax(7rem,1fr)_8rem_5rem_7rem_3.5rem_2.5rem]";

/**
 * The party declares itself the thing those columns measure against. Named,
 * so the query cannot be answered by some other container added later.
 */
export const ATTENDEE_CONTAINER = "@container/guests";

/**
 * A last resort rather than the mechanism. The container query is what keeps
 * the columns from overflowing; this is here so that if one ever does grow
 * past its floor, the party scrolls and not the page. No panel hangs inside
 * the guest area, so the `overflow-y` that `overflow-x` promotes to `auto`
 * has nothing to clip — which it did have in the section nav.
 */
export const ATTENDEE_OVERFLOW = "@min-[38rem]/guests:overflow-x-auto";

/** A guest field: thumb-sized on the card, tightened in the table. */
const GUEST_FIELD_CLASS =
  `h-11 text-base ${FIELD_SHAPE} ` +
  "@min-[38rem]/guests:h-9 @min-[38rem]/guests:text-sm";

/** A field name above it on the card, gone once the header carries it. */
const GUEST_LABEL_CLASS =
  `mb-0.5 block @min-[38rem]/guests:hidden ${FIELD_LABEL_CLASS}`;

/** A tick box: a thumb's width on the card, a pointer's in the table. */
export const GUEST_TICK_CLASS =
  `h-5 w-5 ${TICK_SHAPE} ` +
  "@min-[38rem]/guests:h-4 @min-[38rem]/guests:w-4 " +
  "@min-[38rem]/guests:justify-self-center";

/**
 * Cancelling a guest, which is the one thing on this row that cannot be
 * undone.
 *
 * On the card it is fenced off below a red rule and says what it does in
 * words: the fields above it are all thumb-sized there, and a bare cross
 * among them is too easy to hit by accident. In the table it stays the square
 * cross it has always been — one of these sits on every guest of every party,
 * and the word said the same thing a dozen times down a column.
 *
 * Every colour is stated once for the card and once for the table, as a
 * `@max-`/`@min-` pair that cannot both apply. Two unprefixed utilities for
 * one property would leave the winner to whichever Tailwind happened to emit
 * last, which is how the orange lost to the black the first time.
 */
const CANCEL_CLASS =
  "rounded-md border leading-none disabled:opacity-50 " +
  "@max-[38rem]/guests:h-11 @max-[38rem]/guests:w-full " +
  "@max-[38rem]/guests:border-red-300 @max-[38rem]/guests:text-sm " +
  "@max-[38rem]/guests:font-medium @max-[38rem]/guests:text-red-700 " +
  "@max-[38rem]/guests:hover:bg-red-50 " +
  "dark:@max-[38rem]/guests:border-red-800 " +
  "dark:@max-[38rem]/guests:text-red-400 " +
  "dark:@max-[38rem]/guests:hover:bg-red-950/40 " +
  "@min-[38rem]/guests:h-9 @min-[38rem]/guests:w-9 " +
  "@min-[38rem]/guests:justify-self-center " +
  "@min-[38rem]/guests:border-zinc-300 @min-[38rem]/guests:text-base " +
  "@min-[38rem]/guests:text-zinc-700 @min-[38rem]/guests:hover:bg-zinc-100 " +
  "dark:@min-[38rem]/guests:border-zinc-700 " +
  "dark:@min-[38rem]/guests:text-zinc-300 " +
  "dark:@min-[38rem]/guests:hover:bg-zinc-900";

/**
 * Option values in the ticket column that are not one of the event's prices:
 * the amount this guest is on when it is off the event's list, and the choice
 * that opens the box to type an amount.
 */
const OFF_LIST = "off-list";
const CUSTOM = "custom";

interface Props {
  event: Event;
  attendee: Attendee;
  /** Position in the party, used to label a guest who has no name yet. */
  position: number;
  /** Ticked for a batch move. Guests are picked one by one, not by party. */
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onPatch: (patch: AttendeePatch) => Promise<unknown>;
  /** Put this guest on the standing list of regulars, or take them off it. */
  onSetRegular: (regular: boolean) => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  /**
   * Enter was pressed on the last guest of the party. Adds another and, once
   * it is on the screen, takes the cursor to the same column of it — so a
   * party is typed straight down without reaching for the + between guests.
   */
  onAddGuest: () => Promise<unknown>;
}

export function AttendeeRow({
  event,
  attendee,
  position,
  selected,
  onSelect,
  onPatch,
  onSetRegular,
  onCancel,
  onAddGuest,
}: Props) {
  const [name, setName] = useState(attendee.name);
  const [price, setPrice] = useState(formatCents(attendee.ticketPriceCents));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * True while the price is being typed rather than picked. Set by choosing
   * "Another amount", and cleared once the typed amount is committed, so the
   * cell goes back to the dropdown showing whatever was entered.
   */
  const [typing, setTyping] = useState(false);

  // The stored values win when they change underneath, so a refused edit does
  // not leave a field showing something that was never saved. Adjusted during
  // render because an effect would render the stale value first.
  const [lastName, setLastName] = useState(attendee.name);
  if (lastName !== attendee.name) {
    setLastName(attendee.name);
    setName(attendee.name);
  }
  const [lastPrice, setLastPrice] = useState(attendee.ticketPriceCents);
  if (lastPrice !== attendee.ticketPriceCents) {
    setLastPrice(attendee.ticketPriceCents);
    setPrice(formatCents(attendee.ticketPriceCents));
  }

  // Ignoring this guest, so the table they already sit at does not count
  // itself as full.
  const seating = tableOccupancy(event, attendee.id);

  // Which of the event's prices this guest is on. Matched on the amount,
  // because a guest records what they are charged and not which price it came
  // from; two prices of the same amount are the same charge either way.
  const matched = event.ticketPrices.find(
    (candidate) => candidate.amountCents === attendee.ticketPriceCents,
  );
  const onList = event.ticketPrices.length > 0;

  async function apply(patch: AttendeePatch, revert?: () => void) {
    setBusy(true);
    setError("");
    try {
      await onPatch(patch);
    } catch (caught) {
      setError(describeError(caught));
      revert?.();
    } finally {
      setBusy(false);
    }
  }

  function commitName() {
    if (name === attendee.name) return;
    void apply({ name }, () => setName(attendee.name));
  }

  function commitPrice() {
    const cents = parseCents(price);
    if (cents === null || cents < 0) {
      setError("Enter a ticket price of zero or more.");
      setPrice(formatCents(attendee.ticketPriceCents));
      return;
    }
    if (cents === attendee.ticketPriceCents) return;
    void apply({ ticketPriceCents: cents }, () =>
      setPrice(formatCents(attendee.ticketPriceCents)),
    );
  }

  return (
    /**
     * A card on a phone, a bare row from `sm` up. The border is what tells
     * one guest from the next once their fields are stacked; in the grid the
     * columns lining up do that job already, and a border round every row
     * would be ten boxes where a list is wanted.
     */
    <li
      data-attendee={attendee.id}
      data-list-row
      // Enter moves down the column; every field in the row bubbles to here.
      onKeyDown={enterMovesDown(onAddGuest)}
      className="rounded-md border border-zinc-200 p-2 @min-[38rem]/guests:rounded-none @min-[38rem]/guests:border-0 @min-[38rem]/guests:p-0 dark:border-zinc-800"
    >
      <div className={ATTENDEE_GRID}>
        {/* Who this is: the tick that takes them on a batch move, and the
            name. First on the card and first in the row.

            The wrapper is a line of its own on a phone and `contents` from
            `sm` up, where it dissolves and hands both fields straight to the
            grid as its first two columns. Every group below works the same
            way, which is what lets one order serve both layouts. */}
        <div className="flex items-center gap-2 @min-[38rem]/guests:contents">
          <input
            type="checkbox"
            checked={selected}
            disabled={busy}
            aria-label={`Select guest ${position} to move`}
            data-select-attendee={attendee.id}
            onChange={(changed) => onSelect(changed.target.checked)}
            className={GUEST_TICK_CLASS}
          />

          <input
            type="text"
            value={name}
            disabled={busy}
            placeholder={`Guest ${position}`}
            aria-label={`Name of guest ${position}`}
            data-attendee-name={attendee.id}
            data-list-field="name"
            onChange={(changed) => setName(changed.target.value)}
            onBlur={commitName}
            onKeyDown={(pressed) => {
              if (pressed.key === "Enter") {
                pressed.preventDefault();
                commitName();
              }
            }}
            className={GUEST_FIELD_CLASS}
          />
        </div>

        {/* Straight under the name, because whether a guest has paid is the
            other thing worth knowing before any of the detail. */}
        <div className="mt-2 @min-[38rem]/guests:contents">
          <span aria-hidden="true" className={GUEST_LABEL_CLASS}>
              Status
            </span>
          <select
            value={attendee.status}
            disabled={busy}
            aria-label={`Status of guest ${position}`}
            data-attendee-status={attendee.id}
            data-list-field="status"
            onChange={(changed) =>
              void apply({ status: changed.target.value as AttendeeStatus })
            }
            className={GUEST_FIELD_CLASS}
          >
            {LIVE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {/* Where they sit and what they are charged: the detail of the
            booking, below the name and the status that identify it. Two
            abreast on a phone — both are short, and a card that has to be
            scrolled past ten times cannot spend a whole line on each. */}
        <div className="mt-2 grid grid-cols-2 gap-2 @min-[38rem]/guests:contents">
          <div className="@min-[38rem]/guests:contents">
            <span aria-hidden="true" className={GUEST_LABEL_CLASS}>
              Table
            </span>
            <select
              value={attendee.assignedTableNumber ?? ""}
              disabled={busy}
              aria-label={`Table for guest ${position}`}
              data-attendee-table={attendee.id}
              data-list-field="table"
              onChange={(changed) =>
                void apply({
                  assignedTableNumber:
                    changed.target.value === ""
                      ? null
                      : Number(changed.target.value),
                })
              }
              className={GUEST_FIELD_CLASS}
            >
              <option value="">-</option>
              {seating.map((entry) => {
                const current =
                  entry.tableNumber === attendee.assignedTableNumber;
                // Offered but unselectable beats accepted then refused. Never
                // the guest's own table, which they are entitled to stay at.
                const full = !current && entry.free === 0;
                return (
                  <option
                    key={entry.tableNumber}
                    value={entry.tableNumber}
                    disabled={full}
                  >
                    {/* The chosen option's text is what the closed field
                        shows, and the column fits a number and no more. So
                        the free seats are spelled out on the tables this
                        guest could move to, not on the one they are at. */}
                    {current
                      ? entry.tableNumber
                      : full
                        ? `${entry.tableNumber} · full`
                        : `${entry.tableNumber} · ${entry.free} free`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* A guest is priced by picking one of the event's prices, since
              that is what almost every guest is on. Typing an amount is
              still open to whoever needs it, behind the last option — and it
              is the only control on an event whose prices were never set. */}
          <div className="@min-[38rem]/guests:contents">
            <span aria-hidden="true" className={GUEST_LABEL_CLASS}>
              Ticket
            </span>
            {onList && !typing ? (
              <select
                value={matched?.id ?? OFF_LIST}
                disabled={busy}
                aria-label={`Ticket price for guest ${position}`}
                data-attendee-price-choice={attendee.id}
                data-list-field="ticket"
                onChange={(changed) => {
                  const picked = changed.target.value;
                  if (picked === CUSTOM) {
                    setTyping(true);
                    return;
                  }
                  const chosen = event.ticketPrices.find(
                    (candidate) => candidate.id === picked,
                  );
                  // A refused change leaves the store untouched, and the
                  // dropdown reads from the store, so there is nothing to
                  // put back.
                  if (chosen !== undefined) {
                    void apply({ ticketPriceCents: chosen.amountCents });
                  }
                }}
                className={GUEST_FIELD_CLASS}
              >
                {event.ticketPrices.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {/* The chosen option's text is what the closed field
                        shows, and the column fits an amount and no more. So
                        what a price includes is spelled out on the prices
                        this guest could move to, not on the one they are
                        already on. */}
                    {candidate.id === matched?.id
                      ? formatCents(candidate.amountCents)
                      : describeTicketPrice(candidate)}
                  </option>
                ))}
                {/* An amount typed by hand, or one left behind by an event
                    whose prices have since changed. Shown so the field
                    states what the guest is actually being charged. */}
                {matched === undefined && (
                  <option value={OFF_LIST}>
                    {formatCents(attendee.ticketPriceCents)}
                  </option>
                )}
                <option value={CUSTOM}>Another amount…</option>
              </select>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={price}
                disabled={busy}
                autoFocus={typing}
                aria-label={`Ticket price for guest ${position}`}
                data-attendee-price={attendee.id}
                /* The same column name as the dropdown beside it. The ticket
                   column is one column whichever control is standing in it,
                   and naming them apart meant Enter from the typed box looked
                   for a box the row below has not got — found nothing below
                   it, and added a guest instead of moving down. */
                data-list-field="ticket"
                onChange={(changed) => setPrice(changed.target.value)}
                onBlur={() => {
                  commitPrice();
                  setTyping(false);
                }}
                onKeyDown={(pressed) => {
                  if (pressed.key === "Enter") {
                    pressed.preventDefault();
                    commitPrice();
                    setTyping(false);
                  }
                }}
                className={GUEST_FIELD_CLASS}
              />
            )}
          </div>
        </div>

        {/* Last of the fields, because it is about the person rather than
            about this event: a regular is written into the next event at the
            same table when it is created. It used to sit between the name and
            the table, which is the place a phone card can least afford it —
            the two things a card must say first are the name and the status. */}
        <div className="mt-2 flex items-center gap-2 @min-[38rem]/guests:contents">
          <input
            type="checkbox"
            checked={attendee.regularId !== null}
            disabled={busy}
            aria-label={
              name.trim() === ""
                ? `Guest ${position} is a regular`
                : `${name.trim()} is a regular`
            }
            title="A regular: on the standing list, carried into every new event at this table"
            data-attendee-regular={attendee.id}
            data-list-field="regular"
            onChange={(changed) => {
              const wanted = changed.target.checked;
              setBusy(true);
              setError("");
              void onSetRegular(wanted)
                .catch((caught: unknown) => setError(describeError(caught)))
                .finally(() => setBusy(false));
            }}
            className={GUEST_TICK_CLASS}
          />
          <span
            aria-hidden="true"
            className={`@min-[38rem]/guests:hidden ${FIELD_LABEL_CLASS}`}
          >
            Regular
          </span>
        </div>

        {/* The danger area of the card: one control, below a red rule, with
            nothing else within reach of it. Dissolved from `sm` up, where the
            cross is simply the last column.

            It names the guest rather than their position. The word it
            replaced said "Cancel" and the accessible name said "Cancel guest
            3", neither of which is a person; a cross has nothing but its
            name, so the name should be the one thing that tells them apart. */}
        <div className="mt-2 border-t border-red-200 pt-2 @min-[38rem]/guests:contents dark:border-red-900/60">
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            aria-label={
              name.trim() === ""
                ? `Cancel guest ${position}`
                : `Cancel ${name.trim()}`
            }
            title="Cancel this guest"
            data-cancel-attendee={attendee.id}
            className={CANCEL_CLASS}
          >
            <span className="@min-[38rem]/guests:hidden">Cancel guest</span>
            <span aria-hidden="true" className="hidden @min-[38rem]/guests:inline">
              ×
            </span>
          </button>
        </div>
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="mt-1 mb-1 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </li>
  );
}
