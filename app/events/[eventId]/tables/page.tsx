"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useEventContext } from "@/components/event-provider";
import { TableRow } from "@/components/table-row";
import { DEFAULT_SEAT_COUNT } from "@/lib/types";

export default function TablesScreen() {
  const { activeEvents, addEventTable, setSeatCount, removeEventTable } =
    useEventContext();
  const params = useParams<{ eventId: string }>();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const event = activeEvents.find(
    (candidate) => candidate.id === params.eventId,
  );
  if (!event) return null;

  const totalSeats = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );

  async function add() {
    setAdding(true);
    setError("");
    try {
      await addEventTable(event!.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Tables
        </h1>
        <p
          data-seat-total
          className="text-sm text-zinc-600 dark:text-zinc-400"
        >
          {event.tables.length} table{event.tables.length === 1 ? "" : "s"} ·{" "}
          {totalSeats} seat{totalSeats === 1 ? "" : "s"}
        </p>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {event.tables.length === 0 ? (
        <p className="mt-4 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          No tables yet. Each new table starts with {DEFAULT_SEAT_COUNT} seats,
          which you can change per table.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {event.tables.map((table) => (
            <TableRow
              key={table.id}
              event={event}
              table={table}
              onSetSeats={(seatCount) =>
                setSeatCount(event.id, table.id, seatCount)
              }
              onRemove={() => removeEventTable(event.id, table.id)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={adding}
        className="mt-4 h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
      >
        {adding ? "Adding…" : "+ Add table"}
      </button>
    </section>
  );
}
