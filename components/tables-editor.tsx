"use client";

/**
 * The editor for the tables an event is being scheduled with, and the row
 * state behind it.
 *
 * Tables are settled when the event is created, so this sits at the foot of
 * the New event form rather than on the event's own Tables tab; that tab
 * shows the numbers and the seats and lets a table go, but no longer makes
 * one. Built along the same lines as the ticket prices editor above it: the
 * rows live in a hook so the parsing and the validation are in one place.
 */

import { useState } from "react";
import type { TableInput } from "@/lib/repository";
import { DEFAULT_SEAT_COUNT } from "@/lib/types";

/** One table as typed, before it is a seat count. */
export interface TableRowDraft {
  /** A React key and nothing else; stored tables get their ids on save. */
  key: number;
  seats: string;
}

const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export interface TableRows {
  rows: TableRowDraft[];
  add: () => void;
  removeRow: (key: number) => void;
  setSeats: (key: number, value: string) => void;
  /** Ready for the repository, or the reason they are not. */
  toInputs: () => { tables: TableInput[] } | { error: string };
}

/**
 * Hold the lines of the editor.
 *
 * Keys only ever count upwards, so a line can never inherit the identity —
 * and with it the cursor — of a line that was just removed.
 */
export function useTableRows(): TableRows {
  /**
   * The lines, and the next key to hand out, in one piece of state, for the
   * same reason the ticket prices editor keeps its counter there: working the
   * key out inside the updater takes it from the value that was current.
   *
   * A function needs somewhere to seat people, so the form opens with one
   * table at the default rather than with nothing.
   */
  const [state, setState] = useState<{ rows: TableRowDraft[]; nextKey: number }>(
    () => ({
      rows: [{ key: 0, seats: String(DEFAULT_SEAT_COUNT) }],
      nextKey: 1,
    }),
  );

  const rows = state.rows;

  return {
    rows,
    add: () =>
      setState((current) => ({
        rows: [
          ...current.rows,
          // A new line starts from the one above it: a room is usually laid
          // out with tables of one size, so the last count entered is a
          // better guess than the default.
          {
            key: current.nextKey,
            seats:
              current.rows[current.rows.length - 1]?.seats ??
              String(DEFAULT_SEAT_COUNT),
          },
        ],
        nextKey: current.nextKey + 1,
      })),
    removeRow: (key) =>
      setState((current) => ({
        ...current,
        rows: current.rows.filter((row) => row.key !== key),
      })),
    setSeats: (key, value) =>
      setState((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.key === key ? { ...row, seats: value } : row,
        ),
      })),
    toInputs: () => {
      const tables: TableInput[] = [];

      for (const [index, row] of rows.entries()) {
        const seats = row.seats.trim();

        // A line left blank is a table nobody decided on, not a mistake:
        // adding one and thinking better of it should not have to be undone
        // before the event can be saved. The tables after it move up a
        // number, which is what the form has been showing all along.
        if (seats === "") continue;

        const parsed = Number(seats);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return {
            error: `Table ${index + 1} needs a whole number of seats, at least 1.`,
          };
        }

        tables.push({ seatCount: parsed });
      }

      return { tables };
    },
  };
}

interface Props {
  control: TableRows;
  disabled?: boolean;
}

export function TablesEditor({ control, disabled = false }: Props) {
  return (
    <div data-tables-editor>
      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Tables
      </div>

      {control.rows.length > 0 && (
        <ul className="mt-1 grid gap-x-3 gap-y-1.5 @lg:grid-cols-2 @3xl:grid-cols-3">
          {control.rows.map((row, index) => (
            /* The number the table will get, its seats, and the cross that
               deletes the pair. The number is read-only text: it is the
               line's position in the list, so it follows the list. */
            <li
              key={row.key}
              data-new-table-row={index}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-1"
            >
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Table {index + 1}
              </span>

              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={row.seats}
                disabled={disabled}
                aria-label={`Seats at table ${index + 1}`}
                data-new-table-seats={index}
                onChange={(changed) =>
                  control.setSeats(row.key, changed.target.value)
                }
                className={fieldClass}
                placeholder="Seats"
              />

              <button
                type="button"
                onClick={() => control.removeRow(row.key)}
                disabled={disabled}
                aria-label={`Remove table ${index + 1}`}
                title="Delete this table"
                data-new-table-remove={index}
                className="h-11 w-11 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 sm:h-9 sm:w-9 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={control.add}
        disabled={disabled}
        data-new-table-add
        className="mt-1.5 h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
      >
        {control.rows.length === 0 ? "+ Add a table" : "+ Add another table"}
      </button>
    </div>
  );
}
