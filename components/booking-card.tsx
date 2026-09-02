"use client";

import { useId, useState } from "react";
import {
  ATTENDEE_GRID,
  ATTENDEE_MIN_WIDTH,
  AttendeeRow,
} from "@/components/attendee-row";
import { PartyDetailsForm } from "@/components/party-details-form";
import { formatAmount } from "@/lib/money";
import type { AttendeePatch } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Booking, type Event } from "@/lib/types";

interface Props {
  event: Event;
  booking: Booking;
  expanded: boolean;
  onToggle: () => void;
  onPatchAttendee: (attendeeId: string, patch: AttendeePatch) => Promise<unknown>;
  onCancelAttendee: (attendeeId: string) => Promise<unknown>;
  onCancelBooking: () => Promise<unknown>;
  onSaveDetails: (details: {
    partyName: string;
    telephone: string;
  }) => Promise<unknown>;
}

/** The tables the party's uncancelled guests are sitting at. */
function tablesInUse(booking: Booking): number[] {
  const numbers = booking.attendees
    .filter((attendee) => SEAT_OCCUPYING_STATUSES.includes(attendee.status))
    .map((attendee) => attendee.assignedTableNumber)
    .filter((table): table is number => table !== null);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export function BookingCard({
  event,
  booking,
  expanded,
  onToggle,
  onPatchAttendee,
  onCancelAttendee,
  onCancelBooking,
  onSaveDetails,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guestsId = useId();

  const live = booking.attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );
  const cancelledCount = booking.attendees.length - live.length;
  const allCancelled = live.length === 0;
  const dueCents = booking.attendees
    .filter((attendee) => attendee.status === "pay_at_venue")
    .reduce((total, attendee) => total + attendee.ticketPriceCents, 0);

  const tables = tablesInUse(booking);
  const unseated = live.filter(
    (attendee) => attendee.assignedTableNumber === null,
  ).length;

  // Collapsed, the party line is all the manager sees, so it has to say where
  // the party is sitting and whether anyone still needs a seat.
  const seating =
    tables.length === 0
      ? live.length > 0
        ? "unseated"
        : ""
      : tables.length === 1 && unseated === 0
        ? `table ${tables[0]}`
        : `tables ${tables.join(", ")}${unseated > 0 ? ` · ${unseated} unseated` : ""}`;

  async function cancelAll() {
    setBusy(true);
    setError("");
    try {
      await onCancelBooking();
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      data-booking={booking.id}
      className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {/* The party name is the control that opens the guests, so the whole
            label is the click target rather than a separate small caret. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={guestsId}
          data-party-toggle={booking.id}
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <span
            aria-hidden="true"
            className={`text-xs text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="truncate text-sm font-semibold text-black dark:text-zinc-50">
            {booking.partyName}
          </span>
          <span
            data-booking-summary={booking.id}
            className="truncate text-xs font-normal text-zinc-600 dark:text-zinc-400"
          >
            {live.length}/{booking.attendees.length} guests
            {seating === "" ? "" : ` · ${seating}`}
            {cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}
            {dueCents > 0 ? ` · ${formatAmount(dueCents)} due` : ""}
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={`tel:${booking.telephone}`}
            className="hidden text-xs text-zinc-600 underline sm:inline dark:text-zinc-400"
          >
            {booking.telephone}
          </a>

          <button
            type="button"
            onClick={() => setEditing((was) => !was)}
            data-party-edit={booking.id}
            aria-label={`Edit ${booking.partyName} details`}
            className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
          >
            Edit
          </button>

          {allCancelled ? (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Party cancelled
            </span>
          ) : confirming ? (
            <>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Cancel all {live.length}?
              </span>
              <button
                type="button"
                onClick={cancelAll}
                disabled={busy}
                data-confirm-cancel-booking={booking.id}
                className="h-9 rounded-md bg-red-600 px-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Cancel party
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              data-cancel-booking={booking.id}
              className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
            >
              Cancel party
            </button>
          )}
        </div>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {editing && (
        <PartyDetailsForm
          booking={booking}
          onSave={async (details) => {
            const saved = await onSaveDetails(details);
            setEditing(false);
            return saved;
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Kept in the DOM but hidden while collapsed, so a half-typed guest
          name is not thrown away by closing the party. */}
      <div id={guestsId} hidden={!expanded}>
        {/* The columns are narrower than a phone, so they scroll sideways
            here rather than wrapping each guest onto several lines. */}
        <div className="mt-2 overflow-x-auto">
          <div className={ATTENDEE_MIN_WIDTH}>
            <div
              className={`${ATTENDEE_GRID} px-1 pb-1 text-xs text-zinc-500 dark:text-zinc-500`}
              aria-hidden="true"
            >
              <span>Name</span>
              <span>Table</span>
              <span>Status</span>
              <span className="text-right">Ticket</span>
              <span />
            </div>

            <ul className="flex flex-col gap-0.5">
              {booking.attendees.map((attendee, index) => (
                <AttendeeRow
                  key={attendee.id}
                  event={event}
                  attendee={attendee}
                  position={index + 1}
                  onPatch={(patch) => onPatchAttendee(attendee.id, patch)}
                  onCancel={() => onCancelAttendee(attendee.id)}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </li>
  );
}
