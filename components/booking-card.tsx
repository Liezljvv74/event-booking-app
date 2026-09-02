"use client";

import { useState } from "react";
import {
  ATTENDEE_GRID,
  ATTENDEE_MIN_WIDTH,
  AttendeeRow,
} from "@/components/attendee-row";
import { formatAmount } from "@/lib/money";
import type { AttendeePatch } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Booking, type Event } from "@/lib/types";

interface Props {
  event: Event;
  booking: Booking;
  onPatchAttendee: (attendeeId: string, patch: AttendeePatch) => Promise<unknown>;
  onCancelAttendee: (attendeeId: string) => Promise<unknown>;
  onCancelBooking: () => Promise<unknown>;
}

export function BookingCard({
  event,
  booking,
  onPatchAttendee,
  onCancelAttendee,
  onCancelBooking,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const live = booking.attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );
  const cancelledCount = booking.attendees.length - live.length;
  const allCancelled = live.length === 0;
  const dueCents = booking.attendees
    .filter((attendee) => attendee.status === "pay_at_venue")
    .reduce((total, attendee) => total + attendee.ticketPriceCents, 0);

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          {booking.partyName}
        </h2>
        <a
          href={`tel:${booking.telephone}`}
          className="text-xs text-zinc-600 underline dark:text-zinc-400"
        >
          {booking.telephone}
        </a>
        <p
          data-booking-summary={booking.id}
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {live.length}/{booking.attendees.length} guests
          {cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}
          {dueCents > 0 ? ` · ${formatAmount(dueCents)} due` : ""}
        </p>

        <div className="ml-auto flex items-center gap-2">
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

      {/* The columns are narrower than a phone, so they scroll sideways here
          rather than wrapping each guest onto several lines. */}
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
    </li>
  );
}
