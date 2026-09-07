"use client";

/**
 * A month at a time, to pick the dates an event repeats on.
 *
 * The other four cadences are intervals: say "weekly, three times" and the
 * dates follow from the first one. A season of functions on the nights the
 * hall is free follows from nothing, so those dates have to be pointed at —
 * and a run of `<input type="date">` boxes is not pointing at them, it is
 * typing them, one at a time, with no view of the month they sit in.
 *
 * The event's own date is in the set and is not pressable here. It comes from
 * the Date field on the form above, which is the one place an event's date is
 * set; a second way to change it that disagreed with the first is worse than
 * no second way at all. It shows as taken so the calendar reads as the whole
 * run rather than as the part of it that is not the first night.
 *
 * Any other date may be picked, including one before the event's own. A run
 * is sorted before it is created, so an earlier date simply becomes the first
 * event — which is what somebody who picked it meant, and refusing it would
 * mean re-typing the Date field to say the same thing.
 */

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  formatEventDate,
  todayIso,
} from "@/lib/event-time";

/**
 * The weekday headings, in the reader's own language, Monday first.
 *
 * Read off the first week of January 2024, which began on a Monday. Monday
 * first is not the browser's opinion — the platform will not say which day a
 * locale starts its week on without the Intl locale API, which not every
 * browser this app runs in has — so it is stated here, and it is the week
 * this venue keeps.
 */
const WEEKDAYS = Array.from({ length: 7 }, (unused, index) =>
  new Date(2024, 0, 1 + index).toLocaleDateString(undefined, {
    weekday: "short",
  }),
);

/** The first of whatever month a date falls in, as "YYYY-MM-DD". */
function firstOfMonth(iso: string): string {
  const [year, month] = iso.split("-");
  return `${year}-${month}-01`;
}

/** "October 2026", for the heading. */
function monthHeading(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Every day of a month, and the blanks before the 1st that put it under the
 * right weekday. Null is a blank cell.
 */
function monthCells(iso: string): (string | null)[] {
  const [year, month] = iso.split("-").map(Number);
  // Sunday is 0 from getDay, and Sunday is the last column here.
  const before = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  // Day 0 of the next month is the last day of this one.
  const days = new Date(year, month, 0).getDate();

  return [
    ...Array.from({ length: before }, () => null),
    ...Array.from(
      { length: days },
      (unused, index) =>
        `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
}

const NAV_CLASS =
  "h-8 w-8 shrink-0 rounded-md text-base text-black disabled:opacity-50 " +
  "hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800";

interface Props {
  /** The event's own date, always in the run and never pressable. */
  firstDate: string;
  /** The dates picked so far, the event's own date excluded. */
  chosen: readonly string[];
  onToggle: (date: string) => void;
  disabled?: boolean;
}

export function RepeatCalendar({
  firstDate,
  chosen,
  onToggle,
  disabled = false,
}: Props) {
  const [month, setMonth] = useState(() => firstOfMonth(firstDate));

  /**
   * Move with the Date field above.
   *
   * Re-dating the event to next March and leaving the calendar on this month
   * would have somebody paging through a year to reach the dates they were
   * looking at. Adjusted during render rather than in an effect, which is
   * what keeps the first paint from showing the wrong month.
   */
  const [seed, setSeed] = useState(firstDate);
  if (seed !== firstDate) {
    setSeed(firstDate);
    setMonth(firstOfMonth(firstDate));
  }

  /**
   * The one day in the grid that Tab reaches, and the arrow keys move.
   *
   * A month is thirty-odd buttons. Each one its own tab stop made the grid
   * thirty-odd presses wide: with the button at the foot of the form, Create
   * sat thirty-three Tabs past the calendar in a 31-day month, so the cadence
   * needing the most work put its only submit control furthest away. One stop
   * for the grid is what a calendar is expected to be, and the arrows are
   * what makes the other days reachable — take the tab stops away without
   * them and the days are not reachable at all.
   *
   * Held as a date rather than an index so paging months keeps its place, and
   * derived below rather than trusted: the month can move underneath it, from
   * the nav buttons or from the Date field above.
   */
  const [active, setActive] = useState(firstDate);
  /**
   * Whether the anchor should be focused once it is on screen.
   *
   * Only the keyboard sets it. Focus has to be moved after the render that
   * paints the target — a month away, the button does not exist yet — and
   * that is an effect. Doing it on every anchor change instead would pull
   * focus into the calendar when the mouse pages a month, or when the Date
   * field above moves it.
   *
   * A ref rather than state: it is a note to the effect, not something the
   * screen depends on, and setting state from inside an effect to clear it
   * is both a second render and a lint error.
   */
  const chasing = useRef(false);
  const grid = useRef<HTMLDivElement>(null);

  const picked = new Set(chosen);
  const today = todayIso();

  const cells = monthCells(month);
  const days = cells.filter((iso): iso is string => iso !== null);
  /**
   * The anchor as it actually is: the remembered day while the grid still
   * holds it, the event's own date when the grid holds that, and otherwise
   * the 1st. So paging a month with the mouse leaves a tab stop behind on a
   * day that exists.
   */
  const anchor = days.includes(active)
    ? active
    : days.includes(firstDate)
      ? firstDate
      : days[0];

  useEffect(() => {
    if (!chasing.current) return;
    chasing.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${anchor}"]`)
      ?.focus();
  }, [anchor]);

  /**
   * Move the anchor to a date, paging the month to reach it.
   *
   * firstOfMonth of a date already in this month is this month, so the state
   * lands on the same string and React skips the re-render; a date a month
   * away pages the grid to hold it. Either way the effect above then puts
   * focus on it.
   */
  function goTo(target: string) {
    // Already here. The key came from the anchor, so the anchor already has
    // focus and there is nothing to page to and nothing to wait for —
    // Home on the 1st, End on the 31st.
    if (target === anchor) return;
    chasing.current = true;
    setMonth(firstOfMonth(target));
    setActive(target);
  }

  /**
   * The keys a calendar is expected to answer: the arrows a day and a week at
   * a time, Page for a month, Home and End for the ends of this one. Enter
   * and Space are the button's own and are left alone.
   */
  function navigate(pressed: React.KeyboardEvent<HTMLButtonElement>, from: string) {
    const by: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (pressed.key in by) {
      pressed.preventDefault();
      goTo(addDays(from, by[pressed.key]));
      return;
    }
    if (pressed.key === "PageUp" || pressed.key === "PageDown") {
      pressed.preventDefault();
      goTo(addMonths(from, pressed.key === "PageUp" ? -1 : 1));
      return;
    }
    if (pressed.key === "Home" || pressed.key === "End") {
      pressed.preventDefault();
      goTo(pressed.key === "Home" ? days[0] : days[days.length - 1]);
    }
  }

  return (
    <div
      data-repeat-calendar
      className="mt-2 w-[min(19rem,100%)] rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <div className="flex items-center gap-1 border-b border-zinc-200 p-1 dark:border-zinc-800">
        <button
          type="button"
          data-calendar-prev
          disabled={disabled}
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
          className={NAV_CLASS}
        >
          ‹
        </button>
        <span
          data-calendar-month
          aria-live="polite"
          className="flex-1 text-center text-sm font-medium text-black dark:text-zinc-50"
        >
          {monthHeading(month)}
        </span>
        <button
          type="button"
          data-calendar-next
          disabled={disabled}
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
          className={NAV_CLASS}
        >
          ›
        </button>
      </div>

      {/* One group, named by its month, so a screen reader says what it has
          arrived in — the heading above is the same words, and it is the
          nav's own label rather than the grid's.

          Not role="grid": that promises rows of gridcells, and these are
          seven-across CSS grid children with no row elements between them.
          A promise the markup does not keep reads worse to a screen reader
          than no promise, and what was actually wrong here was the tab
          order, which is behaviour. */}
      <div
        ref={grid}
        role="group"
        aria-label={monthHeading(month)}
        className="grid grid-cols-7 gap-0.5 p-1"
      >
        {WEEKDAYS.map((weekday, index) => (
          <span
            /* The letters repeat across locales — T for Tuesday and for
               Thursday — so the day is the key, not the label. */
            key={index}
            aria-hidden
            className="pb-0.5 text-center text-[11px] text-zinc-500 dark:text-zinc-500"
          >
            {weekday}
          </span>
        ))}

        {cells.map((iso, index) =>
          iso === null ? (
            <span key={`blank-${index}`} aria-hidden />
          ) : (
            <button
              key={iso}
              type="button"
              data-calendar-day={iso}
              disabled={disabled}
              /* The event's own date is announced as unavailable rather than
                 disabled, because a disabled button cannot hold focus and
                 the arrows have to be able to cross it. Its press is a
                 no-op, which is what disabled bought before. */
              aria-disabled={iso === firstDate}
              aria-pressed={iso === firstDate || picked.has(iso)}
              aria-label={formatEventDate(iso)}
              /* Every day but one is out of the tab order; the arrows are
                 how the rest are reached. */
              tabIndex={iso === anchor ? 0 : -1}
              onKeyDown={(pressed) => navigate(pressed, iso)}
              onFocus={() => setActive(iso)}
              onClick={() => {
                if (iso === firstDate) return;
                onToggle(iso);
              }}
              className={`h-10 rounded-md text-sm disabled:opacity-100 sm:h-8 ${
                iso === firstDate
                  ? "cursor-default bg-zinc-200 font-medium text-black dark:bg-zinc-700 dark:text-zinc-50"
                  : picked.has(iso)
                    ? "bg-black font-medium text-white dark:bg-zinc-50 dark:text-black"
                    : `text-black hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800 ${
                        iso === today
                          ? "ring-1 ring-zinc-400 ring-inset dark:ring-zinc-600"
                          : ""
                      }`
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
