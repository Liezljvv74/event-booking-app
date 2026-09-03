"use client";

import { useState } from "react";
import { endsAfterMidnight, formatEventDate, formatTimeRange } from "@/lib/event-time";
import type { ScheduleInput } from "@/lib/use-events";
import type { Event } from "@/lib/types";

interface Props {
  event: Event;
  onSave: (schedule: ScheduleInput) => Promise<unknown>;
}

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/**
 * Shows the event's date and times, and edits them in place.
 *
 * Editing matters beyond typos: events created before times existed hold
 * null for both, so this is the only way they can gain a schedule.
 */
export function ScheduleEditor({ event, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function open() {
    // Reset from the event each time, so a cancelled edit is not remembered.
    setEventDate(event.eventDate);
    setStartTime(event.startTime ?? "");
    setEndTime(event.endTime ?? "");
    setError("");
    setEditing(true);
  }

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (eventDate === "") {
      setError("Pick an event date.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        eventDate,
        startTime: startTime === "" ? null : startTime,
        endTime: endTime === "" ? null : endTime,
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const times = formatTimeRange(event.startTime, event.endTime);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p
          data-schedule
          className="text-xl font-semibold text-zinc-600 dark:text-zinc-400"
        >
          {formatEventDate(event.eventDate)}
          {times === "" ? " · no times set" : ` · ${times}`}
        </p>
        <button
          type="button"
          onClick={open}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
        >
          Edit date &amp; times
        </button>
      </div>
    );
  }

  const crossesMidnight = endsAfterMidnight(
    startTime === "" ? null : startTime,
    endTime === "" ? null : endTime,
  );

  return (
    <form
      onSubmit={submit}
      className="mt-2 w-full rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Event date</span>
          <input
            type="date"
            name="eventDate"
            value={eventDate}
            onChange={(changed) => setEventDate(changed.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Start time</span>
          <input
            type="time"
            name="startTime"
            value={startTime}
            onChange={(changed) => setStartTime(changed.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>End time</span>
          <input
            type="time"
            name="endTime"
            value={endTime}
            onChange={(changed) => setEndTime(changed.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {crossesMidnight && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Ends after midnight, the day after the event date.
        </p>
      )}

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="h-11 rounded-md border border-zinc-300 px-4 text-base font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
