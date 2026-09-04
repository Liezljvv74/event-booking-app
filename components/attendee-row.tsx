"use client";

import { useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import { tableOccupancy, type AttendeePatch } from "@/lib/repository";
import { describeTicketPrice } from "@/lib/ticket-prices";
import type { Attendee, AttendeeStatus, Event } from "@/lib/types";

const STATUS_LABELS: Record<AttendeeStatus, string> = {
  paid: "Paid",
  pay_at_venue: "Pay at venue",
  not_paying: "Not paying",
  cancelled: "Cancelled",
};

/**
 * The statuses this dropdown offers. Cancelling is not among them: it is the
 * Cancel button's job, because cancelling also opens a replacement line, and
 * a status change here would take the party's seat away instead.
 */
const LIVE_STATUSES: readonly AttendeeStatus[] = [
  "paid",
  "pay_at_venue",
  "not_paying",
];

/**
 * One grid template shared by the header and every row, so the columns line
 * up without a real table. Ten rows have to fit on a phone screen, which
 * rules out per-field labels; the header carries them once instead.
 */
export const ATTENDEE_GRID =
  "grid grid-cols-[1.25rem_minmax(7rem,1fr)_5rem_8rem_7rem_5rem] items-center gap-2";

/** Narrower than a phone, so the columns scroll sideways instead of wrapping. */
export const ATTENDEE_MIN_WIDTH = "min-w-[36rem]";

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
  onCancel: () => Promise<unknown>;
}

const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/**
 * A cancelled guest, laid out on the same grid but as plain text.
 *
 * Disabled inputs would still read as fields waiting to be filled in. This
 * is a closed record: the name, table and price they held, kept for the
 * account of what happened, with the seat itself passed to the replacement
 * line the cancellation opened.
 */
export function CancelledRow({ attendee }: { attendee: Attendee }) {
  const muted = "text-xs text-zinc-500 dark:text-zinc-500";

  return (
    <li data-attendee={attendee.id} data-cancelled-guest={attendee.id}>
      <div className={`${ATTENDEE_GRID} opacity-70`}>
        <span aria-hidden="true" />
        <span
          data-cancelled-name={attendee.id}
          className="truncate px-2 text-sm text-zinc-600 line-through dark:text-zinc-400"
        >
          {attendee.name.trim() === "" ? "Unnamed guest" : attendee.name}
        </span>
        <span className={`px-2 ${muted}`}>
          {attendee.assignedTableNumber ?? "—"}
        </span>
        <span className={`px-2 ${muted}`}>{STATUS_LABELS.cancelled}</span>
        <span className={`px-2 ${muted}`}>
          {formatCents(attendee.ticketPriceCents)}
        </span>
        <span aria-hidden="true" />
      </div>
    </li>
  );
}

export function AttendeeRow({
  event,
  attendee,
  position,
  selected,
  onSelect,
  onPatch,
  onCancel,
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

  if (attendee.status === "cancelled") {
    return <CancelledRow attendee={attendee} />;
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
      setError(caught instanceof Error ? caught.message : String(caught));
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
    <li data-attendee={attendee.id}>
      <div className={ATTENDEE_GRID}>
        <input
          type="checkbox"
          checked={selected}
          disabled={busy}
          aria-label={`Select guest ${position} to move`}
          data-select-attendee={attendee.id}
          onChange={(changed) => onSelect(changed.target.checked)}
          className="h-4 w-4 justify-self-center accent-black dark:accent-zinc-300"
        />

        <input
          type="text"
          value={name}
          disabled={busy}
          placeholder={`Guest ${position}`}
          aria-label={`Name of guest ${position}`}
          data-attendee-name={attendee.id}
          onChange={(changed) => setName(changed.target.value)}
          onBlur={commitName}
          onKeyDown={(pressed) => {
            if (pressed.key === "Enter") {
              pressed.preventDefault();
              commitName();
            }
          }}
          className={controlClass}
        />

        <select
          value={attendee.assignedTableNumber ?? ""}
          disabled={busy}
          aria-label={`Table for guest ${position}`}
          data-attendee-table={attendee.id}
          onChange={(changed) =>
            void apply({
              assignedTableNumber:
                changed.target.value === "" ? null : Number(changed.target.value),
            })
          }
          className={controlClass}
        >
          <option value="">—</option>
          {seating.map((entry) => {
            const current = entry.tableNumber === attendee.assignedTableNumber;
            // Offered but unselectable beats accepted then refused. Never the
            // guest's own table, which they are entitled to stay at.
            const full = !current && entry.free === 0;
            return (
              <option
                key={entry.tableNumber}
                value={entry.tableNumber}
                disabled={full}
              >
                {/* The chosen option's text is what the closed field shows,
                    and the column fits a number and no more. So the free
                    seats are spelled out on the tables this guest could move
                    to, not on the one they are already at. */}
                {current
                  ? entry.tableNumber
                  : full
                    ? `${entry.tableNumber} · full`
                    : `${entry.tableNumber} · ${entry.free} free`}
              </option>
            );
          })}
        </select>

        <select
          value={attendee.status}
          disabled={busy}
          aria-label={`Status of guest ${position}`}
          data-attendee-status={attendee.id}
          onChange={(changed) =>
            void apply({ status: changed.target.value as AttendeeStatus })
          }
          className={controlClass}
        >
          {LIVE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        {/* A guest is priced by picking one of the event's prices, since that
            is what almost every guest is on. Typing an amount is still open
            to whoever needs it, behind the last option — and it is the only
            control on an event whose prices were never set. */}
        {onList && !typing ? (
          <select
            value={matched?.id ?? OFF_LIST}
            disabled={busy}
            aria-label={`Ticket price for guest ${position}`}
            data-attendee-price-choice={attendee.id}
            onChange={(changed) => {
              const picked = changed.target.value;
              if (picked === CUSTOM) {
                setTyping(true);
                return;
              }
              const chosen = event.ticketPrices.find(
                (candidate) => candidate.id === picked,
              );
              // A refused change leaves the store untouched, and the dropdown
              // reads from the store, so there is nothing to put back.
              if (chosen !== undefined) {
                void apply({ ticketPriceCents: chosen.amountCents });
              }
            }}
            className={controlClass}
          >
            {event.ticketPrices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {/* The chosen option's text is what the closed field shows,
                    and the column fits an amount and no more. So what a price
                    includes is spelled out on the prices this guest could
                    move to, not on the one they are already on. */}
                {candidate.id === matched?.id
                  ? formatCents(candidate.amountCents)
                  : describeTicketPrice(candidate)}
              </option>
            ))}
            {/* An amount typed by hand, or one left behind by an event whose
                prices have since changed. Shown so the field states what the
                guest is actually being charged. */}
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
            className={controlClass}
          />
        )}

        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={busy}
          aria-label={`Cancel guest ${position}`}
          data-cancel-attendee={attendee.id}
          className="h-9 rounded-md border border-zinc-300 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          Cancel
        </button>
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
