"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { formatEventDate } from "@/lib/event-time";
import type { Event } from "@/lib/types";
import { eventHref } from "@/lib/event-routes";
import { useDismiss } from "@/components/use-dismiss";

interface Props {
  events: Event[];
  selectedId: string | null;
}

/**
 * The active events: a rail down the left-hand side of the page, and on a
 * phone a single line naming the one that is open.
 *
 * A column rather than a strip along the top, on request: events are read
 * down a list, a long name has room to be read rather than truncated to a
 * tab's width, and the column costs nothing when three or four are open.
 *
 * Below `sm` it used to fall back to the strip it had been, which meant a
 * phone opened with two rows of navigation above the screen, both of them
 * scrolling sideways — and nothing about either of them said so. It is now
 * one line saying which event is open, with the others behind it: the same
 * information in a fifth of the room, and nothing to discover by dragging.
 *
 * Each event is a link to its own URL rather than a click handler, so the
 * browser's back and forward buttons move between events and any event can be
 * bookmarked. That holds in the panel as much as in the rail — it is a list of
 * real links, not a picker that navigates for you. They look like tabs but are
 * navigation, so this is a nav with aria-current rather than a tablist, which
 * would promise arrow-key semantics these do not have.
 *
 * Every event here is an active one, and each is a real event. Manage events
 * used to sit at the right-hand end and is now a section in the nav, where it
 * does not read as a fifth event.
 */
export function EventTabs({ events, selectedId }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const holder = useRef<HTMLElement>(null);
  const panelId = useId();
  useDismiss(open, holder, close);

  // The one whose screen is showing. On Manage events and Export/Import none
  // is, so the line invites a choice rather than naming an event that is not
  // being looked at.
  const at = events.findIndex((event) => event.id === selectedId);
  const current = at === -1 ? null : events[at];
  // Nothing to switch to, so nothing to open: one event is a label.
  const switchable = events.length > 1;

  return (
    <div className="border-b border-zinc-200 sm:w-44 sm:shrink-0 sm:border-r sm:border-b-0 dark:border-zinc-800">
      {/* ------------------------------------------------ phone: one line

          A nav of its own, the same landmark the rail is, so a phone has an
          Events landmark to jump to rather than a button standing loose
          between the header and the sections. */}
      <nav
        aria-label="Events"
        ref={holder}
        className="relative px-2 py-1.5 sm:hidden"
      >
        {switchable ? (
          <button
            type="button"
            onClick={() => setOpen((was) => !was)}
            aria-expanded={open}
            aria-controls={panelId}
            data-event-picker
            className="flex h-11 w-full items-center gap-2 rounded-md border border-zinc-300 px-2 text-left dark:border-zinc-700"
          >
            <CurrentEvent
              event={current}
              position={at + 1}
              count={events.length}
            />
            <span
              aria-hidden="true"
              className={`shrink-0 text-xs text-zinc-500 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>
        ) : (
          <div className="flex h-11 w-full items-center px-2">
            <CurrentEvent
              event={current}
              position={at + 1}
              count={events.length}
            />
          </div>
        )}

        {/* Over the screen rather than pushing it down, so opening the list
            does not move the thing you were reading. */}
        {switchable && (
          <ul
            id={panelId}
            hidden={!open}
            data-event-panel
            /* Shown by a class as well as by the attribute: see the note on
               the section nav's own menu. */
            className={`${open ? "flex" : "hidden"} absolute top-full right-2 left-2 z-20 mt-1 flex-col overflow-hidden rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950`}
          >
            {events.map((event) => {
              const selected = event.id === selectedId;
              return (
                <li key={event.id}>
                  <Link
                    href={eventHref(event.id)}
                    onClick={close}
                    aria-current={selected ? "page" : undefined}
                    data-event-option={event.id}
                    className={`block px-3 py-2.5 text-sm ${
                      selected
                        ? "bg-zinc-100 font-semibold text-black dark:bg-zinc-900 dark:text-zinc-50"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <span className="block truncate">{event.name}</span>
                    <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-500">
                      {formatEventDate(event.eventDate)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* --------------------------------------------- tablet up: the rail */}
      <nav
        aria-label="Events"
        className="hidden sm:flex sm:flex-col sm:items-stretch sm:gap-1 sm:p-2"
      >
        {events.map((event) => {
          const selected = event.id === selectedId;
          return (
            <Link
              key={event.id}
              href={eventHref(event.id)}
              aria-current={selected ? "page" : undefined}
              data-event-tab={event.id}
              /* A row of the rail, with the marker on the edge facing the
                 screen it opens. */
              className={`w-full shrink-0 rounded-md px-3 py-2 text-left text-sm ${
                selected
                  ? "bg-zinc-100 font-semibold text-black shadow-[inset_2px_0_0_0_currentColor] dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {/* The column is the width, so the name has the whole of it. */}
              <span className="block">{event.name}</span>
              <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-500">
                {formatEventDate(event.eventDate)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * What the phone's line says: which event is showing, or an invitation to
 * pick one.
 *
 * Where it sits in the list comes with it while there is more than one,
 * because otherwise the line reads as the whole truth rather than as one of
 * several — and it is the only thing on a phone that says how many events are
 * active at all. `position` is 1-based, and 0 on the screens that belong to no
 * event, which is where the invitation goes.
 *
 * "Choose an event" rather than "No event open", and "3 active" rather than
 * "3 open": the first pair said nothing about what to do next, and the second
 * had the word "open" meaning two different things a few characters apart —
 * an event that exists, and the event being looked at.
 */
function CurrentEvent({
  event,
  position,
  count,
}: {
  event: Event | null;
  position: number;
  count: number;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-1.5">
        <span className="truncate text-sm font-semibold text-black dark:text-zinc-50">
          {event === null ? "Choose an event" : event.name}
        </span>
        {count > 1 && (
          <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-500">
            {position > 0 ? `${position} of ${count}` : `${count} active`}
          </span>
        )}
      </span>
      {event !== null && (
        <span className="block truncate text-xs font-normal text-zinc-500 dark:text-zinc-500">
          {formatEventDate(event.eventDate)}
        </span>
      )}
    </span>
  );
}
