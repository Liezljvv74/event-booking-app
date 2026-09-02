"use client";

import { useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import type { AttendeePatch } from "@/lib/repository";
import type { Attendee, AttendeeStatus, Event } from "@/lib/types";

const STATUS_LABELS: Record<AttendeeStatus, string> = {
  paid: "Paid",
  pay_at_venue: "Pay at venue",
  not_paying: "Not paying",
  cancelled: "Cancelled",
};

interface Props {
  event: Event;
  attendee: Attendee;
  /** Position in the party, used to label a guest who has no name yet. */
  position: number;
  onPatch: (patch: AttendeePatch) => Promise<unknown>;
  onCancel: () => Promise<unknown>;
}

const inputClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function AttendeeRow({
  event,
  attendee,
  position,
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
    <li
      data-attendee={attendee.id}
      className={`rounded-md border p-3 ${
        cancelled
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-sm">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Name</span>
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
            className={`${inputClass} w-full`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Table</span>
          <select
            value={attendee.assignedTableNumber ?? ""}
            disabled={busy}
            aria-label={`Table for guest ${position}`}
            data-attendee-table={attendee.id}
            onChange={(changed) =>
              void apply({
                assignedTableNumber:
                  changed.target.value === ""
                    ? null
                    : Number(changed.target.value),
              })
            }
            className={inputClass}
          >
            <option value="">Unseated</option>
            {event.tables.map((table) => (
              <option key={table.id} value={table.tableNumber}>
                Table {table.tableNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Status
          </span>
          <select
            value={attendee.status}
            disabled={busy}
            aria-label={`Status of guest ${position}`}
            data-attendee-status={attendee.id}
            onChange={(changed) =>
              void apply({ status: changed.target.value as AttendeeStatus })
            }
            className={inputClass}
          >
            {(Object.keys(STATUS_LABELS) as AttendeeStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Ticket
          </span>
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
            className={`${inputClass} w-24`}
          />
        </label>

        {cancelled ? (
          /* A cancelled guest keeps their table on record so restoring them
             puts them back, but the seat is free. Without saying so, the row
             reads as though the table is still occupied. */
          <span
            data-seat-released={attendee.id}
            className="rounded-md bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Cancelled
            {attendee.assignedTableNumber !== null ? " · seat released" : ""}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            data-cancel-attendee={attendee.id}
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            Cancel guest
          </button>
        )}
      </div>

      {error !== "" && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}
