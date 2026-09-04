"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  EVENT_SECTIONS,
  eventHref,
  eventSectionPath,
} from "@/lib/event-routes";

/**
 * Links to each screen of the current event. Real URLs, so back and forward
 * work and any screen can be bookmarked or reloaded in place.
 */
export function SectionNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Event sections"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1 dark:border-zinc-800"
    >
      {EVENT_SECTIONS.map((section) => {
        // Compared on the path alone: which event is in the query string has
        // no bearing on which section is showing, and a trailing slash is
        // the host's business rather than a different page.
        const active =
          pathname.replace(/\/$/, "") === eventSectionPath(section.segment);
        return (
          <Link
            key={section.label}
            href={eventHref(eventId, section.segment)}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
              active
                ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
