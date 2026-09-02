"use client";

import Link from "next/link";
import { formatEventDate, formatTimeRange } from "@/lib/event-time";
import { MAX_ACTIVE_EVENTS, type Event } from "@/lib/types";

interface Props {
  events: Event[];
  selectedId: string | null;
  atLimit: boolean;
  onNewEvent: () => void;
}

/**
 * Each event is a link to its own URL rather than a click handler, so the
 * browser's back and forward buttons move between events. They look like
 * tabs but are navigation, so this is a nav with aria-current rather than a
 * tablist — a tablist would promise arrow-key semantics these do not have.
 */
export function EventTabs({ events, selectedId, atLimit, onNewEvent }: Props) {
  return (
    <div className="flex items-stretch border-b border-zinc-200 dark:border-zinc-800">
      {/* Only the tabs scroll. The New Event button sits outside this
          container so four long names cannot push it off a phone screen;
          min-w-0 lets the strip shrink instead of widening the row. */}
      <nav
        aria-label="Events"
        className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto px-2 pt-1.5"
      >
        {events.map((event) => {
          const selected = event.id === selectedId;
          const times = formatTimeRange(event.startTime, event.endTime);
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              aria-current={selected ? "page" : undefined}
              data-event-tab={event.id}
              className={`shrink-0 rounded-t-md px-3 py-2 text-left text-sm ${
                selected
                  ? "bg-white font-semibold text-black shadow-[inset_0_-2px_0_0_currentColor] dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="block max-w-[12rem] truncate">{event.name}</span>
              <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-500">
                {formatEventDate(event.eventDate)}
                {times === "" ? "" : ` · ${times}`}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center pr-2 pl-2">
        <button
          type="button"
          onClick={onNewEvent}
          disabled={atLimit}
          title={
            atLimit
              ? `${MAX_ACTIVE_EVENTS} events are already active.`
              : undefined
          }
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium whitespace-nowrap text-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
        >
          <span className="sm:hidden" aria-hidden="true">
            +
          </span>
          <span className="max-sm:sr-only">+ New event</span>
        </button>
      </div>
    </div>
  );
}
