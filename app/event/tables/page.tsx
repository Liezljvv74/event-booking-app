"use client";

/**
 * The event's tables, as a table: number, seats, and a cross to remove one.
 *
 * Nothing else. What is free at each table and who is sitting there are
 * questions the Dashboard and the Bookings screen answer, and answering them
 * again here cost three lines a table for numbers nobody edits.
 *
 * Tables are made on Manage events, at the foot of the New event form, so
 * there is no add button here.
 */

import { useEventContext } from "@/components/event-provider";
import { TableRow } from "@/components/table-row";
import { tableOccupancy } from "@/lib/repository";
import { useEventId } from "@/lib/event-routes";

export default function TablesScreen() {
  const { activeEvents, setSeatCount, removeEventTable } = useEventContext();
  const eventId = useEventId();

  const event = activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  const totalSeats = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );

  // Derived once and handed to each row, keyed by table number so a row is
  // never matched to its neighbour's counts.
  const occupancy = tableOccupancy(event);
  const byTableNumber = new Map(
    occupancy.map((entry) => [entry.tableNumber, entry]),
  );
  const totalFree = occupancy.reduce((total, entry) => total + entry.free, 0);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Tables
        </h1>
        <p data-seat-total className="text-sm text-zinc-600 dark:text-zinc-400">
          {event.tables.length} table{event.tables.length === 1 ? "" : "s"} ·{" "}
          {totalSeats} seat{totalSeats === 1 ? "" : "s"} · {totalFree} free
        </p>
      </div>

      {event.tables.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          No tables. They are set up on Manage events, under Schedule a new
          event.
        </p>
      ) : (
        /* Narrow: two short columns and a cross need no more, and a table
           stretched across a desktop window would put its seat counts a
           screen away from their numbers. */
        <table className="mt-3 w-full max-w-xs border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Table Number
              </th>
              <th className="px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Seats
              </th>
              <th className="w-10 px-2 py-1">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {event.tables.map((table) => (
              <TableRow
                key={table.id}
                table={table}
                occupancy={byTableNumber.get(table.tableNumber)!}
                onSetSeats={(seatCount) =>
                  setSeatCount(event.id, table.id, seatCount)
                }
                onRemove={() => removeEventTable(event.id, table.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
