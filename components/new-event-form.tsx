"use client";

import { useState } from "react";
import { todayIso } from "@/lib/event-time";
import type { EventTimes } from "@/lib/repository";
import type { NewEventInput } from "@/lib/use-events";
import {
  TicketPricesEditor,
  useTicketPriceRows,
} from "@/components/ticket-prices-editor";
import { TablesEditor, useTableRows } from "@/components/tables-editor";

interface Props {
  /**
   * Times from the event saved most recently, filled in ready to edit. A
   * venue's functions tend to run to the same hours, so the common case is
   * to leave them as they are.
   */
  lastTimes: EventTimes;
  onCreate: (input: NewEventInput) => Promise<unknown>;
}

const fieldClass =
  "h-11 w-full min-w-0 rounded-md sm:h-9 border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-xs text-zinc-600 dark:text-zinc-400";

export function NewEventForm({ lastTimes, onCreate }: Props) {
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  // Read once, at mount. The form sits on the screen permanently now, so
  // what remounts it is the caller giving it a new key after each event is
  // created — which both clears the fields and re-reads these times from the
  // event just saved.
  const [startTime, setStartTime] = useState(lastTimes.startTime ?? "");
  const [endTime, setEndTime] = useState(lastTimes.endTime ?? "");
  // A new event has no prices to load, and opens with one blank line ready.
  const prices = useTicketPriceRows([], { startWithBlank: true });
  // A new event opens with one table at the default, so the room is visibly
  // somewhere to be laid out rather than something to remember later.
  const tables = useTableRows([], { startWithOne: true });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Give the event a name.");
      return;
    }
    if (eventDate === "") {
      setError("Pick an event date.");
      return;
    }
    const priced = prices.toInputs();
    if ("error" in priced) {
      setError(priced.error);
      return;
    }
    const seated = tables.toInputs();
    if ("error" in seated) {
      setError(seated.error);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onCreate({
        name: trimmed,
        eventDate,
        startTime: startTime === "" ? null : startTime,
        endTime: endTime === "" ? null : endTime,
        ticketPrices: priced.prices,
        tables: seated.tables,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* Name, then the date and times to the right of it, the same shape
          an event has on Manage events. */}
      <div className="grid gap-2 @xl:grid-cols-[minmax(9rem,1fr)_10rem_7rem_7rem]">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Event name</span>
          <input
            type="text"
            name="name"
            value={name}
            disabled={saving}
            onChange={(changed) => setName(changed.target.value)}
            className={fieldClass}
            placeholder="Spring Gala"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Date</span>
          <input
            type="date"
            name="eventDate"
            value={eventDate}
            disabled={saving}
            onChange={(changed) => setEventDate(changed.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Start</span>
          <input
            type="time"
            name="startTime"
            value={startTime}
            disabled={saving}
            onChange={(changed) => setStartTime(changed.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>End</span>
          <input
            type="time"
            name="endTime"
            value={endTime}
            disabled={saving}
            onChange={(changed) => setEndTime(changed.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {/* Below the row, because the date now sits where they used to. */}
      <div className="mt-1.5">
        <TicketPricesEditor control={prices} disabled={saving} />
      </div>

      {/* Last thing before the button: the tables are the event's furniture
          rather than its identity, and they are the longest list here. The
          same block appears in the event's row on Manage events, which is
          where they are changed afterwards. */}
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <TablesEditor control={tables} disabled={saving} />
      </div>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* No Cancel beside it: there is nothing to cancel back to now that
          the form is always on the screen. */}
      <button
        type="submit"
        disabled={saving}
        data-create-event
        className="mt-4 h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
      >
        {saving ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
