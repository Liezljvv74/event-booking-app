"use client";

import { useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import { tableOccupancy, type AttendeePatch } from "@/lib/repository";
import type { Attendee, AttendeeStatus, Event } from "@/lib/types";

const STATUS_LABELS: Record<AttendeeStatus, string> = {
  paid: "Paid",
  pay_at_venue: "Pay at venue",
  not_paying: "Not paying",
  cancelled: "Cancelled",
};

/**
 * One grid template shared by the header and every row, so the columns line
 * up without a real table. Ten rows have to fit on a phone screen, which
 * rules out per-field labels; the header carries them once instead.
 */
export const ATTENDEE_GRID =
  "grid grid-cols-[1.25rem_minmax(7rem,1fr)_5rem_8rem_5.5rem_5rem] items-center gap-2";

/** Narrower than a phone, so the columns scroll sideways instead of wrapping. */
export const ATTENDEE_MIN_WIDTH = "min-w-[34.5rem]";

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

  const cancelled = attendee.status === "cancelled";

  // Ignoring this guest, so the table they already sit at does not count
  // itself as full. A cancelled guest holds no seat, so no table is out of
  // reach for them.
  const seating = tableOccupancy(event, attendee.id);

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
    <li data-attendee={attendee.id} className={cancelled ? "opacity-60" : ""}>
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
            const full = !cancelled && !current && entry.free === 0;
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
          {(Object.keys(STATUS_LABELS) as AttendeeStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <input
          type="text"
          inputMode="decimal"
          value={price}
          disabled={busy}
          aria-label={`Ticket price for guest ${position}`}
          data-attendee-price={attendee.id}
          onChange={(changed) => setPrice(changed.target.value)}
          onBlur={commitPrice}
          onKeyDown={(pressed) => {
            if (pressed.key === "Enter") {
              pressed.preventDefault();
              commitPrice();
            }
          }}
          className={`${controlClass} text-right`}
        />

        {cancelled ? (
          /* A cancelled guest keeps their table on record so restoring them
             puts them back, but the seat is free. Without saying so, the row
             reads as though the table is still occupied. */
          <span
            data-seat-released={attendee.id}
            title={
              attendee.assignedTableNumber === null
                ? "Cancelled"
                : `Cancelled, seat at table ${attendee.assignedTableNumber} is free`
            }
            className="text-xs text-zinc-500 dark:text-zinc-500"
          >
            {attendee.assignedTableNumber === null ? "—" : "seat free"}
          </span>
        ) : (
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
        )}
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
