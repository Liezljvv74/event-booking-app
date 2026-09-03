"use client";

import { useState } from "react";
import { CancelledRow } from "@/components/attendee-row";
import type { Attendee, Booking } from "@/lib/types";

/** Cancellations that held the same table, or none at all. */
interface Group {
  /** The table the guests held, or null when they were never seated. */
  tableNumber: number | null;
  guests: Attendee[];
}

/**
 * Cancellations grouped by the table they held, lowest table first and the
 * never-seated last.
 */
function groupByTable(booking: Booking): Group[] {
  const byTable = new Map<number | null, Attendee[]>();

  for (const attendee of booking.attendees) {
    if (attendee.status !== "cancelled") continue;
    const key = attendee.assignedTableNumber;
    const existing = byTable.get(key);
    if (existing) existing.push(attendee);
    else byTable.set(key, [attendee]);
  }

  return [...byTable.entries()]
    .map(([tableNumber, guests]) => ({ tableNumber, guests }))
    .sort((a, b) => {
      if (a.tableNumber === null) return 1;
      if (b.tableNumber === null) return -1;
      return a.tableNumber - b.tableNumber;
    });
}

function where(tableNumber: number | null): string {
  return tableNumber === null ? "never seated" : `table ${tableNumber}`;
}

/**
 * One table's cancellations, rolled into a single line when there is more
 * than one of them.
 *
 * A party that reshuffles a few times would otherwise bury its live guests
 * under closed records. One cancellation stays a plain line — a disclosure
 * for a single name hides nothing worth hiding.
 */
function TableGroup({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);

  if (group.guests.length === 1) {
    return <CancelledRow attendee={group.guests[0]} />;
  }

  return (
    <li data-cancelled-group={group.tableNumber ?? "none"}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        data-cancelled-toggle={group.tableNumber ?? "none"}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <span
          aria-hidden="true"
          className={`text-xs text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {group.guests.length} cancelled · {where(group.tableNumber)}
        </span>
      </button>

      {open && (
        <ul className="flex flex-col gap-0.5">
          {group.guests.map((attendee) => (
            <CancelledRow key={attendee.id} attendee={attendee} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A party's cancellations, kept below its live guests.
 *
 * Their seats are not lost — each cancellation opened a replacement line in
 * the list above — so these rows are the account of what happened rather
 * than anything still to be acted on.
 */
export function CancelledGroup({ booking }: { booking: Booking }) {
  const groups = groupByTable(booking);
  if (groups.length === 0) return null;

  const total = groups.reduce((count, group) => count + group.guests.length, 0);

  return (
    <div data-cancelled-block className="mt-2">
      <p className="px-1 text-xs font-medium text-zinc-500 dark:text-zinc-500">
        {total} cancelled
      </p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {groups.map((group) => (
          <TableGroup key={group.tableNumber ?? "none"} group={group} />
        ))}
      </ul>
    </div>
  );
}
