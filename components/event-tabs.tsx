"use client";

import Link from "next/link";
import { formatEventDate } from "@/lib/event-time";
import type { Event } from "@/lib/types";
import { eventHref } from "@/lib/event-routes";

interface Props {
  events: Event[];
  selectedId: string | null;
}

/**
 * The active events, down the left-hand side of the page.
 *
 * A column rather than a strip along the top, on request: events are read
 * down a list, a long name has room to be read rather than truncated to a
 * tab's width, and the column costs nothing when three or four are open. It
 * falls back to the strip it used to be below `sm`, where a rail beside the
 * screen would leave too little of a phone for the screen itself.
 *
 * Each event carries its name and its date, and nothing else. The times used
 * to follow the date; they were asked off, and the dashboard heading is where
 * an event's hours are read.
 *
 * Each event is a link to its own URL rather than a click handler, so the
 * browser's back and forward buttons move between events. They look like tabs
 * but are navigation, so this is a nav with aria-current rather than a
 * tablist — a tablist would promise arrow-key semantics these do not have.
 *
 * Every event here is an active one, and each is a real event. Manage events
 * used to sit at the right-hand end and is now a section in the nav, where it
 * does not read as a fifth event.
 */
export function EventTabs({ events, selectedId }: Props) {
  return (
    <div className="border-b border-line-soft sm:w-44 sm:shrink-0 sm:border-r sm:border-b-0">
      <nav
        aria-label="Events"
        className="flex items-stretch gap-1 overflow-x-auto px-2 pt-1.5 sm:flex-col sm:overflow-x-visible sm:p-2"
      >
        {events.map((event) => {
          const selected = event.id === selectedId;
          return (
            <Link
              key={event.id}
              href={eventHref(event.id)}
              aria-current={selected ? "page" : undefined}
              data-event-tab={event.id}
              /* A tab along the bottom of the strip on a phone, a row of the
                 rail on anything wider: the marker moves from the bottom
                 edge to the edge facing the screen it opens. */
              className={`shrink-0 rounded-t-md px-3 py-2 text-left text-sm sm:w-full sm:rounded-md ${
                selected
                  ? "bg-muted font-semibold text-ink shadow-[inset_0_-2px_0_0_var(--primary)] sm:shadow-[inset_2px_0_0_0_var(--primary)]"
                  : "text-ink-muted hover:bg-muted"
              }`}
            >
              {/* Truncated to a tab's width in the strip; in the rail the
                  column is the width, so the name has the whole of it. */}
              <span className="block max-w-[12rem] truncate sm:max-w-none">
                {event.name}
              </span>
              <span className="block text-xs font-normal text-ink-faint">
                {formatEventDate(event.eventDate)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
