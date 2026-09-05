"use client";

/**
 * Where each screen of an event lives, and how to read the event out of a URL.
 *
 * The event id travels in the query string rather than in the path. This app
 * is a static export: every page has to exist as an HTML file written at
 * build time, and event ids are minted in the browser, so a
 * `/events/[eventId]` route could never have a file to serve. A single
 * prerendered `/event/tables` that reads the id on the client covers every
 * event, which keeps deep links and reloads working on a plain file host
 * such as GitHub Pages.
 *
 * Every link to an event is built here, so the shape lives in one place.
 */

import { useSearchParams } from "next/navigation";

const EVENT_ID_PARAM = "id";

const EVENT_SEGMENTS = ["", "tables", "bookings", "expenses"] as const;

export type EventSection = (typeof EVENT_SEGMENTS)[number];

/**
 * Manage events, the one screen that is about the whole set of events rather
 * than one of them. It carries no event id: it lists closed events too, and
 * those belong to no tab.
 */
export const MANAGE_EVENTS_PATH = "/events/manage";

export type NavItem =
  /** One screen of the event currently open. */
  | { kind: "event"; segment: EventSection; label: string }
  /** Manage events, which belongs to no event. */
  | { kind: "manage"; label: string; shortLabel: string };

/**
 * The section nav, in the order it is read, left to right.
 *
 * Manage events sits between Bookings and Expenses rather than at the end,
 * on request. It is the odd one out of the five — the other four are screens
 * of one event and this is the screen of all of them — so it used to be
 * ruled off after them. Now it takes its place in the row, and the rule is
 * gone with it, because a divider mid-row would read as a break in the
 * sections rather than as a note about one of them.
 */
export const SECTION_NAV: readonly NavItem[] = [
  { kind: "event", segment: "", label: "Dashboard" },
  { kind: "event", segment: "tables", label: "Tables" },
  { kind: "event", segment: "bookings", label: "Bookings" },
  { kind: "manage", label: "Manage events", shortLabel: "Manage" },
  { kind: "event", segment: "expenses", label: "Expenses" },
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
