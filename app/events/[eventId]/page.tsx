"use client";

import { Fragment } from "react";
import { useParams } from "next/navigation";
import { useEventContext } from "@/components/event-provider";
import { ScheduleEditor } from "@/components/schedule-editor";
import { formatAmount } from "@/lib/money";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";

/**
 * Counts drawn from the stored event. Placeholders for the real dashboard,
 * which the spec defines as seven specific figures.
 */
function summarise(event: Event) {
  const attendees = event.bookings.flatMap((booking) => booking.attendees);
  const seatsTotal = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );
  const seatsTaken = attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  ).length;
  const expensesCents = event.expenses.reduce(
    (total, expense) => total + expense.amountCents,
    0,
  );

  return {
    tables: event.tables.length,
    // Parties, not people. The guest total sits beside it because "3
    // bookings" says nothing about whether that is six people or thirty.
    bookings: event.bookings.length,
    guestsTotal: attendees.length,
    // Seat-occupying is every status but cancelled, so this is the count of
    // guests no longer coming.
    guestsCancelled: attendees.length - seatsTaken,
    seatsTotal,
    seatsAvailable: Math.max(0, seatsTotal - seatsTaken),
    expenseLines: event.expenses.length,
    expensesCents,
  };
}

/** One number in a stat card, with the unit it counts. */
interface Figure {
  value: string;
  /** Named when a card carries two numbers, so neither can be misread. */
  unit?: string;
}

/**
 * Every guest, and how many of them are still coming when those differ.
 *
 * Written as "16/18" the way a party card writes "5/6 guests", so the total
 * stays visible without a second line that would make this card taller than
 * the others beside it.
 */
function guestCount(summary: { guestsTotal: number; guestsCancelled: number }) {
  if (summary.guestsCancelled === 0) return String(summary.guestsTotal);
  return `${summary.guestsTotal - summary.guestsCancelled}/${summary.guestsTotal}`;
}

function Stat({
  label,
  figures,
}: {
  label: string;
  figures: readonly Figure[];
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {/* Two lines' worth of room whether or not the label needs it, so the
          figures line up across the row instead of stepping down wherever a
          longer label wraps. */}
      <div className="min-h-[2.5rem] text-sm text-zinc-600 dark:text-zinc-400">
        {label}
      </div>

      {/* From small screens up the figures share one line, so a card
          carrying two of them is exactly as tall as a card carrying one. A
          half-width card on a phone cannot fit two, so there they stack one
          per line rather than breaking a number away from its unit. */}
      <div className="flex flex-col items-start gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5 sm:gap-y-0">
        {figures.map((figure, index) => (
          <Fragment key={figure.unit ?? index}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className="hidden text-sm text-zinc-400 sm:inline dark:text-zinc-600"
              >
                ·
              </span>
            )}
            {/* The number and its unit travel together, so neither wraps
                away from the other. */}
            <span className="flex items-baseline gap-x-1.5">
              <span className="text-2xl font-semibold text-black dark:text-zinc-50">
                {figure.value}
              </span>
              {figure.unit !== undefined && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {figure.unit}
                </span>
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function EventDashboard() {
  const { activeEvents, updateSchedule } = useEventContext();
  const params = useParams<{ eventId: string }>();

  const event = activeEvents.find((candidate) => candidate.id === params.eventId);
  if (!event) return null;

  const summary = summarise(event);

  return (
    <section>
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        {event.name}
      </h1>

      <div className="mt-2">
        <ScheduleEditor
          event={event}
          onSave={(schedule) => updateSchedule(event.id, schedule)}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tables" figures={[{ value: String(summary.tables) }]} />
        <Stat
          label="Bookings"
          figures={[
            { value: String(summary.bookings), unit: "parties" },
            { value: guestCount(summary), unit: "guests" },
          ]}
        />
        <Stat
          label="Seats available"
          figures={[
            { value: `${summary.seatsAvailable} of ${summary.seatsTotal}` },
          ]}
        />
        <Stat
          label="Expenses"
          figures={[{ value: formatAmount(summary.expensesCents) }]}
        />
      </div>

      <p className="mt-6 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        The full dashboard, with all seven figures from the spec, is not built
        yet.
        {summary.expenseLines > 0
          ? ` ${summary.expenseLines} expense line${summary.expenseLines === 1 ? "" : "s"} carried over from your previous event.`
          : ""}
      </p>
    </section>
  );
}
