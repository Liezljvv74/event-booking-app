"use client";

/**
 * Chrome shared by every screen of an event. Next.js preserves layout state
 * across navigation, so moving between Dashboard, Tables, Bookings and
 * Expenses does not re-read IndexedDB.
 */

import { Suspense } from "react";
import Link from "next/link";
import { AppChrome, ChromeLoading } from "@/components/app-chrome";
import { EventProvider, useEventContext } from "@/components/event-provider";
import { MANAGE_EVENTS_PATH, useEventId } from "@/lib/event-routes";

/**
 * An event can vanish under you: the retention sweep closes events 48 hours
 * after their date, and closed events leave the tabs.
 */
function EventGone() {
  return (
    <div className="max-w-prose">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        That event is not open
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        It may have closed automatically 48 hours after its date, or the link
        may be stale. Closed events are still on Manage events until the
        retention period runs out.
      </p>
      <Link
        href={MANAGE_EVENTS_PATH}
        className="mt-4 inline-block h-11 rounded-md bg-black px-4 text-base leading-[2.75rem] font-medium text-white dark:bg-zinc-50 dark:text-black"
      >
        Manage events
      </Link>
    </div>
  );
}

function EventScreen({ children }: { children: React.ReactNode }) {
  const { activeEvents } = useEventContext();
  const eventId = useEventId();
  const known = activeEvents.some((event) => event.id === eventId);

  return (
    <AppChrome selectedId={eventId}>
      {known ? children : <EventGone />}
    </AppChrome>
  );
}

export default function EventLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Everything below reads the event id out of the query string, which no
     amount of building can know in advance, so the prerendered HTML is this
     fallback and the real screen arrives with hydration. */
  return (
    <Suspense fallback={<ChromeLoading />}>
      <EventProvider>
        <EventScreen>{children}</EventScreen>
      </EventProvider>
    </Suspense>
  );
}
