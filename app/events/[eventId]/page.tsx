"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEventContext } from "@/components/event-provider";
import { ScheduleEditor } from "@/components/schedule-editor";
import { formatAmount, sumCents } from "@/lib/money";
import { tableOccupancy, type TableOccupancy } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";

/**
 * The figures the spec asks the dashboard to show.
 *
 * Money is summed from integer cents, so the totals are exact and profit is
 * simply income less expenses rather than a rounded difference of rounded
 * numbers.
 */
function summarise(event: Event, seating: readonly TableOccupancy[]) {
  const attendees = event.bookings.flatMap((booking) => booking.attendees);
  const confirmed = attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );

  const priceOf = (status: string) =>
    sumCents(
      attendees
        .filter((attendee) => attendee.status === status)
        .map((attendee) => attendee.ticketPriceCents),
    );

  // Only what will be collected at the door. A guest marked not paying owes
  // nothing and never counts towards either figure.
  const dueCents = priceOf("pay_at_venue");
  const incomeCents = priceOf("paid") + dueCents;
  const expensesCents = sumCents(
    event.expenses.map((expense) => expense.amountCents),
  );

  return {
    guestsConfirmed: confirmed.length,
    guestsCancelled: attendees.length - confirmed.length,
    seatsTotal: event.tables.reduce((total, table) => total + table.seatCount, 0),
    // Summed from the tables themselves, so this is the same "free seat" the
    // Tables screen and the seating dropdowns count.
    seatsFree: seating.reduce((total, table) => total + table.free, 0),
    unseated: confirmed.filter(
      (attendee) => attendee.assignedTableNumber === null,
    ).length,
    dueCents,
    expensesCents,
    incomeCents,
    profitCents: incomeCents - expensesCents,
  };
}

/** One number in a stat card, with the unit it counts. */
interface Figure {
  value: string;
  /** Named when a card carries two numbers, so neither can be misread. */
  unit?: string;
}

function Stat({
  label,
  figures,
  lead = false,
  negative = false,
}: {
  label: string;
  figures: readonly Figure[];
  /** The bottom line of the page, given a heavier edge than the rest. */
  lead?: boolean;
  /** A loss, coloured as one. Separate from the emphasis. */
  negative?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        lead
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
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
              <span
                className={`text-2xl font-semibold ${
                  negative
                    ? "text-red-600 dark:text-red-400"
                    : "text-black dark:text-zinc-50"
                }`}
              >
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

/** Who is at a table: the names, with unnamed guests counted rather than listed. */
function Seated({ table }: { table: TableOccupancy }) {
  if (table.taken === 0) {
    return (
      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-500">
        No one seated yet
      </p>
    );
  }

  return (
    <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
      {table.guestNames.join(", ")}
      {table.unnamed > 0 && (
        <span className="text-zinc-500 dark:text-zinc-500">
          {table.guestNames.length > 0
            ? ` · ${table.unnamed} not named yet`
            : `${table.unnamed} guest${table.unnamed === 1 ? "" : "s"}, not named yet`}
        </span>
      )}
    </p>
  );
}

export default function EventDashboard() {
  const { activeEvents, updateSchedule } = useEventContext();
  const params = useParams<{ eventId: string }>();

  const event = activeEvents.find(
    (candidate) => candidate.id === params.eventId,
  );
  if (!event) return null;

  const seating = tableOccupancy(event);
  const summary = summarise(event, seating);

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

      {/* Six figures across two rows of three, which fills both rows at every
          width the grid uses. Expected profit closes the set: it is what the
          five before it add up to. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Guests"
          figures={[
            { value: String(summary.guestsConfirmed), unit: "confirmed" },
            { value: String(summary.guestsCancelled), unit: "cancelled" },
          ]}
        />
        <Stat
          label="Seats available"
          figures={[
            { value: `${summary.seatsFree} of ${summary.seatsTotal}` },
          ]}
        />
        <Stat
          label="Amount due at the venue"
          figures={[{ value: formatAmount(summary.dueCents) }]}
        />
        <Stat
          label="Expenses"
          figures={[{ value: formatAmount(summary.expensesCents) }]}
        />
        <Stat
          label="Expected income"
          figures={[{ value: formatAmount(summary.incomeCents) }]}
        />
        <Stat
          label="Expected profit"
          figures={[{ value: formatAmount(summary.profitCents) }]}
          lead
          negative={summary.profitCents < 0}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">
            Seating
          </h2>
          <p
            data-seating-summary
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {event.tables.length} table{event.tables.length === 1 ? "" : "s"} ·{" "}
            {summary.seatsTotal} seat{summary.seatsTotal === 1 ? "" : "s"} ·{" "}
            {summary.seatsFree} free
          </p>
        </div>

        {event.tables.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
            No tables yet, so no one can be seated.{" "}
            <Link
              href={`/events/${event.id}/tables`}
              className="underline dark:text-zinc-300"
            >
              Add tables
            </Link>{" "}
            when you are ready.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {seating.map((table) => (
              <li
                key={table.tableNumber}
                data-seating={table.tableNumber}
                className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-black dark:text-zinc-50">
                    Table {table.tableNumber}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {table.taken} of {table.seatCount} seat
                    {table.seatCount === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`text-xs ${
                      table.free === 0
                        ? "text-zinc-500 dark:text-zinc-500"
                        : "font-medium text-emerald-700 dark:text-emerald-500"
                    }`}
                  >
                    {table.free === 0 ? "full" : `${table.free} free`}
                  </span>
                </div>
                <Seated table={table} />
              </li>
            ))}
          </ul>
        )}

        {/* A guest who holds no seat is counted in no table's tally, so
            without this the numbers would look complete while people still
            needed placing. */}
        {summary.unseated > 0 && (
          <p
            data-unseated
            className="mt-2 max-w-prose text-sm text-amber-700 dark:text-amber-500"
          >
            {summary.unseated} guest{summary.unseated === 1 ? "" : "s"} not yet
            seated.{" "}
            <Link
              href={`/events/${event.id}/bookings`}
              className="underline"
            >
              Seat them
            </Link>{" "}
            from the bookings screen.
          </p>
        )}
      </section>
    </section>
  );
}
