"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  eventHref,
  eventSectionPath,
  SECTION_NAV,
} from "@/lib/event-routes";

const itemClass = "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap";
const activeClass =
  "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black";
const restingClass =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900";

interface Props {
  /**
   * The event the three event sections link to, or null when there is none to
   * link to — on Manage events with nothing active, which is also the only
   * screen that can give you an event back.
   */
  eventId: string | null;
}

/**
 * Links to each screen of the current event, and to Manage events among
 * them. Real URLs, so back and forward work and any screen can be bookmarked
 * or reloaded in place.
 *
 * The order lives in `SECTION_NAV`; this only draws it.
 */
export function SectionNav({ eventId }: Props) {
  const pathname = usePathname();
  // A trailing slash is the host's business rather than a different page.
  const path = pathname.replace(/\/$/, "");

  return (
    <nav
      aria-label="Sections"
      className="flex items-stretch border-b border-zinc-200 dark:border-zinc-800"
    >
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-1">
        {SECTION_NAV.map((item) => {
          if (item.kind === "app") {
            const here = path === item.path;
            return (
              <Link
                key={item.label}
                href={item.path}
                aria-current={here ? "page" : undefined}
                data-nav-app={item.path}
                className={`${itemClass} ${here ? activeClass : restingClass}`}
              >
                {/* The full name wherever it fits. On a phone the row is
                    five items under a strip of events, and the shorter label
                    is what keeps them from crowding each other. */}
                <span className="sm:hidden" aria-hidden="true">
                  {item.shortLabel}
                </span>
                <span className="max-sm:sr-only">{item.label}</span>
              </Link>
            );
          }

          // With no event there is nothing for the event sections to point
          // at, so Manage events is the whole nav — which is also the one
          // screen that can create an event and put the rest of them back.
          if (eventId === null) return null;

          // Compared on the path alone: which event is in the query string
          // has no bearing on which section is showing.
          const active = path === eventSectionPath(item.segment);
          return (
            <Link
              key={item.label}
              href={eventHref(eventId, item.segment)}
              aria-current={active ? "page" : undefined}
              className={`${itemClass} ${active ? activeClass : restingClass}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
