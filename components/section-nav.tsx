"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  APP_SECTIONS,
  EVENT_SECTIONS,
  eventHref,
  eventSectionPath,
  SECTION_NAV,
  type EventSection,
} from "@/lib/event-routes";
import { useDismiss } from "@/components/use-dismiss";

const itemClass = "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap";
const activeClass =
  "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black";
const restingClass =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900";

/**
 * The row itself, shared by the two arrangements below.
 *
 * No `overflow-x-auto` on it, and that is not an oversight. `overflow-x: auto`
 * promotes `overflow-y` from `visible` to `auto`, which makes the row a
 * scroll container in both directions — and the More menu hangs below the row
 * from `top-full`, so the row clipped it away entirely. The panel had a box,
 * a client rect and `aria-expanded="true"`, and painted nothing at all,
 * except a stray vertical scrollbar at the end of the row.
 *
 * The row does not need to scroll any more. A phone carries three short
 * section names and a button, which is what fits; the six items that did not
 * are what the menu is for. Where a row still might overflow — the desktop
 * one, which keeps all six — the scrolling is put back with `sm:overflow-x-auto`
 * at the point of use, where no panel hangs off it.
 */
const rowClass = "min-w-0 flex-1 gap-1 px-2 py-1";

interface Props {
  /**
   * The event the three event sections link to, or null when there is none to
   * link to — on Manage events with nothing active, which is also the only
   * screen that can give you an event back.
   */
  eventId: string | null;
}

/**
 * Links to each screen of the current event, and to Manage events,
 * Export/Import and Settings among them. Real URLs everywhere, so back and
 * forward work and any screen can be bookmarked or reloaded in place — as
 * true of the phone's More menu as of the row, since the menu holds links
 * rather than a handler that navigates on your behalf.
 *
 * From `sm` up all six sit in one row, as they always have. A phone gets the
 * event's own three and puts the other three behind **More**: six items and a
 * strip of events above them were two rows on a 390px screen, both of them
 * scrolling sideways with nothing to say that they did, and the three screens
 * a manager moves between all day were among what fell off the edge.
 *
 * The order lives in `SECTION_NAV`; this only draws it. `EVENT_SECTIONS` and
 * `APP_SECTIONS` are that same list split the two ways a phone needs it.
 */
export function SectionNav({ eventId }: Props) {
  const pathname = usePathname();
  // A trailing slash is the host's business rather than a different page.
  const path = pathname.replace(/\/$/, "");

  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const holder = useRef<HTMLElement>(null);
  const menuId = useId();
  useDismiss(open, holder, close);

  /** One of the app screens, as an item of a row. */
  function appLink(item: (typeof APP_SECTIONS)[number]) {
    const here = path === item.path;
    return (
      <Link
        key={item.label}
        href={item.path}
        onClick={close}
        aria-current={here ? "page" : undefined}
        data-nav-app={item.path}
        className={`${itemClass} ${here ? activeClass : restingClass}`}
      >
        {/* The full name wherever it fits. The short one is for the row a
            phone falls back to when there is no event to have sections of. */}
        <span className="sm:hidden" aria-hidden="true">
          {item.shortLabel}
        </span>
        <span className="max-sm:sr-only">{item.label}</span>
      </Link>
    );
  }

  /** One screen of the open event, as an item of a row. */
  function eventLink(item: { segment: EventSection; label: string }, id: string) {
    // Compared on the path alone: which event is in the query string has no
    // bearing on which section is showing.
    const active = path === eventSectionPath(item.segment);
    return (
      <Link
        key={item.label}
        href={eventHref(id, item.segment)}
        onClick={close}
        aria-current={active ? "page" : undefined}
        data-nav-section={item.segment}
        className={`${itemClass} ${active ? activeClass : restingClass}`}
      >
        {item.label}
      </Link>
    );
  }

  /**
   * With no event there is nothing for the event sections to point at, so the
   * three app screens are the whole nav — at every width, in one row, with no
   * More button. Putting them behind one would leave a phone with an empty
   * row and no obvious way to Manage events, which is the only screen that
   * can give it an event back.
   */
  if (eventId === null) {
    return (
      <nav
        aria-label="Sections"
        className="flex items-stretch border-b border-zinc-200 dark:border-zinc-800"
      >
        <div className={`flex overflow-x-auto ${rowClass}`}>
          {APP_SECTIONS.map((item) => appLink(item))}
        </div>
      </nav>
    );
  }

  /** Whichever of the menu's screens is showing, so More can say so. */
  const appHere = APP_SECTIONS.some((item) => path === item.path);

  return (
    /* The panel below hangs off this, not off the row: the row is a flex line
       the items sit in, and putting the panel inside it made the row the
       thing that positioned — and clipped — it. */
    <nav
      ref={holder}
      aria-label="Sections"
      className="relative flex items-stretch border-b border-zinc-200 dark:border-zinc-800"
    >
      {/* ------------------------------------------------ tablet up: all six */}
      <div className={`hidden ${rowClass} sm:flex sm:overflow-x-auto`}>
        {SECTION_NAV.map((item) =>
          item.kind === "app" ? appLink(item) : eventLink(item, eventId),
        )}
      </div>

      {/* ------------------------------ phone: the event's three, then More */}
      <div className={`flex items-center ${rowClass} sm:hidden`}>
        {EVENT_SECTIONS.map((item) => eventLink(item, eventId))}

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="More screens"
          data-nav-more
          /* Marked while one of its own screens is showing, so a phone says
             where it is without the menu having to be opened to find out. */
          className={`ml-auto ${itemClass} ${
            appHere ? activeClass : restingClass
          }`}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>

      {/* Over the screen rather than pushing it down, so opening the menu
          does not move what you were reading. Outside the row, and `sm:hidden`
          in its own right, since the row it belongs to is the phone's. */}
      <ul
        id={menuId}
        hidden={!open}
        data-nav-menu
        /* Shown by a class as well as by the `hidden` attribute. That
           attribute's `display: none` comes from the browser's own stylesheet,
           which any author `display` utility outranks — so a panel written
           `flex` unconditionally is a panel the attribute cannot close. */
        className={`${open ? "flex" : "hidden"} absolute top-full right-2 z-20 mt-1 w-56 flex-col overflow-hidden rounded-md border border-zinc-300 bg-white py-1 shadow-lg sm:hidden dark:border-zinc-700 dark:bg-zinc-950`}
      >
        {APP_SECTIONS.map((item) => {
          const here = path === item.path;
          return (
            <li key={item.label}>
              <Link
                href={item.path}
                onClick={close}
                aria-current={here ? "page" : undefined}
                data-nav-menu-item={item.path}
                className={`block px-3 py-2.5 text-sm ${
                  here
                    ? "bg-zinc-100 font-semibold text-black dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {/* A list, not a row, so the full name fits and the short
                    one is not wanted. */}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
