"use client";

/**
 * How a room is laid out, said as a plan: so many tables of such a shape with
 * so many seats each.
 *
 * A room is laid out in twenty of the same table, not in twenty decisions.
 * Both screens that lay one out — the New event form and an event's own row on
 * Manage events — ask the same three questions, and neither keeps a line per
 * table any more.
 *
 * On an event that already exists the plan is reconciled rather than applied
 * from nothing, which is the whole difficulty of this file. The tables that
 * survive keep their identity, because a guest is seated by table number and
 * a table that quietly became a different table would take its guests with
 * it: the lowest-numbered tables are kept and re-seated to the plan, the
 * surplus above the count is dropped, and anything new is numbered past the
 * highest ever used. What that would cost is counted and said before it is
 * saved, never discovered afterwards.
 */

import { useState } from "react";
import type { TableInput } from "@/lib/repository";
import {
  DEFAULT_TABLE_SHAPE,
  MAX_SEAT_COUNT,
  MAX_TABLES,
  type Table,
  type TableShape,
} from "@/lib/types";

/** The three shapes, in the order they are offered. */
export const TABLE_SHAPES: readonly { value: TableShape; label: string }[] = [
  { value: "long", label: "Long" },
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
];

const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-xs text-zinc-600 dark:text-zinc-400";

/** What the tables are, in a form two layouts can be compared by. */
export function signatureOfTables(tables: readonly Table[]): string {
  return JSON.stringify(
    [...tables]
      .sort((a, b) => a.tableNumber - b.tableNumber)
      .map((table) => [table.id, String(table.seatCount), table.shape]),
  );
}

/** The value most of them have, for a plan that has to name one. */
function commonest<T>(values: readonly T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  let best = fallback;
  let most = 0;
  for (const [value, count] of counts) {
    if (count > most) {
      best = value;
      most = count;
    }
  }
  return best;
}

export interface TablePlan {
  shape: TableShape;
  setShape: (shape: TableShape) => void;
  count: string;
  setCount: (count: string) => void;
  seats: string;
  setSeats: (seats: string) => void;
  /** The tables the plan would leave, ready for the repository. */
  toInputs: () => { tables: TableInput[] } | { error: string };
  /** Tables the count would drop, lowest numbers kept. */
  removed: Table[];
  /** Whether any surviving table's seats or shape would change. */
  altered: boolean;
  /** The layout this plan describes, to compare with the one stored. */
  signature: string;
  /**
   * Start again from these tables — what Cancel does, and what happens when a
   * save lands and the stored event changes underneath. It moves the baseline
   * as well as the fields: what the plan is reconciled against has to be what
   * is actually stored, or the next save would be measured from a room that
   * no longer exists.
   */
  reset: (tables: readonly Table[]) => void;
}

/**
 * Hold the plan.
 *
 * The stored tables are read once, on the way in. They are what the fields
 * start from and what the plan is reconciled against, and re-reading them
 * while somebody is typing would move the ground under them.
 */
export function useTablePlan(
  defaultSeats: number,
  initial: readonly Table[] = [],
): TablePlan {
  const [tables, setTables] = useState(() =>
    [...initial].sort((a, b) => a.tableNumber - b.tableNumber),
  );

  const [shape, setShape] = useState<TableShape>(() =>
    commonest(
      tables.map((table) => table.shape),
      DEFAULT_TABLE_SHAPE,
    ),
  );
  const [count, setCount] = useState(() =>
    // A new event opens on one table: a function needs somewhere to seat
    // people, and nought is a decision rather than a default.
    String(tables.length === 0 ? 1 : tables.length),
  );
  const [seats, setSeats] = useState(() =>
    String(
      commonest(
        tables.map((table) => table.seatCount),
        defaultSeats,
      ),
    ),
  );

  const howMany = count.trim() === "" ? Number.NaN : Number(count);
  const each = seats.trim() === "" ? Number.NaN : Number(seats);

  const keeping = Number.isInteger(howMany) ? Math.max(howMany, 0) : 0;
  const removed = Number.isInteger(howMany) ? tables.slice(keeping) : [];
  const altered =
    Number.isInteger(each) &&
    tables
      .slice(0, keeping)
      .some((table) => table.seatCount !== each || table.shape !== shape);

  function toInputs(): { tables: TableInput[] } | { error: string } {
    if (!Number.isInteger(howMany) || howMany < 0) {
      return { error: "Enter how many tables, as a whole number." };
    }
    if (howMany > MAX_TABLES) {
      return { error: `${MAX_TABLES} tables is as many as one event holds.` };
    }

    // Nought tables means the room is not laid out yet, so how many seats a
    // table has is not asked about: there is no table to have them.
    if (howMany === 0) return { tables: [] };

    if (!Number.isInteger(each) || each < 1) {
      return { error: "Enter how many seats a table has, at least 1." };
    }
    if (each > MAX_SEAT_COUNT) {
      return { error: `${MAX_SEAT_COUNT} seats is as large as a table gets.` };
    }

    // The tables that survive are named by id, so they stay the tables their
    // guests are sitting at. The rest are new, and the repository numbers
    // them past the highest ever used.
    return {
      tables: Array.from({ length: howMany }, (unused, index) => ({
        id: index < tables.length ? tables[index].id : null,
        seatCount: each,
        shape,
      })),
    };
  }

  const planned = toInputs();

  return {
    shape,
    setShape,
    count,
    setCount,
    seats,
    setSeats,
    toInputs,
    removed,
    altered,
    reset: (from) => {
      const sorted = [...from].sort((a, b) => a.tableNumber - b.tableNumber);
      setTables(sorted);
      setShape(
        commonest(
          sorted.map((table) => table.shape),
          DEFAULT_TABLE_SHAPE,
        ),
      );
      setCount(String(sorted.length));
      setSeats(
        String(
          commonest(
            sorted.map((table) => table.seatCount),
            defaultSeats,
          ),
        ),
      );
    },
    signature:
      "error" in planned
        ? "invalid"
        : JSON.stringify(
            planned.tables.map((table) => [
              table.id,
              String(table.seatCount),
              table.shape,
            ]),
          ),
  };
}

interface Props {
  plan: TablePlan;
  disabled?: boolean;
  /**
   * Guests at each table, by table number. Only used to say what dropping a
   * table would cost, so the New event form — whose tables have nobody at
   * them yet — leaves it out.
   */
  seated?: ReadonlyMap<number, number>;
  /** Distinguishes one planner's fields from another's on a screen of events. */
  scope?: string;
  /** Named in the accessible labels, so each field says which event it is. */
  ofWhat?: string;
}

export function TablesPlanner({
  plan,
  disabled = false,
  seated,
  scope = "",
  ofWhat = "",
}: Props) {
  const suffix = ofWhat === "" ? "" : ` of ${ofWhat}`;
  const planned = plan.toInputs();

  const unseating = plan.removed.reduce(
    (total, table) => total + (seated?.get(table.tableNumber) ?? 0),
    0,
  );

  return (
    <div data-tables-plan={scope || undefined}>
      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Tables
      </div>

      <div className="mt-1 grid gap-2 @lg:grid-cols-[minmax(6rem,1fr)_minmax(5rem,1fr)_minmax(5rem,1fr)]">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Table form</span>
          <select
            value={plan.shape}
            disabled={disabled}
            aria-label={`Table form${suffix}`}
            data-table-shape={scope || undefined}
            onChange={(changed) =>
              plan.setShape(changed.target.value as TableShape)
            }
            className={fieldClass}
          >
            {TABLE_SHAPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Number of tables</span>
          <input
            type="number"
            min={0}
            max={MAX_TABLES}
            step={1}
            inputMode="numeric"
            value={plan.count}
            disabled={disabled}
            aria-label={`Number of tables${suffix}`}
            data-table-count={scope || undefined}
            onChange={(changed) => plan.setCount(changed.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Seats per table</span>
          <input
            type="number"
            min={1}
            max={MAX_SEAT_COUNT}
            step={1}
            inputMode="numeric"
            value={plan.seats}
            disabled={disabled}
            aria-label={`Seats per table${suffix}`}
            data-table-seats={scope || undefined}
            onChange={(changed) => plan.setSeats(changed.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {/* What the three fields add up to, so a room can be checked without
          doing the multiplication. */}
      <p
        data-tables-plan-summary
        className="mt-1 text-xs text-zinc-600 dark:text-zinc-400"
      >
        {"error" in planned
          ? planned.error
          : planned.tables.length === 0
            ? "No tables. Nobody can be seated until there are some."
            : `${planned.tables.length} ${plan.shape} table${planned.tables.length === 1 ? "" : "s"}, ${planned.tables.reduce((total, table) => total + table.seatCount, 0)} seats in all.`}
      </p>

      {/* Saving is what does any of this, so what it would do is said before
          it is pressed rather than found afterwards. */}
      {plan.removed.length > 0 && (
        <p
          data-tables-removing
          className="mt-1 text-xs text-amber-700 dark:text-amber-500"
        >
          Saving drops table
          {plan.removed.length === 1
            ? ` ${plan.removed[0].tableNumber}`
            : `s ${plan.removed.map((table) => table.tableNumber).join(", ")}`}
          {unseating > 0
            ? `, unseating ${unseating} guest${unseating === 1 ? "" : "s"}`
            : ""}
          .
        </p>
      )}

      {plan.altered && (
        <p
          data-tables-altering
          className="mt-1 text-xs text-amber-700 dark:text-amber-500"
        >
          The tables that stay are not all this size or shape yet. Saving makes
          every one of them {plan.seats} seats, {plan.shape}.
        </p>
      )}
    </div>
  );
}
