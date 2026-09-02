"use client";

/**
 * Chrome shared by every screen of an event: the event tabs and the section
 * nav. Next.js preserves layout state across navigation, so moving between
 * Dashboard, Tables, Bookings and Expenses does not re-read IndexedDB.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EventProvider, useEventContext } from "@/components/event-provider";
import { EventTabs } from "@/components/event-tabs";
import { NewEventForm } from "@/components/new-event-form";
import { SectionNav } from "@/components/section-nav";

function EventChrome({ children }: { children: React.ReactNode }) {
  const { state, error, activeEvents, atEventLimit, addEvent } =
    useEventContext();
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const eventId = params.eventId;

  if (state === "loading") {
    return (
      <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Loading your events…
      </p>
    );
  }

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
      <EventTabs
        events={activeEvents}
        selectedId={eventId}
        atLimit={atEventLimit}
        onNewEvent={() => setCreating(true)}
      />

      {known && <SectionNav eventId={eventId} />}

      <div className="flex-1 p-2 sm:p-6">
        {creating && (
          <div className="mb-6">
            <NewEventForm
              onCreate={async (input) => {
                const created = await addEvent(input);
                setCreating(false);
                // Push, so back returns to the event you were looking at.
                router.push(`/events/${created.id}`);
                return created;
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}

        {/* An event can vanish under you: the retention sweep closes events
            48 hours after their date, and closed events leave the tabs. */}
        {!known && !creating ? (
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
  return (
    <EventProvider>
      <EventChrome>{children}</EventChrome>
    </EventProvider>
  );
}
