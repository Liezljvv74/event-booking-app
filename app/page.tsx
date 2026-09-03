"use client";

/**
 * Entry screen. The event list lives in IndexedDB, so which event to open
 * cannot be known until the browser has read it; this loads, then hands off
 * to that event's URL.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NewEventForm } from "@/components/new-event-form";
import { useEvents } from "@/lib/use-events";
import { MAX_ACTIVE_EVENTS } from "@/lib/types";

export default function Home() {
  const { state, error, activeEvents, lastTimes, addEvent } = useEvents();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const firstEventId = activeEvents[0]?.id ?? null;

  useEffect(() => {
    if (state !== "ready" || firstEventId === null || creating) return;
    // Replace, not push: pushing would leave "/" in the history, and going
    // back would land here and immediately redirect forward again.
    router.replace(`/events/${firstEventId}`);
  }, [state, firstEventId, creating, router]);

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

  if (creating) {
    return (
      <div className="p-4 sm:p-6">
        <NewEventForm
          lastTimes={lastTimes}
          onCreate={async (input) => {
            const created = await addEvent(input);
            router.replace(`/events/${created.id}`);
            return created;
          }}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  if (firstEventId !== null) {
    return (
      <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Opening your events…
      </p>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-prose">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          No active events
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Create your first event to start adding tables and bookings. You can
          have up to {MAX_ACTIVE_EVENTS} active at once.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 h-11 rounded-md bg-black px-4 text-base font-medium text-white dark:bg-zinc-50 dark:text-black"
        >
          + New event
        </button>
      </div>
    </div>
  );
}
