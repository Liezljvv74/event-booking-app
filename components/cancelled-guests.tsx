"use client";

import type { Event } from "@/lib/types";

/**
 * Every cancellation on the event, in one list below the bookings.
 *
 * They used to sit inside the party they were booked with, which put closed
 * records among the guests still to be named and seated. A cancellation is
 * not work any more, so it is out of the party altogether and gathered here.
 *
 * A name and the party it belonged to is all that is kept on show. The table
 * they held has gone to the replacement line the cancellation opened, and
 * their price is zero, so a row of columns would be a row of blanks and
 * dashes. The party in brackets is what makes the name findable — two guests
 * called the same thing are told apart by whose booking they were on.
 */
export function CancelledGuests({ event }: { event: Event }) {
  const cancelled = event.bookings.flatMap((booking) =>
    booking.attendees
      .filter((attendee) => attendee.status === "cancelled")
      .map((attendee) => ({
        id: attendee.id,
        name: attendee.name.trim(),
        partyName: booking.partyName,
      })),
  );

  if (cancelled.length === 0) return null;

  return (
    <section data-cancelled-section className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">
          Cancelled guests
        </h2>
        <p
          data-cancelled-count
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {cancelled.length} guest{cancelled.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Names run in columns rather than down a single line each: they are
          short, there can be a great many of them, and this is a list to be
          scanned for one name rather than read through. */}
      <ul className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
        {cancelled.map((guest) => (
          <li
            key={guest.id}
            data-cancelled-guest={guest.id}
            className="truncate text-sm text-zinc-600 dark:text-zinc-400"
          >
            {guest.name === "" ? "Unnamed guest" : guest.name}{" "}
            <span className="text-zinc-500 dark:text-zinc-500">
              ({guest.partyName})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
