"use client";

import Link from "next/link";
import { useEventContext, useMoney } from "@/components/event-provider";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { formatEventDate, formatTimeRange } from "@/lib/event-time";
import { sumCents } from "@/lib/money";
import { tableOccupancy, type TableOccupancy } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";
import {
  MANAGE_EVENTS_PATH,
  eventHref,
  unseatedHref,
  useEventId,
} from "@/lib/event-routes";

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
  const seatsTotal = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );

  const dueCents = priceOf("pay_at_venue");
  const incomeCents = priceOf("paid") + dueCents;
  const expensesCents = sumCents(
    event.expenses.map((expense) => expense.amountCents),
  );

  return {
    guestsConfirmed: confirmed.length,
    guestsCancelled: attendees.length - confirmed.length,
    seatsTotal,
    /**
     * Seats nobody has been promised: the room, less every guest coming to
     * it, whether or not they have been given a chair yet.
     *
     * This used to be the seats not currently sat in, summed off the tables —
     * which counts an unseated guest as no guest at all. A room of 30 with 17
     * confirmed and 5 of them unplaced reported 18 seats available, and 18 is
     * not a number anybody can act on: take 18 more bookings and 5 people
     * stand. The question this figure answers is "how many more can I take",
     * and the answer is 13.
     */
    seatsAvailable: Math.max(0, seatsTotal - confirmed.length),
    /** How far past the room the bookings have gone, or nought. */
    seatsShort: Math.max(0, confirmed.length - seatsTotal),
    /**
     * Seats with nobody in them, summed off the tables. A different question
     * — where is there room to put somebody — and the one the seating list
     * below is about, so it keeps its own name.
     */
    seatsUnfilled: seating.reduce((total, table) => total + table.free, 0),
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
  /**
   * When the unit is a status rather than a noun - confirmed, cancelled,
   * due, short - it is drawn as the pill for that status instead of as
   * small grey words. The number keeps its own size and weight: the pill
   * says what kind of number it is, not how big.
   */
  tone?: StatusTone;
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
      className={`rounded-lg border p-2 ${
        lead
          ? "border-primary bg-muted"
          : "border-line-soft"
      }`}
    >
      {/* Bold, on request, and dark enough for the weight to tell: a bold
          zinc-600 at this size reads as a smudge rather than as a heading.

          Two lines' worth of room whether or not the label needs it, so the
          figures line up across the row instead of stepping down wherever a
          longer label wraps. */}
      {/* 13px rather than the next step up to 14: a point is as much as
          "slightly bigger" wants, and it leaves the wrapping where it was.
          At 14 a label like "Amount due at the venue" takes a third line in
          a sixth-width card, and the two lines' room below stops being the
          two lines it is there to reserve. */}
      <div className="min-h-[2rem] text-[0.8125rem] leading-4 font-semibold text-ink-soft">
        {label}
      </div>

      {/* Now that the cards are a sixth of the row wide, two figures never
          fit on one line, so a card carrying a pair stacks them and the row
          stretches to suit. Each number keeps its unit beside it either way. */}
      <div className="flex flex-col items-start gap-y-0.5">
        {figures.map((figure, index) => (
          /* The number and its unit travel together, so neither wraps away
             from the other. */
          <span
            key={figure.unit ?? index}
            className="flex items-baseline gap-x-1.5"
          >
            <span
              /* Barely above the heading rather than two sizes above it,
                 which is what takes the height out of the cards: the labels
                 are what the row is read by, and six figures in a row do not
                 each need to shout. */
              className={`text-sm font-semibold ${
                negative
                  ? "text-danger"
                  : "text-ink"
              }`}
            >
              {figure.value}
            </span>
            {figure.unit !== undefined &&
              (figure.tone === undefined ? (
                <span className="text-xs text-ink-muted">
                  {figure.unit}
                </span>
              ) : (
                <StatusPill tone={figure.tone} marker={label}>
                  {figure.unit}
                </StatusPill>
              ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * When the event runs, read off rather than edited. The date and times are
 * set when the event is created and changed on Manage events, along with the
 * name and the prices, so all of that is stated here and altered there.
 */
function Schedule({ event }: { event: Event }) {
  const times = formatTimeRange(event.startTime, event.endTime);

  return (
    <p
      data-schedule
      className="text-xl font-semibold text-ink-muted"
    >
      {formatEventDate(event.eventDate)}
      {times === "" ? " · no times set" : ` · ${times}`}
    </p>
  );
}

/** Who is at a table: the names, with unnamed guests counted rather than listed. */
function Seated({ table }: { table: TableOccupancy }) {
  if (table.taken === 0) {
    return (
      <p className="mt-0.5 text-xs text-ink-faint">
        No one seated yet
      </p>
    );
  }

  return (
    /* Smaller than the table's own line above it, on request. A full table
       is ten names on one line, and they are a list to be found in rather
       than a heading to be read. */
    <p className="mt-0.5 text-xs text-ink-soft">
      {table.guestNames.join(", ")}
      {table.unnamed > 0 && (
        <span className="text-ink-faint">
          {table.guestNames.length > 0
            ? ` · ${table.unnamed} not named yet`
            : `${table.unnamed} guest${table.unnamed === 1 ? "" : "s"}, not named yet`}
        </span>
      )}
    </p>
  );
}

export default function EventDashboard() {
  const money = useMoney();
  const { activeEvents } = useEventContext();
  const eventId = useEventId();

  const event = activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  const seating = tableOccupancy(event);
  const summary = summarise(event, seating);

  return (
    <section>
      {/* Name, then date and times, the schedule set in the heading's own
          size and weight. Wraps rather than shrinking.

          The ticket prices used to sit between the two and were asked off:
          they are what the event is sold at rather than anything about the
          night, they are on every guest's line on Bookings where they are
          actually used, and Manage events is where they are set. Nothing
          here is editable either — an event's own details are edited on
          Manage events, which is a section along the nav above. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-ink">
          {event.name}
        </h1>
        <Schedule event={event} />
      </div>

      {/* All six on one line from the large breakpoint up, which is what
          makes them this narrow: labels get two lines' worth of room and
          wrap into it, and the figures drop a size to match. Below that they
          fall back to three across, then two. Expected profit closes the
          set: it is what the five before it add up to. */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Guests"
          figures={[
            {
              value: String(summary.guestsConfirmed),
              unit: "confirmed",
              tone: "confirmed",
            },
            {
              value: String(summary.guestsCancelled),
              unit: "cancelled",
              tone: "cancelled",
            },
          ]}
        />
        <Stat
          label="Seats available"
          figures={[
            { value: `${summary.seatsAvailable} of ${summary.seatsTotal}` },
            // Only when the bookings have gone past the room, where a bare
            // nought would look like a room that is merely full.
            ...(summary.seatsShort > 0
              ? [
                  {
                    value: String(summary.seatsShort),
                    unit: "short",
                    tone: "due" as const,
                  },
                ]
              : []),
          ]}
          negative={summary.seatsShort > 0}
        />
        <Stat
          label="Amount due at the venue"
          /* Nought owed is a settled event, not an absence, so it says so in
             the blue rather than leaving the figure to be read twice. */
          figures={[
            {
              value: money(summary.dueCents),
              unit: summary.dueCents > 0 ? "due" : "settled",
              tone: summary.dueCents > 0 ? "due" : "confirmed",
            },
          ]}
        />
        <Stat
          label="Expenses"
          figures={[{ value: money(summary.expensesCents) }]}
        />
        <Stat
          label="Expected income"
          figures={[{ value: money(summary.incomeCents) }]}
        />
        <Stat
          label="Expected profit"
          figures={[{ value: money(summary.profitCents) }]}
          lead
          negative={summary.profitCents < 0}
        />
      </div>

      <section className="mt-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold text-ink">
            Seating
          </h2>
          <p
            data-seating-summary
            className="text-xs text-ink-muted"
          >
            {event.tables.length} table{event.tables.length === 1 ? "" : "s"} ·{" "}
            {summary.seatsTotal} seat{summary.seatsTotal === 1 ? "" : "s"} ·{" "}
            {summary.seatsUnfilled} unfilled
          </p>
        </div>

        {event.tables.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-ink-muted">
            No tables yet, so no one can be seated.{" "}
            <Link
              href={MANAGE_EVENTS_PATH}
              className="underline"
            >
              Add tables on Manage events
            </Link>{" "}
            when you are ready.
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-1.5 lg:grid-cols-2">
            {seating.map((table) => (
              <li
                key={table.tableNumber}
                data-seating={table.tableNumber}
                className="rounded-lg border border-line-soft p-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-ink">
                    Table {table.tableNumber}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {table.taken} of {table.seatCount} seat
                    {table.seatCount === 1 ? "" : "s"}
                  </span>
                  {/* A table with room is a confirmed thing; a full one is
                      closed rather than wrong, so it takes the quiet tone
                      rather than the orange. */}
                  <StatusPill
                    tone={table.free === 0 ? "cancelled" : "confirmed"}
                    marker={`table-${table.tableNumber}`}
                  >
                    {table.free === 0 ? "full" : `${table.free} free`}
                  </StatusPill>
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
            className="mt-2 max-w-prose text-sm text-cta"
          >
            {summary.unseated} guest{summary.unseated === 1 ? "" : "s"} not yet
            seated.{" "}
            <Link
              href={unseatedHref(event.id)}
              data-seat-them
              className="underline"
            >
              Seat them
            </Link>{" "}
            on the bookings screen.
          </p>
        )}
      </section>
    </section>
  );
}
