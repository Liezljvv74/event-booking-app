"use client";

import { useState } from "react";
import { addDays, formatEventDate, todayIso } from "@/lib/event-time";
import type { EventTimes } from "@/lib/repository";
import type { NewEventInput } from "@/lib/use-events";
import { MAX_REPEATS } from "@/lib/types";
import {
  TicketPricesEditor,
  useTicketPriceRows,
} from "@/components/ticket-prices-editor";
import { TablesPlanner, useTablePlan } from "@/components/tables-planner";
import { useEventContext } from "@/components/event-provider";
import { describeError } from "@/lib/errors";
import { FIELD_CLASS, FIELD_LABEL_CLASS } from "@/components/form-styles";

interface Props {
  /**
   * Times from the event saved most recently, filled in ready to edit. A
   * venue's functions tend to run to the same hours, so the common case is
   * to leave them as they are.
   */
  lastTimes: EventTimes;
  /**
   * Every event the form was asked for, in date order — one, or one and its
   * repeats. The whole list rather than one call per event, because the
   * screen clears this form once the lot has been saved, and a form that
   * cleared itself between the third and the fourth would take the rest of
   * the list with it.
   */
  onCreate: (inputs: readonly NewEventInput[]) => Promise<unknown>;
}

const fieldClass = FIELD_CLASS;
const labelClass = FIELD_LABEL_CLASS;

export function NewEventForm({ lastTimes, onCreate }: Props) {
  const [name, setName] = useState("");
  /**
   * A week after the event saved most recently, on request — a venue's
   * functions tend to run to a rhythm, and the same weekday next week is the
   * likeliest next one. Today, when there is no event to count from.
   *
   * Read once at mount, like the times beside it: what remounts this form is
   * the caller handing it a new key after a save, which is what re-reads all
   * three from the event just written.
   */
  const [eventDate, setEventDate] = useState(
    lastTimes.eventDate === null ? todayIso() : addDays(lastTimes.eventDate, 7),
  );
  // Read once, at mount. The form sits on the screen permanently now, so
  // what remounts it is the caller giving it a new key after each event is
  // created — which both clears the fields and re-reads these times from the
  // event just saved.
  const [startTime, setStartTime] = useState(lastTimes.startTime ?? "");
  const [endTime, setEndTime] = useState(lastTimes.endTime ?? "");
  // A new event has no prices to load, and opens with one blank line ready.
  const prices = useTicketPriceRows([], { startWithBlank: true });
  // How the room is laid out, said as a plan: so many tables of such a shape
  // with so many seats each. Twenty of the same table is one line to read
  // rather than twenty, and one decision rather than twenty presses.
  const { settings } = useEventContext();
  const tables = useTablePlan(settings.defaultSeatCount);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /**
   * Whether to make more than one of this event, and how many more.
   *
   * "Repeat 3 times" means three more after the first, a week apart — which
   * is the same week the date above is defaulted by, so a rhythm entered once
   * carries through the lot. The line under the button spells the dates out
   * rather than leaving the counting to be done twice.
   */
  const [repeat, setRepeat] = useState<"no" | "yes">("no");
  const [times, setTimes] = useState("1");

  /**
   * Every date this form would create, the first and then its repeats, a week
   * apart. Just the one when it is not repeating.
   */
  function repeatedDates(): { dates: string[] } | { error: string } {
    if (repeat === "no") return { dates: [eventDate] };

    const more = times.trim() === "" ? Number.NaN : Number(times);
    if (!Number.isInteger(more) || more < 1) {
      return { error: "Enter how many times to repeat it, at least once." };
    }
    if (more > MAX_REPEATS) {
      return { error: `${MAX_REPEATS} repeats is as many as one press makes.` };
    }

    return {
      dates: Array.from({ length: more + 1 }, (unused, index) =>
        addDays(eventDate, index * 7),
      ),
    };
  }

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

    const dates = repeatedDates();
    if ("error" in dates) {
      setError(dates.error);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onCreate(
        dates.dates.map((date) => ({
          name: trimmed,
          eventDate: date,
          startTime: startTime === "" ? null : startTime,
          endTime: endTime === "" ? null : endTime,
          ticketPrices: priced.prices,
          tables: seated.tables,
        })),
      );
    } catch (caught) {
      setError(describeError(caught));
      setSaving(false);
    }
  }

  // What the button is about to make, worked out once for the label and the
  // line beneath it.
  const planned = repeatedDates();
  const made = "error" in planned ? 1 : planned.dates.length;

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-line-soft bg-surface p-4"
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
          rather than its identity. Manage events is where they become a list
          — by then they differ from one another, which is the point at which
          a list is worth reading. */}
      <div className="mt-3 border-t border-line-soft pt-3">
        <TablesPlanner plan={tables} disabled={saving} />
      </div>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* No Cancel beside it: there is nothing to cancel back to now that
          the form is always on the screen. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          data-create-event
          className="h-11 rounded-md bg-primary hover:bg-primary-hover transition-colors px-4 text-base font-medium text-primary-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : made === 1 ? "Create event" : `Create ${made} events`}
        </button>

        <label className="flex items-center gap-2 text-sm text-ink">
          Repeat event
          <select
            value={repeat}
            disabled={saving}
            aria-label="Repeat this event"
            data-repeat
            onChange={(changed) => {
              setRepeat(changed.target.value as "no" | "yes");
              setError("");
            }}
            className="h-11 rounded-md border border-line bg-field px-2 text-sm text-ink disabled:opacity-50 sm:h-9"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        {repeat === "yes" && (
          <label className="flex items-center gap-2 text-sm text-ink">
            times
            <input
              type="number"
              min={1}
              max={MAX_REPEATS}
              step={1}
              inputMode="numeric"
              value={times}
              disabled={saving}
              aria-label="How many times to repeat the event"
              data-repeat-times
              onChange={(changed) => {
                setTimes(changed.target.value);
                setError("");
              }}
              className="h-11 w-20 rounded-md border border-line bg-field px-2 text-sm text-ink disabled:opacity-50 sm:h-9"
            />
          </label>
        )}
      </div>

      {/* The dates spelled out, so "repeat 3 times" does not have to be read
          twice to work out whether it means three events or four. */}
      {repeat === "yes" && (
        <p
          data-repeat-summary
          className="mt-1.5 text-xs text-ink-muted"
        >
          {"error" in planned
            ? planned.error
            : `${planned.dates.length} events, a week apart: ${planned.dates
                .map((date) => formatEventDate(date))
                .join(", ")}.`}
        </p>
      )}
    </form>
  );
}
