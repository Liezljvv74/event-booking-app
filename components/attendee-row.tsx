"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useDismiss } from "@/components/use-dismiss";

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
 * Asked of the **container** rather than of the window. A `sm:` breakpoint
 * answers "is the screen wide", which turns out not to be the question: a
 * party card can be narrow on a very wide screen. Two separate bands of width
 * proved it. On a tablet between 640px and about 830px the list is one column
 * and a party had 398 to 526px; from 1280px the list ran two abreast and each
 * party had 494 to 574px. Both are under 594, so both hid the last columns —
 * and no viewport breakpoint can tell either of them apart from the 900px
 * screen where the same one-column layout has 658px and fits perfectly well.
 *
 * Written out in full at every use below, `@min-[38rem]/guests:` and its
 * `@max-` twin, and never assembled from a constant. Tailwind reads the source
 * text for class names it should generate CSS for; a name built at run time is
 * a name it never sees, and the utility simply does not exist in the
 * stylesheet. Which is silent — the markup looks right, the class is on the
 * element, and nothing happens.
 */

/**
 * One grid template shared by the header and every row, so the columns line
 * up without a real table — and only once the party is wide enough to hold
 * it. Below that a guest is one compact line and the full detail moves behind
 * a tap; see `AttendeeRow`.
 *
 * The fields are in one order either way, and nothing is moved by `order-*`
 * or by a grid line, so Tab and a screen reader follow the eye. Agreeing on
 * one order is what put Status up beside the name and moved Regular down
 * beside the cross.
 */
export const ATTENDEE_GRID =
  "@min-[38rem]/guests:grid @min-[38rem]/guests:items-center " +
  "@min-[38rem]/guests:gap-2 " +
  "@min-[38rem]/guests:grid-cols-[1.25rem_minmax(7rem,1fr)_8rem_5rem_7rem_3.5rem_2.5rem]";

/**
 * The party declares itself the thing those columns measure against. Named,
 * so the query cannot be answered by some other container added later.
 *
 * The detail modal declares it too, on its own panel, at a width below the
 * threshold — which is how the same fields render there in exactly the
 * stacked shape they had when they were the phone layout, with no second copy
 * of the styling. The modal is portalled to `<body>` and so has no other
 * container above it to answer the query.
 */
export const ATTENDEE_CONTAINER = "@container/guests";

/**
 * A last resort rather than the mechanism. The container query is what keeps
 * the columns from overflowing; this is here so that if one ever does grow
 * past its floor, the party scrolls and not the page.
 */
export const ATTENDEE_OVERFLOW = "@min-[38rem]/guests:overflow-x-auto";

/** A guest field: thumb-sized in the detail, tightened in the table. */
const GUEST_FIELD_CLASS =
  `h-11 w-full text-base ${FIELD_SHAPE} ` +
  "@min-[38rem]/guests:h-9 @min-[38rem]/guests:text-sm";

/** A field name above it in the detail, gone once the header carries it. */
const GUEST_LABEL_CLASS =
  `mb-0.5 block @min-[38rem]/guests:hidden ${FIELD_LABEL_CLASS}`;

/** A tick box: a thumb's width in the detail, a pointer's in the table. */
export const GUEST_TICK_CLASS =
  `h-5 w-5 ${TICK_SHAPE} ` +
  "@min-[38rem]/guests:h-4 @min-[38rem]/guests:w-4 " +
  "@min-[38rem]/guests:justify-self-center";

/**
 * Cancelling a guest, which is the one thing here that cannot be undone.
 *
 * In the detail it is fenced off below a red rule and says what it does in
 * words: the fields above it are all thumb-sized there, and a bare cross
 * among them is too easy to hit by accident. In the table it stays the square
 * cross it has always been — one of these sits on every guest of every party,
 * and the word said the same thing a dozen times down a column.
 *
 * Every colour is stated once for the detail and once for the table, as a
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

/** What a guest is called when they have no name yet. */
function guestLabel(name: string, position: number): string {
  return name.trim() === "" ? `Guest ${position}` : name.trim();
}

/**
 * The table dropdown, which two places want: the compact line, where it is
 * the one field that can be changed without opening anything, and the full
 * detail beside every other field.
 *
 * Written once because the option list is the interesting part — free seats
 * counted per table, the full ones offered but unselectable, and the guest's
 * own table never counted against them.
 */
function TableSelect({
  event,
  attendee,
  position,
  busy,
  onChoose,
  className,
  hook,
  listField,
}: {
  event: Event;
  attendee: Attendee;
  position: number;
  busy: boolean;
  onChoose: (tableNumber: number | null) => void;
  className: string;
  /** The `data-` attribute this copy answers to, so the two are told apart. */
  hook: "table" | "table-quick";
  /** Only the copy inside a list of rows takes part in Enter navigation. */
  listField: boolean;
}) {
  // Ignoring this guest, so the table they already sit at does not count
  // itself as full.
  const seating = tableOccupancy(event, attendee.id);

  return (
    <select
      value={attendee.assignedTableNumber ?? ""}
      disabled={busy}
      aria-label={`Table for guest ${position}`}
      {...(hook === "table"
        ? { "data-attendee-table": attendee.id }
        : { "data-attendee-table-quick": attendee.id })}
      {...(listField ? { "data-list-field": "table" } : {})}
      onChange={(changed) =>
        onChoose(
          changed.target.value === "" ? null : Number(changed.target.value),
        )
      }
      className={className}
    >
      <option value="">-</option>
      {seating.map((entry) => {
        const current = entry.tableNumber === attendee.assignedTableNumber;
        // Offered but unselectable beats accepted then refused. Never the
        // guest's own table, which they are entitled to stay at.
        const full = !current && entry.free === 0;
        return (
          <option key={entry.tableNumber} value={entry.tableNumber} disabled={full}>
            {/* The chosen option's text is what the closed field shows, and
                the column fits a number and no more. So the free seats are
                spelled out on the tables this guest could move to, not on the
                one they are already at. */}
            {current
              ? entry.tableNumber
              : full
                ? `${entry.tableNumber} · full`
                : `${entry.tableNumber} · ${entry.free} free`}
          </option>
        );
      })}
    </select>
  );
}

/**
 * Every field of one guest: the move tick, the name, the status, the table,
 * the ticket price, the Regular tick and Cancel guest.
 *
 * One definition, two homes. Above the threshold it is the row of a table,
 * and the wrappers inside it are `contents` so the fields hand themselves
 * straight to the party's grid. Below it, it is the body of the detail modal,
 * where the same wrappers are lines of a stacked card — which is what the
 * phone layout was before the compact line took its place, unchanged.
 */
function GuestFields({
  event,
  attendee,
  position,
  selected,
  onSelect,
  onPatch,
  onSetRegular,
  onCancel,
  busy,
  setBusy,
  error,
  setError,
  showSelect,
  enterNav,
}: {
  event: Event;
  attendee: Attendee;
  position: number;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onPatch: (patch: AttendeePatch) => Promise<unknown>;
  onSetRegular: (regular: boolean) => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  error: string;
  setError: (error: string) => void;
  /**
   * The batch-move tick. It belongs to a list of rows and means nothing in a
   * modal about one guest, so the modal leaves it out.
   */
  showSelect: boolean;
  /** Whether these fields are a row Enter can walk down. */
  enterNav: boolean;
}) {
  const [name, setName] = useState(attendee.name);
  const [price, setPrice] = useState(formatCents(attendee.ticketPriceCents));
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

  const field = (column: string) =>
    enterNav ? { "data-list-field": column } : {};

  return (
    <>
      <div className={ATTENDEE_GRID}>
        {/* Who this is: the tick that takes them on a batch move, and the
            name. First in the detail and first in the row.

            The wrapper is a line of its own in the detail and `contents`
            above the threshold, where it dissolves and hands both fields
            straight to the grid as its first two columns. Every group below
            works the same way, which is what lets one order serve both. */}
        <div className="flex items-center gap-2 @min-[38rem]/guests:contents">
          {showSelect ? (
            <input
              type="checkbox"
              checked={selected}
              disabled={busy}
              aria-label={`Select guest ${position} to move`}
              data-select-attendee={attendee.id}
              onChange={(changed) => onSelect(changed.target.checked)}
              className={GUEST_TICK_CLASS}
            />
          ) : (
            /* The grid wants seven columns whether or not the tick is drawn,
               so its cell is held open rather than closed up. */
            <span aria-hidden="true" className="hidden @min-[38rem]/guests:block" />
          )}

          <input
            type="text"
            value={name}
            disabled={busy}
            placeholder={`Guest ${position}`}
            aria-label={`Name of guest ${position}`}
            data-attendee-name={attendee.id}
            {...field("name")}
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
            {...field("status")}
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
            abreast in the detail — both are short. */}
        <div className="mt-2 grid grid-cols-2 gap-2 @min-[38rem]/guests:contents">
          <div className="@min-[38rem]/guests:contents">
            <span aria-hidden="true" className={GUEST_LABEL_CLASS}>
              Table
            </span>
            <TableSelect
              event={event}
              attendee={attendee}
              position={position}
              busy={busy}
              hook="table"
              listField={enterNav}
              onChoose={(tableNumber) =>
                void apply({ assignedTableNumber: tableNumber })
              }
              className={GUEST_FIELD_CLASS}
            />
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
                {...field("ticket")}
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
                {...field("ticket")}
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
            same table when it is created. */}
        <div className="mt-2 flex items-center gap-2 @min-[38rem]/guests:contents">
          <input
            type="checkbox"
            checked={attendee.regularId !== null}
            disabled={busy}
            aria-label={`${guestLabel(name, position)} is a regular`}
            title="A regular: on the standing list, carried into every new event at this table"
            data-attendee-regular={attendee.id}
            {...field("regular")}
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

        {/* The danger area: one control, below a red rule, with nothing else
            within reach of it. Dissolved above the threshold, where the cross
            is simply the last column.

            It names the guest rather than their position. The word it
            replaced said "Cancel" and the accessible name said "Cancel guest
            3", neither of which is a person; a cross has nothing but its
            name, so the name should be the one thing that tells them apart. */}
        <div className="mt-2 border-t border-red-200 pt-2 @min-[38rem]/guests:contents dark:border-red-900/60">
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            aria-label={`Cancel ${guestLabel(name, position)}`}
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
    </>
  );
}

/**
 * The full detail of one guest, over the screen.
 *
 * Portalled to `<body>`, and it has to be: the party card declares
 * `container-type: inline-size`, which makes it a containing block for
 * `position: fixed` descendants — so a modal rendered inside the party would
 * be pinned to the party rather than to the window, and a card 340px wide
 * cannot hold a dialog.
 *
 * The panel then declares `@container/guests` itself, at a width below the
 * 38rem threshold, so the fields inside it lay themselves out in exactly the
 * stacked shape they use in the table's narrow form. That is why there is no
 * second copy of the styling anywhere: the layout follows from the width of
 * the thing the fields are in, wherever that is.
 */
function GuestDetail({
  attendee,
  position,
  name,
  onClose,
  children,
}: {
  attendee: Attendee;
  position: number;
  name: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismiss(true, panel, onClose);

  // The cursor belongs in the panel while it is open, and the page behind it
  // should not scroll under a full-screen overlay.
  useEffect(() => {
    panel.current?.focus();
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = had;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-guest-detail={attendee.id}
      /* Bottom of the screen on a phone, where a thumb is, and centred once
         there is room to centre it in. */
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="@container/guests max-h-[85vh] w-[min(26rem,100%)] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-2 flex items-baseline gap-2">
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-base font-semibold text-black dark:text-zinc-50"
          >
            {guestLabel(name, position)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guest details"
            data-guest-detail-close
            className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {children}

        {/* Every field here commits as it is left, the way it does in the
            table, so this saves nothing that is not already saved — it is the
            way out once the editing is done, which is what a modal needs and
            a row in a list does not. */}
        <button
          type="button"
          onClick={onClose}
          data-guest-detail-done
          className="mt-3 h-11 w-full rounded-md bg-black text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One guest, in whichever of two shapes the party has room for.
 *
 * Wide enough, and the guest is a row of the party's table: every field on
 * one line, editable in place, as it has always been.
 *
 * Too narrow, and the guest is one compact line — the name, the status as a
 * word, the table as a dropdown, and a cross. Three things can be done from
 * there without opening anything: change the table, cancel the guest, or tap
 * the line to open the full detail over the screen. That replaced a card of
 * six stacked controls per guest, which meant a party of ten was a very long
 * scroll of dropdowns and the two facts you actually wanted — who, and have
 * they paid — were spread down it.
 *
 * The compact line is not a `<button>`, because a button cannot hold a
 * dropdown and a button of its own. The name and status are the button, which
 * is what keyboards and screen readers use; the click handler on the line
 * itself is what makes the rest of it a tap target too, and it ignores
 * anything that came from a control.
 */
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  const label = guestLabel(attendee.name, position);

  function close() {
    setOpen(false);
    // Back where it came from, so a tap and a Tab both end up where they
    // started rather than at the top of the document.
    opener.current?.focus();
  }

  async function apply(patch: AttendeePatch) {
    setBusy(true);
    setError("");
    try {
      await onPatch(patch);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * A tap anywhere on the compact line that did not come from a control opens
   * the detail. The table dropdown and the cross are controls; so is the
   * name, which is the button itself and opens the detail anyway.
   */
  function tapped(clicked: React.MouseEvent<HTMLDivElement>) {
    const from = clicked.target;
    if (from instanceof Element && from.closest("select, button, input, a")) {
      return;
    }
    setOpen(true);
  }

  return (
    <li
      data-attendee={attendee.id}
      data-list-row
      // Enter moves down the column; every field in the row bubbles to here.
      // The compact line has no such fields, so Enter does nothing there.
      onKeyDown={enterMovesDown(onAddGuest)}
      className="rounded-md border border-zinc-200 @min-[38rem]/guests:rounded-none @min-[38rem]/guests:border-0 dark:border-zinc-800"
    >
      {/* ------------------------------------------- narrow: one compact line

          The click handler here has no keyboard twin, deliberately: it only
          widens the tap target of the button inside it, which a keyboard
          reaches directly. A `role` and a key handler on this wrapper would
          announce a second control that does the same thing as the first. */}
      <div
        onClick={tapped}
        data-attendee-line={attendee.id}
        className="flex items-center gap-2 p-1 @min-[38rem]/guests:hidden"
      >
        <button
          type="button"
          ref={opener}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-attendee-open={attendee.id}
          className="flex min-w-0 flex-1 flex-col items-start rounded-md px-1 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <span className="w-full truncate text-sm font-medium text-black dark:text-zinc-50">
            {label}
          </span>
          <span
            data-attendee-status-text={attendee.id}
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {STATUS_LABELS[attendee.status]}
          </span>
        </button>

        {/* The one field that can be changed without opening anything: where
            a guest sits is what changes most on the night, and it is the
            reason a phone had a whole card of dropdowns before. */}
        <TableSelect
          event={event}
          attendee={attendee}
          position={position}
          busy={busy}
          hook="table-quick"
          listField={false}
          onChoose={(tableNumber) =>
            void apply({ assignedTableNumber: tableNumber })
          }
          className={`h-11 w-[5.5rem] shrink-0 text-sm ${FIELD_SHAPE}`}
        />

        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={busy}
          aria-label={`Cancel ${label}`}
          title="Cancel this guest"
          data-cancel-attendee-quick={attendee.id}
          className="h-11 w-11 shrink-0 rounded-md border border-red-300 text-base leading-none text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="mt-1 mb-1 px-1 text-xs text-red-600 @min-[38rem]/guests:hidden dark:text-red-400"
        >
          {error}
        </p>
      )}

      {/* --------------------------------------------- wide: a row of columns */}
      <div className="hidden @min-[38rem]/guests:block">
        <GuestFields
          event={event}
          attendee={attendee}
          position={position}
          selected={selected}
          onSelect={onSelect}
          onPatch={onPatch}
          onSetRegular={onSetRegular}
          onCancel={onCancel}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          showSelect
          enterNav
        />
      </div>

      {/* --------------------------------------- the detail, over the screen */}
      {open && (
        <GuestDetail
          attendee={attendee}
          position={position}
          name={attendee.name}
          onClose={close}
        >
          <GuestFields
            event={event}
            attendee={attendee}
            position={position}
            selected={selected}
            onSelect={onSelect}
            onPatch={onPatch}
            onSetRegular={onSetRegular}
            /* Cancelling from here takes the guest out of the party, so the
               panel about them has nothing left to be. */
            onCancel={async () => {
              await onCancel();
              setOpen(false);
            }}
            busy={busy}
            setBusy={setBusy}
            error={error}
            setError={setError}
            showSelect={false}
            enterNav={false}
          />
        </GuestDetail>
      )}
    </li>
  );
}
