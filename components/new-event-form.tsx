"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  formatEventDate,
  todayIso,
} from "@/lib/event-time";
import type { EventTimes } from "@/lib/repository";
import type { NewEventInput } from "@/lib/use-events";
import {
  DEFAULT_REPEAT_CADENCE,
  MAX_REPEATS,
  type RepeatCadence,
} from "@/lib/types";
import {
  TicketPricesEditor,
  useTicketPriceRows,
} from "@/components/ticket-prices-editor";
import { TablesPlanner, useTablePlan } from "@/components/tables-planner";
import { RepeatCalendar } from "@/components/repeat-calendar";
import { useEventContext } from "@/components/event-provider";
import { describeError } from "@/lib/errors";
import { FIELD_CLASS, FIELD_LABEL_CLASS } from "@/components/form-styles";

/**
 * The ways an event repeats, in the order they are offered, and how a run of
 * each is described once the dates are known.
 *
 * The wording is here rather than in the summary line because the two have to
 * agree: whatever the dropdown is called, the line above the button says what
 * that choice actually did.
 */
const CADENCES: readonly {
  value: RepeatCadence;
  label: string;
  apart: string;
}[] = [
  { value: "none", label: "Never", apart: "" },
  { value: "daily", label: "Daily", apart: "a day apart" },
  { value: "weekly", label: "Weekly", apart: "a week apart" },
  { value: "monthly", label: "Monthly", apart: "a month apart" },
  { value: "custom", label: "Custom dates", apart: "on the dates chosen" },
];

/** How a run of this cadence reads: "a week apart". */
function apartness(cadence: RepeatCadence): string {
  return CADENCES.find((entry) => entry.value === cadence)?.apart ?? "";
}

/**
 * Whether this cadence needs a number beside it.
 *
 * The three fixed intervals do: an interval says nothing about how far to
 * carry it. Never needs no count, and picked dates are their own count.
 */
function countsRepeats(cadence: RepeatCadence): boolean {
  return cadence === "daily" || cadence === "weekly" || cadence === "monthly";
}

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
  // How the venue is set up, as opposed to how this event is: the seat count
  // a table starts on. Read here rather than further down because the tables
  // block below opens on it.
  const { settings } = useEventContext();
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
  const tables = useTablePlan(settings.defaultSeatCount);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /**
   * How this event repeats, how many times, and — where the answer is a list
   * rather than an interval — on which dates.
   *
   * Every form opens on Never, once, with no dates picked, and nothing about
   * the event before it changes that. Repeating is asked for about the
   * booking in hand: a form that opened on Weekly, 3 times because last
   * month's function did would quietly create four events for somebody who
   * only meant to press Create.
   *
   * "Weekly, 3 times" means three more after the first — which is the same
   * week the date above is defaulted by, so a rhythm entered once carries
   * through the lot. The line above the button spells the dates out rather
   * than leaving the counting to be done twice.
   */
  const [cadence, setCadence] = useState<RepeatCadence>(
    DEFAULT_REPEAT_CADENCE,
  );
  const [times, setTimes] = useState("1");
  const [customDates, setCustomDates] = useState<string[]>([]);

  /** The same date so many intervals on, for whichever interval is set. */
  function intervalsOn(date: string, steps: number): string {
    if (cadence === "daily") return addDays(date, steps);
    if (cadence === "monthly") return addMonths(date, steps);
    return addDays(date, steps * 7);
  }

  /**
   * Every date this form would create: the event's own, and then its repeats.
   * Just the one when it is not repeating.
   *
   * Called during render as well as on submit — the button says how many
   * events it is about to make — so it reports a bad count as a message
   * rather than throwing, and answers for an empty date field too. Without
   * that last guard the arithmetic below runs on nothing and the summary
   * line reads NaN-NaN-NaN.
   */
  function repeatedDates(): { dates: string[] } | { error: string } {
    if (eventDate === "") return { error: "Pick an event date." };
    if (cadence === "none") return { dates: [eventDate] };

    if (cadence === "custom") {
      const extra = customDates.filter((date) => date !== eventDate);
      if (extra.length > MAX_REPEATS) {
        return {
          error: `${MAX_REPEATS} repeats is as many as one press makes.`,
        };
      }
      // Sorted, so a date picked before the event's own becomes the first of
      // the run rather than an event created out of order.
      return {
        dates: [eventDate, ...extra].sort((a, b) => a.localeCompare(b)),
      };
    }

    const more = times.trim() === "" ? Number.NaN : Number(times);
    if (!Number.isInteger(more) || more < 1) {
      return { error: "Enter how many times to repeat it, at least once." };
    }
    if (more > MAX_REPEATS) {
      return { error: `${MAX_REPEATS} repeats is as many as one press makes.` };
    }

    return {
      dates: Array.from({ length: more + 1 }, (unused, index) =>
        intervalsOn(eventDate, index),
      ),
    };
  }

  /** Pick a date for a custom run, or take one back off it. */
  function toggleDate(date: string) {
    setCustomDates((current) =>
      current.includes(date)
        ? current.filter((held) => held !== date)
        : [...current, date],
    );
    setError("");
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
  // summary line above it.
  const planned = repeatedDates();
  const made = "error" in planned ? 1 : planned.dates.length;

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

      {/* Last of the event's own fields: the tables are its furniture rather
          than its identity. Manage events is where they become a list — by
          then they differ from one another, which is the point at which a
          list is worth reading. */}
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <TablesPlanner plan={tables} disabled={saving} />
      </div>

      {/* How often, then how many, then which dates, then the button. The
          repeat comes before the thing that acts on it: a run of four is
          decided here, and Create 4 events is the last thing read rather
          than a label that changed while the eye was elsewhere. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
          Repeat event
          <select
            value={cadence}
            disabled={saving}
            aria-label="How often the event repeats"
            data-repeat
            onChange={(changed) => {
              setCadence(changed.target.value as RepeatCadence);
              setError("");
            }}
            className="h-11 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 sm:h-9 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {CADENCES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        {countsRepeats(cadence) && (
          <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
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
              className="h-11 w-20 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 sm:h-9 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        )}
      </div>

      {/* The month itself, for the one cadence that is a list of dates rather
          than an interval. Under the dropdown and above the summary, so the
          dates picked and the dates listed sit together. */}
      {cadence === "custom" && eventDate !== "" && (
        <RepeatCalendar
          firstDate={eventDate}
          chosen={customDates}
          onToggle={toggleDate}
          disabled={saving}
        />
      )}

      {/* The dates spelled out, so "repeat 3 times" does not have to be read
          twice to work out whether it means three events or four. */}
      {cadence !== "none" && (
        <p
          data-repeat-summary
          className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400"
        >
          {"error" in planned
            ? planned.error
            : planned.dates.length === 1
              ? `1 event, on ${formatEventDate(planned.dates[0])}.`
              : `${planned.dates.length} events, ${apartness(cadence)}: ${planned.dates
                  .map((date) => formatEventDate(date))
                  .join(", ")}.`}
        </p>
      )}

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* The last thing in the section, after every answer it acts on. Right
          of the column on anything wider than a phone — the far corner is
          where a form is finished — and hard against the left edge on a
          phone, which has one edge and nothing to gain from the button
          leaving it.

          On the screen's width, not the column's, and this is the only
          placement in the form that wants the screen: desktop and phone are
          what the two positions were asked for by, and the column's width
          is no guide to either. It is 516px at a 1280px window and 399px on
          a Pixel 7 — close enough that a container breakpoint falls either
          between them or below both. Both were tried. @sm turns at 24rem,
          under the column on most large phones, so the button right-aligned
          over a stacked form on exactly the screens the left edge was for;
          @xl turns at 36rem, over the column at 1280, so it sat hard left
          on a desktop. sm: is the 640px the rest of the app already treats
          as the end of a phone.

          No Cancel beside it: there is nothing to cancel back to now that
          the form is always on the screen. */}
      <div className="mt-4 flex sm:justify-end">
        <button
          type="submit"
          disabled={saving}
          data-create-event
          className="h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {saving ? "Creating…" : made === 1 ? "Create event" : `Create ${made} events`}
        </button>
      </div>
    </form>
  );
}
