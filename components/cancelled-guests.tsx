"use client";

import { StatusPill } from "@/components/status-pill";
import { useMoney } from "@/components/event-provider";
import { amountPaidCents, type Event } from "@/lib/types";
import { sumCents } from "@/lib/money";

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
  const money = useMoney();

  const cancelled = event.bookings.flatMap((booking) =>
    booking.attendees
      .filter((attendee) => attendee.status === "cancelled")
      .map((attendee) => ({
        id: attendee.id,
        name: attendee.name.trim(),
        partyName: booking.partyName,
        paidCents: amountPaidCents(attendee),
      })),
  );

  if (cancelled.length === 0) return null;

  /**
   * Money taken from people who are no longer coming.
   *
   * It counts towards the event's income, because it was taken and has not
   * been given back, so it has to be readable somewhere or the dashboard has
   * a figure in it with nothing behind it. This list is where those guests
   * already are, so it is where the amount belongs.
   */
  const keptCents = sumCents(cancelled.map((guest) => guest.paidCents));

  return (
    <section data-cancelled-section className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-base font-semibold text-ink">
          Cancelled guests
        </h2>
        <p data-cancelled-count>
          <StatusPill tone="cancelled" marker="cancelled-guests">
            {cancelled.length} guest{cancelled.length === 1 ? "" : "s"}
          </StatusPill>
        </p>

        {keptCents > 0 && (
          <p data-cancelled-kept>
            <StatusPill tone="confirmed" marker="cancelled-kept">
              {money(keptCents)} already paid
            </StatusPill>
          </p>
        )}
      </div>

      {/* Names run in columns rather than down a single line each: they are
          short, there can be a great many of them, and this is a list to be
          scanned for one name rather than read through. */}
      <ul className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
        {cancelled.map((guest) => (
          <li
            key={guest.id}
            data-cancelled-guest={guest.id}
            className="truncate text-sm text-ink-muted"
          >
            {guest.name === "" ? "Unnamed guest" : guest.name}{" "}
            <span className="text-ink-faint">
              ({guest.partyName})
            </span>
            {guest.paidCents > 0 && (
              <>
                {" "}
                <span
                  data-cancelled-paid={guest.id}
                  className="text-primary tabular-nums"
                >
                  {money(guest.paidCents)} paid
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
