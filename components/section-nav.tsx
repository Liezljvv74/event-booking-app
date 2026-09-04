"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  EVENT_SECTIONS,
  eventHref,
  eventSectionPath,
  MANAGE_EVENTS_PATH,
} from "@/lib/event-routes";

const itemClass = "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap";
const activeClass =
  "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black";
const restingClass =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900";

interface Props {
  /**
   * The event the four event sections link to, or null when there is none to
   * link to — on Manage events with nothing active, which is also the only
   * screen that can give you an event back.
   */
  eventId: string | null;
}

/**
 * Links to each screen of the current event, and to Manage events at the end.
 * Real URLs, so back and forward work and any screen can be bookmarked or
 * reloaded in place.
 *
 * Manage events is one of these rather than a button among the event tabs.
 * It is a screen of the app like the other four, and up in the tabs it read
 * as a fifth event.
 */
export function SectionNav({ eventId }: Props) {
  const pathname = usePathname();
  // A trailing slash is the host's business rather than a different page.
  const path = pathname.replace(/\/$/, "");
  const managing = path === MANAGE_EVENTS_PATH;

  return (
    <nav
      aria-label="Sections"
      className="flex items-stretch border-b border-zinc-200 dark:border-zinc-800"
    >
      {/* Only the event's own sections scroll. Manage events sits outside
          this container, so a narrow screen cannot push the screen that
          creates events off the end of the row.

          Left out entirely when there is no event, rather than left empty:
          the container takes the width the sections would have had, and
          Manage events would sit alone against the right-hand edge. */}
      {eventId !== null && (
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-1">
          {EVENT_SECTIONS.map((section) => {
            // Compared on the path alone: which event is in the query string
            // has no bearing on which section is showing.
            const active = path === eventSectionPath(section.segment);
            return (
              <Link
                key={section.label}
                href={eventHref(eventId, section.segment)}
                aria-current={active ? "page" : undefined}
                className={`${itemClass} ${active ? activeClass : restingClass}`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Ruled off from the event's own sections, which is what it is: those
          are this event, this is all of them. */}
      <div
        className={`flex shrink-0 items-center py-1 pr-2 pl-2 ${
          eventId === null
            ? ""
            : "border-l border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <Link
          href={MANAGE_EVENTS_PATH}
          aria-current={managing ? "page" : undefined}
          data-manage-events
          className={`${itemClass} ${managing ? activeClass : restingClass}`}
        >
          {/* The full name wherever it fits. On a phone the row is four
              sections and this, and the shorter label is what keeps them
              from crowding each other. */}
          <span className="sm:hidden" aria-hidden="true">
            Manage
          </span>
          <span className="max-sm:sr-only">Manage events</span>
        </Link>
      </div>
    </nav>
  );
}
