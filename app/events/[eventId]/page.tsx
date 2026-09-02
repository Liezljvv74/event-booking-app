"use client";

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
    bookings: event.bookings.length,
    seatsTotal,
    seatsAvailable: Math.max(0, seatsTotal - seatsTaken),
    expenseLines: event.expenses.length,
    expensesCents,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
        {value}
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
        <Stat label="Tables" value={String(summary.tables)} />
        <Stat label="Bookings" value={String(summary.bookings)} />
        <Stat
          label="Seats available"
          value={`${summary.seatsAvailable} of ${summary.seatsTotal}`}
        />
        <Stat label="Expenses" value={formatAmount(summary.expensesCents)} />
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
