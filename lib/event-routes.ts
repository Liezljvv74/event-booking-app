"use client";

/**
 * Where each screen of an event lives, and how to read the event out of a URL.
 *
 * The event id travels in the query string rather than in the path. This app
 * is a static export: every page has to exist as an HTML file written at
 * build time, and event ids are minted in the browser, so a
 * `/events/[eventId]` route could never have a file to serve. A single
 * prerendered `/event/bookings` that reads the id on the client covers every
 * event, which keeps deep links and reloads working on a plain file host
 * such as GitHub Pages.
 *
 * Every link to an event is built here, so the shape lives in one place.
 */

import { useSearchParams } from "next/navigation";

const EVENT_ID_PARAM = "id";

const EVENT_SEGMENTS = ["", "bookings", "expenses"] as const;

export type EventSection = (typeof EVENT_SEGMENTS)[number];

/**
 * Manage events, the one screen that is about the whole set of events rather
 * than one of them. It carries no event id: it lists closed events too, and
 * those belong to no tab.
 */
export const MANAGE_EVENTS_PATH = "/events/manage";

/**
 * Export and import, the other screen that belongs to no event: it writes
 * the whole store to a file and reads one back.
 */
export const DATA_PATH = "/data";

/** Settings: the handful of things that are true of the app, not an event. */
export const SETTINGS_PATH = "/settings";

export type NavItem =
  /** One screen of the event currently open. */
  | { kind: "event"; segment: EventSection; label: string }
  /**
   * A screen about the app rather than about one event, so it carries its
   * own path and no event id. There are two: Manage events, and Export and
   * import. The short label is what a phone shows, where the full one would
   * crowd everything beside it.
   */
  | { kind: "app"; path: string; label: string; shortLabel: string };

/**
 * The section nav, in the order it is read, left to right.
 *
 * The event's own three screens run in the order an event is worked through
 * — what it looks like, who is coming, what it costs — and Manage events
 * comes after them, on request. It sat between Bookings and Expenses for a
 * while, which split the three; the run reads better whole.
 *
 * Being last does not make it a footnote and it carries no divider: a rule
 * mid-row read as a break in the sections rather than as a note about one of
 * them, and it went when the item first moved.
 */
export const SECTION_NAV: readonly NavItem[] = [
  { kind: "event", segment: "", label: "Dashboard" },
  { kind: "event", segment: "bookings", label: "Bookings" },
  { kind: "event", segment: "expenses", label: "Expenses" },
  {
    kind: "app",
    path: MANAGE_EVENTS_PATH,
    label: "Manage events",
    shortLabel: "Manage",
  },
  {
    kind: "app",
    path: DATA_PATH,
    label: "Export/Import your data",
    shortLabel: "Export/Import",
  },
  { kind: "app", path: SETTINGS_PATH, label: "Settings", shortLabel: "Settings" },
];

/** The path of a section, with no event attached to it yet. */
export function eventSectionPath(section: EventSection): string {
  return section === "" ? "/event" : `/event/${section}`;
}

/** A link to one screen of one event. */
export function eventHref(eventId: string, section: EventSection = ""): string {
  const path = eventSectionPath(section);
  return `${path}?${EVENT_ID_PARAM}=${encodeURIComponent(eventId)}`;
}

/**
 * Asks the bookings screen to open at the parties with somebody still to
 * place, rather than at the top of the list.
 *
 * A flag in the URL rather than an instruction passed between screens,
 * because it has to survive the navigation and because it is then a link
 * somebody can keep: the dashboard's "Seat them" is a bookmark to the work.
 */
export const UNSEATED_PARAM = "unseated";

/** The bookings screen, opened at whoever still needs a seat. */
export function unseatedHref(eventId: string): string {
  return `${eventHref(eventId, "bookings")}&${UNSEATED_PARAM}=1`;
}

/** Whether the URL asked for that. */
export function useWantsUnseated(): boolean {
  return useSearchParams().get(UNSEATED_PARAM) === "1";
}

/**
 * The event the URL points at, or null when there is none.
 *
 * Also null while the page is being prerendered, since the query string is
 * not known at build time — callers sit inside a Suspense boundary and get
 * the real value as the browser hydrates. That costs nothing here: the
 * events themselves are still being read out of IndexedDB at that point.
 */
export function useEventId(): string | null {
  return useSearchParams().get(EVENT_ID_PARAM);
}
