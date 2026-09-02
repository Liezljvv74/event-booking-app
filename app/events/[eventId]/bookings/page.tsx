"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BookingCard } from "@/components/booking-card";
import { useEventContext } from "@/components/event-provider";
import { NewBookingForm } from "@/components/new-booking-form";
import { SEAT_OCCUPYING_STATUSES } from "@/lib/types";

export default function BookingsScreen() {
  const {
    activeEvents,
    addBooking,
    editAttendee,
    cancelOneAttendee,
    cancelWholeBooking,
  } = useEventContext();
  const params = useParams<{ eventId: string }>();
  const [creating, setCreating] = useState(false);

  const event = activeEvents.find(
    (candidate) => candidate.id === params.eventId,
  );
  if (!event) return null;

  const attendees = event.bookings.flatMap((booking) => booking.attendees);
  const live = attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );
  const unseated = live.filter(
    (attendee) => attendee.assignedTableNumber === null,
  ).length;
  const seatsTotal = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Bookings
        </h1>
        <p
          data-bookings-summary
          className="text-sm text-zinc-600 dark:text-zinc-400"
        >
          {event.bookings.length} booking
          {event.bookings.length === 1 ? "" : "s"} · {live.length} guest
          {live.length === 1 ? "" : "s"}
          {unseated > 0 ? ` · ${unseated} unseated` : ""}
        </p>
      </div>

      {/* Guests can be booked before any table exists, but they cannot be
          seated, so say so rather than leaving an empty Table dropdown. */}
      {event.tables.length === 0 && (
        <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          This event has no tables yet, so guests cannot be seated.{" "}
          <Link
            href={`/events/${event.id}/tables`}
            className="underline dark:text-zinc-300"
          >
            Add tables
          </Link>{" "}
          when you are ready.
        </p>
      )}

      {live.length > seatsTotal && (
        <p
          role="alert"
          className="mt-3 max-w-prose text-sm text-amber-700 dark:text-amber-500"
        >
          {live.length} guests booked but only {seatsTotal} seats exist. Add
          tables or seats to fit everyone.
        </p>
      )}

      {creating ? (
        <div className="mt-4">
          <NewBookingForm
            onCreate={async (input) => {
              const updated = await addBooking(event.id, input);
              setCreating(false);
              return updated;
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 h-11 rounded-md bg-black px-4 text-base font-medium text-white dark:bg-zinc-50 dark:text-black"
        >
          + New booking
        </button>
      )}

      {event.bookings.length === 0 ? (
        <p className="mt-4 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          No bookings yet. A booking is a party name, a telephone number and a
          guest count.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {event.bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              event={event}
              booking={booking}
              onPatchAttendee={(attendeeId, patch) =>
                editAttendee(event.id, booking.id, attendeeId, patch)
              }
              onCancelAttendee={(attendeeId) =>
                cancelOneAttendee(event.id, booking.id, attendeeId)
              }
              onCancelBooking={() => cancelWholeBooking(event.id, booking.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
