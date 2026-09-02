"use client";

import { useState } from "react";
import { occupiedSeats } from "@/lib/repository";
import type { Event, Table } from "@/lib/types";

interface Props {
  event: Event;
  table: Table;
  onSetSeats: (seatCount: number) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}

export function TableRow({ event, table, onSetSeats, onRemove }: Props) {
  const [seats, setSeats] = useState(String(table.seatCount));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // The stored value wins whenever it changes underneath, so a rejected edit
  // does not leave the field showing a number that was never saved. Adjusted
  // during render rather than in an effect: an effect would render once with
  // the stale number and then again to correct it.
  const [lastSaved, setLastSaved] = useState(table.seatCount);
  if (lastSaved !== table.seatCount) {
    setLastSaved(table.seatCount);
    setSeats(String(table.seatCount));
  }

  const occupied = occupiedSeats(event, table.tableNumber);

  async function commit() {
    const parsed = Number(seats);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Enter a whole number of seats, at least 1.");
      setSeats(String(table.seatCount));
      return;
    }
    if (parsed === table.seatCount) {
      setError("");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onSetSeats(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSeats(String(table.seatCount));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onRemove();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      data-table={table.tableNumber}
      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-base font-semibold text-black dark:text-zinc-50">
          Table {table.tableNumber}
        </span>

        <label className="flex items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Seats
          </span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            aria-label={`Seats at table ${table.tableNumber}`}
            data-seat-input={table.tableNumber}
            value={seats}
            disabled={busy}
            onChange={(changed) => setSeats(changed.target.value)}
            onBlur={commit}
            onKeyDown={(pressed) => {
              if (pressed.key === "Enter") {
                pressed.preventDefault();
                void commit();
              }
            }}
            className="h-11 w-20 rounded-md border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        {occupied > 0 && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {occupied} seated
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {occupied > 0
                  ? `Unseat ${occupied} guest${occupied === 1 ? "" : "s"}?`
                  : "Remove?"}
              </span>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                data-confirm-remove={table.tableNumber}
                className="h-11 rounded-md bg-red-600 px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-11 rounded-md border border-zinc-300 px-3 text-sm font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              data-remove={table.tableNumber}
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}
