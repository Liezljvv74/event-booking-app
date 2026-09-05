"use client";

/**
 * One line of the Tables tab: the table's number, its seats, and a cross to
 * be rid of it. A row of a real table rather than a card, so the numbers sit
 * in a column and can be read down.
 */

import { useState } from "react";
import type { TableOccupancy } from "@/lib/repository";
import type { Table } from "@/lib/types";

interface Props {
  table: Table;
  /** Derived once for the whole event, so every row agrees on the counts. */
  occupancy: TableOccupancy;
  onSetSeats: (seatCount: number) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}

const cellClass = "border-b border-zinc-200 px-2 py-1 dark:border-zinc-800";

export function TableRow({ table, occupancy, onSetSeats, onRemove }: Props) {
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

  const occupied = occupancy.taken;

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

  /**
   * An empty table goes on the first press. One with guests at it asks
   * first, because removing it unseats them and there is no undo — but the
   * asking is a second press of the same cross rather than a pair of
   * buttons, so the column stays one cross wide.
   */
  function pressRemove() {
    if (occupied === 0 || confirming) {
      void remove();
      return;
    }
    setConfirming(true);
  }

  return (
    <>
      <tr data-table={table.tableNumber}>
        <td
          className={`${cellClass} font-medium text-black dark:text-zinc-50`}
        >
          {table.tableNumber}
        </td>

        <td className={cellClass}>
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
            className="h-9 w-16 rounded-md border border-zinc-300 bg-white px-1.5 text-sm text-black disabled:opacity-50 sm:h-8 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </td>

        <td className={`${cellClass} text-right`}>
          <button
            type="button"
            onClick={pressRemove}
            onBlur={() => setConfirming(false)}
            disabled={busy}
            aria-label={
              confirming
                ? `Confirm removing table ${table.tableNumber}, unseating ${occupied} guest${occupied === 1 ? "" : "s"}`
                : `Remove table ${table.tableNumber}`
            }
            title={confirming ? "Press again to remove" : "Remove this table"}
            data-remove={table.tableNumber}
            className={`h-9 w-9 rounded-md border text-base leading-none disabled:opacity-50 sm:h-8 sm:w-8 ${
              confirming
                ? "border-red-500 bg-red-600 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </td>
      </tr>

      {(confirming || error !== "") && (
        <tr>
          <td colSpan={3} className={`${cellClass} pt-0`}>
            {confirming && error === "" ? (
              <span className="text-xs text-red-600 dark:text-red-400">
                {`Table ${table.tableNumber} seats ${occupied} guest${
                  occupied === 1 ? "" : "s"
                } — press × again to unseat ${occupied === 1 ? "them" : "them all"} and remove it.`}
              </span>
            ) : (
              <span
                role="alert"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {error}
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
