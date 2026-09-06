"use client";

/**
 * The editor for an event's tables, and the row state behind it.
 *
 * Tables live on Manage events: set up at the foot of the New event form when
 * the event is scheduled, and changed afterwards in the row that edits the
 * event's name, date and prices. The event had a Tables tab of its own once;
 * with both of those in place it showed a list the dashboard already shows,
 * so it is gone.
 *
 * Built along the same lines as the ticket prices editor beside it: the rows
 * live in a hook so the two screens share the parsing and the validation.
 * Unlike a price, a table has identity — a guest is seated by table number —
 * so each row remembers which stored table it is, and a row with no id is a
 * table being added.
 */

import { useState } from "react";
import type { TableInput } from "@/lib/repository";
import { DEFAULT_SEAT_COUNT, type Table } from "@/lib/types";
import { useEventContext } from "@/components/event-provider";
import { DENSE_FIELD_CLASS } from "@/components/form-styles";

/** One table as typed, before it is a seat count. */
export interface TableRowDraft {
  /** A React key and nothing else, so a removed line frees nothing. */
  key: number;
  /** The stored table this line is, or null for one being added. */
  id: string | null;
  seats: string;
}

/** A row with the number it will carry once saved. */
export interface NumberedTableRow extends TableRowDraft {
  tableNumber: number;
}

const fieldClass = DENSE_FIELD_CLASS;

/** What the rows hold, in a form two of them can be compared by. */
function rowsSignature(rows: readonly TableRowDraft[]): string {
  return JSON.stringify(rows.map((row) => [row.id, row.seats.trim()]));
}

/** The signature the editor would show for tables already stored. */
export function signatureOfTables(tables: readonly Table[]): string {
  return JSON.stringify(
    tables.map((table) => [table.id, String(table.seatCount)]),
  );
}

export interface TableRows {
  /** In the order they will be saved, each with the number it will carry. */
  rows: NumberedTableRow[];
  add: () => void;
  removeRow: (key: number) => void;
  setSeats: (key: number, value: string) => void;
  /** Replace every line, for when the stored event changes underneath. */
  reset: (tables: readonly Table[]) => void;
  /** Ready for the repository, or the reason they are not. */
  toInputs: () => { tables: TableInput[] } | { error: string };
  signature: string;
}

interface State {
  rows: TableRowDraft[];
  nextKey: number;
  /**
   * The highest table number the stored event uses, which is what a table
   * added here will be numbered from. Fixed when the stored tables are read,
   * not derived from the rows, so it matches the number the repository will
   * actually hand out: removing the last table and adding one gives the new
   * table the next number up, never the number just freed.
   */
  baseNumber: number;
}

function rowsOf(tables: readonly Table[], firstKey: number): TableRowDraft[] {
  return tables.map((table, index) => ({
    key: firstKey + index,
    id: table.id,
    seats: String(table.seatCount),
  }));
}

function highestNumber(tables: readonly Table[]): number {
  return tables.reduce((max, table) => Math.max(max, table.tableNumber), 0);
}

/**
 * Hold the lines of the editor.
 *
 * Keys only ever count upwards, including across a reset, so a line can never
 * inherit the identity — and with it the cursor — of a line just removed.
 */
export function useTableRows(
  initial: readonly Table[] = [],
  options: { startWithOne?: boolean } = {},
): TableRows {
  /**
   * What a table starts with, from Settings — a room laid out in eights
   * should not be retyped table by table. Read here rather than passed in by
   * each caller: both of them are inside the provider, and a default is the
   * hook's business rather than the form's.
   *
   * Read once, on the way in: changing the setting should not renumber the
   * seats in a form somebody is halfway through filling out.
   */
  const { settings } = useEventContext();
  const [defaultSeats] = useState(
    () => settings.defaultSeatCount || DEFAULT_SEAT_COUNT,
  );

  /**
   * The lines and the next key to hand out in one piece of state, for the
   * same reason the ticket prices editor keeps its counter there: working the
   * key out inside the updater takes it from the value that was current.
   */
  const [state, setState] = useState<State>(() => {
    const existing = rowsOf(initial, 0);

    // A function needs somewhere to seat people, so the New event form opens
    // with one table at the default rather than with nothing.
    return existing.length === 0 && options.startWithOne === true
      ? {
          rows: [{ key: 0, id: null, seats: String(defaultSeats) }],
          nextKey: 1,
          baseNumber: 0,
        }
      : {
          rows: existing,
          nextKey: existing.length,
          baseNumber: highestNumber(initial),
        };
  });

  // Numbered here rather than stored on the rows: a new table's number
  // depends on how many new lines sit above it, which changes as lines are
  // added and removed. A plain loop rather than a map, because the running
  // number must not be reassigned from inside a closure.
  const stored = new Map(initial.map((table) => [table.id, table.tableNumber]));
  const rows: NumberedTableRow[] = [];
  let nextNumber = state.baseNumber;
  for (const row of state.rows) {
    if (row.id !== null) {
      rows.push({ ...row, tableNumber: stored.get(row.id) ?? 0 });
      continue;
    }
    nextNumber += 1;
    rows.push({ ...row, tableNumber: nextNumber });
  }

  return {
    rows,
    add: () =>
      setState((current) => ({
        ...current,
        rows: [
          ...current.rows,
          // A new line starts from the one above it: a room is usually laid
          // out in tables of one size, so the last count entered is a better
          // guess than the default.
          {
            key: current.nextKey,
            id: null,
            seats:
              current.rows[current.rows.length - 1]?.seats ??
              String(defaultSeats),
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
    reset: (tables) =>
      setState((current) => ({
        rows: rowsOf(tables, current.nextKey),
        nextKey: current.nextKey + tables.length,
        baseNumber: highestNumber(tables),
      })),
    toInputs: () => {
      const tables: TableInput[] = [];

      for (const row of rows) {
        const seats = row.seats.trim();

        // A line left blank is a table nobody decided on, not a mistake:
        // adding one and thinking better of it should not have to be undone
        // before the event can be saved. A stored table cleared to nothing is
        // a different matter — that is a table being taken away, and the
        // cross is how that is said, so it is refused here.
        if (seats === "") {
          if (row.id === null) continue;
          return {
            error: `Table ${row.tableNumber} needs a seat count. Remove it with the cross instead.`,
          };
        }

        const parsed = Number(seats);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return {
            error: `Table ${row.tableNumber} needs a whole number of seats, at least 1.`,
          };
        }

        tables.push({ id: row.id, seatCount: parsed });
      }

      return { tables };
    },
    signature: rowsSignature(state.rows),
  };
}

interface Props {
  control: TableRows;
  disabled?: boolean;
  /**
   * Guests seated at each table, by table number. Only used to say what
   * removing a table would cost, so the New event form, whose tables have
   * nobody at them yet, leaves it out.
   */
  seated?: ReadonlyMap<number, number>;
  /**
   * Distinguishes one editor's fields from another's on a screen showing
   * several events, for both accessible names and the data attributes.
   */
  scope?: string;
  /** Named in the accessible labels, so each field says which event it is. */
  ofWhat?: string;
}

export function TablesEditor({
  control,
  disabled = false,
  seated,
  scope = "",
  ofWhat = "",
}: Props) {
  const suffix = ofWhat === "" ? "" : ` of ${ofWhat}`;

  return (
    <div data-tables-editor={scope || undefined}>
      {/* One label for the block, as the prices have. The fields themselves
          are unlabelled: a number beside the word Table reads as what it is. */}
      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Tables
      </div>

      {control.rows.length > 0 && (
        <ul className="mt-1 grid gap-x-3 gap-y-1.5 @lg:grid-cols-2 @3xl:grid-cols-3">
          {control.rows.map((row) => {
            const guests = seated?.get(row.tableNumber) ?? 0;

            return (
              /* The table's number, its seats, and the cross that deletes the
                 pair. The number is read-only text: a stored table keeps the
                 number its guests are seated by, and a new one is numbered by
                 where it falls in the list. */
              <li
                key={row.key}
                data-table-row={row.tableNumber}
                className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-1"
              >
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Table {row.tableNumber}
                </span>

                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={row.seats}
                  disabled={disabled}
                  aria-label={`Seats at table ${row.tableNumber}${suffix}`}
                  data-table-seats={row.tableNumber}
                  onChange={(changed) =>
                    control.setSeats(row.key, changed.target.value)
                  }
                  className={fieldClass}
                  placeholder="Seats"
                />

                {/* Square, so it reads as a cross rather than a word. The
                    accessible name carries what the row cannot: how many
                    guests saving this would unseat. */}
                <button
                  type="button"
                  onClick={() => control.removeRow(row.key)}
                  disabled={disabled}
                  aria-label={
                    guests === 0
                      ? `Remove table ${row.tableNumber}${suffix}`
                      : `Remove table ${row.tableNumber}${suffix}, unseating ${guests} guest${guests === 1 ? "" : "s"}`
                  }
                  title={
                    guests === 0
                      ? "Delete this table"
                      : `Delete this table and unseat ${guests} guest${guests === 1 ? "" : "s"}`
                  }
                  data-table-remove={row.tableNumber}
                  className="h-11 w-11 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 sm:h-9 sm:w-9 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={control.add}
        disabled={disabled}
        data-table-add={scope || undefined}
        className="mt-1.5 h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
      >
        {control.rows.length === 0 ? "+ Add a table" : "+ Add another table"}
      </button>
    </div>
  );
}
