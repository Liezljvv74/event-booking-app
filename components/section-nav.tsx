"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { segment: "", label: "Dashboard" },
  { segment: "tables", label: "Tables" },
  { segment: "bookings", label: "Bookings" },
  { segment: "expenses", label: "Expenses" },
] as const;

/**
 * Links to each screen of the current event. Real URLs, so back and forward
 * work and any screen can be bookmarked or reloaded in place.
 */
export function SectionNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;

  return (
    <nav
      aria-label="Event sections"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1 dark:border-zinc-800"
    >
      {SECTIONS.map((section) => {
        const href = section.segment === "" ? base : `${base}/${section.segment}`;
        const active = pathname === href;
        return (
          <Link
            key={section.label}
            href={href}
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
