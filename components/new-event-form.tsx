"use client";

import { useState } from "react";
import { endsAfterMidnight, todayIso } from "@/lib/event-time";
import type { NewEventInput } from "@/lib/use-events";

interface Props {
  onCreate: (input: NewEventInput) => Promise<unknown>;
  onCancel: () => void;
}

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewEventForm({ onCreate, onCancel }: Props) {
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Not an error: a function can start at 20:00 and end at 01:00. Say so
  // rather than blocking, so a late event can still be entered.
  const crossesMidnight = endsAfterMidnight(
    startTime === "" ? null : startTime,
    endTime === "" ? null : endTime,
  );

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

    setSaving(true);
    setError("");
    try {
      await onCreate({
        name: trimmed,
        eventDate,
        startTime: startTime === "" ? null : startTime,
        endTime: endTime === "" ? null : endTime,
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
      <h2 className="text-base font-semibold text-black dark:text-zinc-50">
        New event
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Expenses are copied from your most recent event so you can start from
        the previous event&apos;s costs. Times are optional and can be added
        later.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>Event name</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(changed) => setName(changed.target.value)}
            autoFocus
            className={fieldClass}
            placeholder="Spring Gala"
          />
        </label>

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

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClass}>Start time</span>
            <input
              type="time"
              name="startTime"
              value={startTime}
              onChange={(changed) => setStartTime(changed.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
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
          {saving ? "Creating…" : "Create event"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-11 rounded-md border border-zinc-300 px-4 text-base font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
