"use client";

/**
 * Chrome shared by every screen of an event: the event tabs and the section
 * nav. Next.js preserves layout state across navigation, so moving between
 * Dashboard, Tables, Bookings and Expenses does not re-read IndexedDB.
 */

import { Suspense } from "react";
import Link from "next/link";
import { EventProvider, useEventContext } from "@/components/event-provider";
import { EventTabs } from "@/components/event-tabs";
import { SectionNav } from "@/components/section-nav";
import { useEventId } from "@/lib/event-routes";

function Loading() {
  return (
    <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
      Loading your events…
    </p>
  );
}

function EventChrome({ children }: { children: React.ReactNode }) {
  const { state, error, activeEvents } = useEventContext();
  const eventId = useEventId();

  if (state === "loading") return <Loading />;

  if (state === "error") {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-red-600 dark:text-red-400">
          Could not open local storage
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          {error} This app keeps everything in the browser, so it needs
          IndexedDB. Private browsing windows often block it.
        </p>
      </div>
    );
  }

  const known = activeEvents.some((event) => event.id === eventId);

  return (
    <div className="flex flex-1 flex-col">
      <EventTabs events={activeEvents} selectedId={eventId} />

      {known && eventId !== null && <SectionNav eventId={eventId} />}

      <div className="flex-1 p-2 sm:p-6">
        {/* An event can vanish under you: the retention sweep closes events
            48 hours after their date, and closed events leave the tabs. */}
        {!known ? (
          <div className="max-w-prose">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
              That event is not open
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              It may have closed automatically 48 hours after its date, or the
              link may be stale.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block h-11 rounded-md bg-black px-4 leading-[2.75rem] text-base font-medium text-white dark:bg-zinc-50 dark:text-black"
            >
              Back to your events
            </Link>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export default function EventLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Everything below reads the event id out of the query string, which no
     amount of building can know in advance, so the prerendered HTML is this
     fallback and the real screen arrives with hydration. */
  return (
    <Suspense fallback={<Loading />}>
      <EventProvider>
        <EventChrome>{children}</EventChrome>
      </EventProvider>
    </Suspense>
  );
}
