"use client";

/**
 * How a room is laid out, said as a plan rather than as a list of tables.
 *
 * A room is laid out in twenty of the same table, not in twenty decisions —
 * but not every room is twenty of one thing. A venue with long tables down the
 * hall and round ones at the back is two decisions, not forty, so the plan is
 * a list of configurations: so many tables of such a shape with so many seats,
 * and then so many of another. One is the common case and costs one line.
 *
 * Both screens that lay a room out ask the same thing — the New event form and
 * an event's own row on Manage events — and neither keeps a line per table.
 *
 * On an event that already exists the plan is reconciled rather than applied
 * from nothing, which is the whole difficulty of this file. The tables that
 * survive keep their identity, because a guest is seated by table number and a
 * table that quietly became a different table would take its guests with it:
 * the lowest-numbered tables are kept and matched to the plan in order, the
 * surplus is dropped, and anything new is numbered past the highest ever used.
 * What that would cost is counted and said before it is saved.
 *
 * The plan is read back out of the stored tables by grouping consecutive runs
 * of the same shape and size, so a room laid out as two configurations opens
 * as the same two rather than as an average of them.
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
  "h-11 w-full min-w-0 rounded-md border border-line bg-field px-2 text-base text-ink disabled:opacity-50 sm:h-9 sm:text-sm";
const labelClass = "text-xs text-ink-muted";
const ROW_GRID = "grid grid-cols-[minmax(5rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_auto] items-center gap-1";

/** What the tables are, in a form two layouts can be compared by. */
export function signatureOfTables(tables: readonly Table[]): string {
  return JSON.stringify(
    [...tables]
      .sort((a, b) => a.tableNumber - b.tableNumber)
      .map((table) => [table.id, String(table.seatCount), table.shape]),
  );
}

/** One configuration as typed: so many tables of a shape and a size. */
export interface TableGroup {
  /** A React key and nothing else. */
  key: number;
  shape: TableShape;
  count: string;
  seats: string;
}

/** A table the plan calls for, before it is matched to one that exists. */
interface PlannedTable {
  seatCount: number;
  shape: TableShape;
}

/**
 * The stored tables read back as configurations: consecutive runs of the same
 * shape and size, in table-number order.
 *
 * Runs rather than a tally, so a room of ten long then four round then ten
 * long more comes back as the three it was laid out as. Which also means the
 * order of the configurations is the order of the table numbers, and reordering
 * them is a real change to the room rather than a tidy-up.
 */
function groupsOf(
  tables: readonly Table[],
  firstKey: number,
): TableGroup[] {
  const groups: TableGroup[] = [];

  for (const table of tables) {
    const last = groups[groups.length - 1];
    if (
      last !== undefined &&
      last.shape === table.shape &&
      last.seats === String(table.seatCount)
    ) {
      last.count = String(Number(last.count) + 1);
      continue;
    }
    groups.push({
      key: firstKey + groups.length,
      shape: table.shape,
      count: "1",
      seats: String(table.seatCount),
    });
  }

  return groups;
}

export interface TablePlan {
  groups: readonly TableGroup[];
  setShape: (key: number, shape: TableShape) => void;
  setCount: (key: number, count: string) => void;
  setSeats: (key: number, seats: string) => void;
  add: () => void;
  removeGroup: (key: number) => void;
  /** The tables the plan would leave, ready for the repository. */
  toInputs: () => { tables: TableInput[] } | { error: string };
  /** Tables the plan would drop, lowest numbers kept. */
  removed: Table[];
  /** Surviving tables whose size or shape the plan would change. */
  altered: Table[];
  /** The layout this plan describes, to compare with the one stored. */
  signature: string;
  /**
   * Start again from these tables — what Cancel does, and what happens when a
   * save lands and the stored event changes underneath. It moves the baseline
   * as well as the fields: what the plan is reconciled against has to be what
   * is actually stored, or the next save would be measured from a room that no
   * longer exists.
   */
  reset: (tables: readonly Table[]) => void;
}

interface State {
  groups: TableGroup[];
  nextKey: number;
  /** The stored tables the plan is reconciled against, in number order. */
  baseline: Table[];
}

function initialState(initial: readonly Table[], defaultSeats: number): State {
  const baseline = [...initial].sort((a, b) => a.tableNumber - b.tableNumber);
  const groups = groupsOf(baseline, 0);

  return {
    baseline,
    // A new event opens on one table: a function needs somewhere to seat
    // people, and nought is a decision rather than a default.
    groups:
      groups.length > 0
        ? groups
        : [
            {
              key: 0,
              shape: DEFAULT_TABLE_SHAPE,
              count: "1",
              seats: String(defaultSeats),
            },
          ],
    nextKey: Math.max(groups.length, 1),
  };
}

export function useTablePlan(
  defaultSeats: number,
  initial: readonly Table[] = [],
): TablePlan {
  const [state, setState] = useState<State>(() =>
    initialState(initial, defaultSeats),
  );

  const change = (key: number, apply: (group: TableGroup) => TableGroup) =>
    setState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.key === key ? apply(group) : group,
      ),
    }));

  /** Every table the plan calls for, in order, or why it cannot be read. */
  function planned(): { tables: PlannedTable[] } | { error: string } {
    const tables: PlannedTable[] = [];

    for (const [index, group] of state.groups.entries()) {
      const named = state.groups.length === 1 ? "" : ` in line ${index + 1}`;

      const howMany = group.count.trim() === "" ? Number.NaN : Number(group.count);
      if (!Number.isInteger(howMany) || howMany < 0) {
        return { error: `Enter how many tables${named}, as a whole number.` };
      }

      // Nought of a configuration is not an error: it is a line somebody has
      // emptied rather than removed, and its seat count is then nobody's
      // business.
      if (howMany === 0) continue;

      const each = group.seats.trim() === "" ? Number.NaN : Number(group.seats);
      if (!Number.isInteger(each) || each < 1) {
        return { error: `Enter how many seats a table has${named}, at least 1.` };
      }
      if (each > MAX_SEAT_COUNT) {
        return { error: `${MAX_SEAT_COUNT} seats is as large as a table gets.` };
      }

      for (let made = 0; made < howMany; made++) {
        tables.push({ seatCount: each, shape: group.shape });
      }

      if (tables.length > MAX_TABLES) {
        return { error: `${MAX_TABLES} tables is as many as one event holds.` };
      }
    }

    return { tables };
  }

  const wanted = planned();
  const keeping = "error" in wanted ? 0 : wanted.tables.length;

  const removed = "error" in wanted ? [] : state.baseline.slice(keeping);
  const altered =
    "error" in wanted
      ? []
      : state.baseline
          .slice(0, keeping)
          .filter(
            (table, index) =>
              table.seatCount !== wanted.tables[index].seatCount ||
              table.shape !== wanted.tables[index].shape,
          );

  function toInputs(): { tables: TableInput[] } | { error: string } {
    if ("error" in wanted) return wanted;

    // The tables that survive are named by id, so they stay the tables their
    // guests are sitting at. The rest are new, and the repository numbers
    // them past the highest ever used.
    return {
      tables: wanted.tables.map((table, index) => ({
        id: index < state.baseline.length ? state.baseline[index].id : null,
        seatCount: table.seatCount,
        shape: table.shape,
      })),
    };
  }

  const ready = toInputs();

  return {
    groups: state.groups,
    setShape: (key, shape) => change(key, (group) => ({ ...group, shape })),
    setCount: (key, count) => change(key, (group) => ({ ...group, count })),
    setSeats: (key, seats) => change(key, (group) => ({ ...group, seats })),
    add: () =>
      setState((current) => {
        const last = current.groups[current.groups.length - 1];
        return {
          ...current,
          groups: [
            ...current.groups,
            {
              key: current.nextKey,
              // A second configuration is a second kind of table, so it opens
              // on a different shape from the one above where it can.
              shape:
                last === undefined
                  ? DEFAULT_TABLE_SHAPE
                  : (TABLE_SHAPES.find(
                      (option) => option.value !== last.shape,
                    )?.value ?? DEFAULT_TABLE_SHAPE),
              count: "1",
              seats: last?.seats ?? String(defaultSeats),
            },
          ],
          nextKey: current.nextKey + 1,
        };
      }),
    removeGroup: (key) =>
      setState((current) => ({
        ...current,
        groups: current.groups.filter((group) => group.key !== key),
      })),
    toInputs,
    removed,
    altered,
    signature:
      "error" in ready
        ? "invalid"
        : JSON.stringify(
            ready.tables.map((table) => [
              table.id,
              String(table.seatCount),
              table.shape,
            ]),
          ),
    reset: (from) =>
      setState((current) => {
        const fresh = initialState(from, defaultSeats);
        return { ...fresh, nextKey: current.nextKey + fresh.groups.length };
      }),
  };
}

interface Props {
  plan: TablePlan;
  disabled?: boolean;
  /**
   * Guests at each table, by table number. Only used to say what dropping a
   * table would cost, so the New event form — whose tables have nobody at them
   * yet — leaves it out.
   */
  seated?: ReadonlyMap<number, number>;
  /**
   * Distinguishes one planner's fields from another's on a screen of events.
   * Written out even when it is empty — an attribute that disappears on the
   * one screen with a single planner is an attribute nothing can find there.
   */
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

  /** "20 long of 10, 4 round of 8". */
  const described = plan.groups
    .filter((group) => Number(group.count) > 0)
    .map(
      (group) => `${group.count} ${group.shape} of ${group.seats || "?"}`,
    )
    .join(", ");

  return (
    <div data-tables-plan={scope}>
      <div className="text-xs font-medium text-ink-soft">
        Tables
      </div>

      {/* Named once above the rows rather than beside every field: with three
          configurations the labels would outnumber what they label. */}
      <div className={`mt-1 ${ROW_GRID} ${labelClass}`}>
        <span>Table form</span>
        <span>Number</span>
        <span>Seats each</span>
        <span className="w-9" />
      </div>

      <ul className="mt-0.5 flex flex-col gap-1">
        {plan.groups.map((group, index) => (
          <li key={group.key} className={ROW_GRID} data-table-group={index}>
            <select
              value={group.shape}
              disabled={disabled}
              aria-label={`Table form, line ${index + 1}${suffix}`}
              data-table-shape={index}
              onChange={(changed) =>
                plan.setShape(group.key, changed.target.value as TableShape)
              }
              className={fieldClass}
            >
              {TABLE_SHAPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={0}
              max={MAX_TABLES}
              step={1}
              inputMode="numeric"
              value={group.count}
              disabled={disabled}
              aria-label={`Number of tables, line ${index + 1}${suffix}`}
              data-table-count={index}
              onChange={(changed) =>
                plan.setCount(group.key, changed.target.value)
              }
              className={fieldClass}
            />

            <input
              type="number"
              min={1}
              max={MAX_SEAT_COUNT}
              step={1}
              inputMode="numeric"
              value={group.seats}
              disabled={disabled}
              aria-label={`Seats per table, line ${index + 1}${suffix}`}
              data-table-seats={index}
              onChange={(changed) =>
                plan.setSeats(group.key, changed.target.value)
              }
              className={fieldClass}
            />

            {/* Square, so it reads as a cross rather than a word. Only where
                there is more than one line: the last one is the room. */}
            {plan.groups.length > 1 ? (
              <button
                type="button"
                onClick={() => plan.removeGroup(group.key)}
                disabled={disabled}
                aria-label={`Remove table line ${index + 1}${suffix}`}
                title="Remove this line"
                data-table-group-remove={index}
                className="h-11 w-9 shrink-0 rounded-md border border-line text-base leading-none text-ink-soft hover:bg-muted disabled:opacity-50 sm:h-9"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : (
              <span className="w-9" />
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={plan.add}
        disabled={disabled}
        data-add-table-group={scope}
        className="mt-1.5 h-9 rounded-md border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
      >
        + Add another table size or shape
      </button>

      {/* What the lines add up to, so a room can be checked without doing the
          arithmetic. */}
      <p
        data-tables-plan-summary
        className="mt-1 text-xs text-ink-muted"
      >
        {"error" in planned
          ? planned.error
          : planned.tables.length === 0
            ? "No tables. Nobody can be seated until there are some."
            : `${described} - ${planned.tables.length} table${planned.tables.length === 1 ? "" : "s"}, ${planned.tables.reduce((total, table) => total + table.seatCount, 0)} seats in all.`}
      </p>

      {/* Saving is what does any of this, so what it would do is said before
          it is pressed rather than found afterwards. */}
      {plan.removed.length > 0 && (
        <p
          data-tables-removing
          className="mt-1 text-xs text-cta"
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

      {plan.altered.length > 0 && (
        <p
          data-tables-altering
          className="mt-1 text-xs text-cta"
        >
          Saving changes the size or shape of table
          {plan.altered.length === 1
            ? ` ${plan.altered[0].tableNumber}`
            : `s ${plan.altered.map((table) => table.tableNumber).join(", ")}`}
          .
        </p>
      )}
    </div>
  );
}
