"use client";

/**
 * Entry screen, and nothing more than a signpost.
 *
 * Which event to open cannot be known until the browser has read IndexedDB,
 * so this loads and then hands off: to the first active event, or to Manage
 * events when there is none. Creating an event used to happen here as well,
 * which made a second New event form to keep in step with the real one;
 * Manage events owns that now, and it is where an empty app lands.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEvents } from "@/lib/use-events";
import { eventHref, MANAGE_EVENTS_PATH } from "@/lib/event-routes";

export default function Home() {
  const { state, error, activeEvents } = useEvents();
  const router = useRouter();

  const firstEventId = activeEvents[0]?.id ?? null;

  useEffect(() => {
    if (state !== "ready") return;
    // Replace, not push: pushing would leave "/" in the history, and going
    // back would land here and immediately redirect forward again.
    router.replace(
      firstEventId === null ? MANAGE_EVENTS_PATH : eventHref(firstEventId),
    );
  }, [state, firstEventId, router]);

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

  return (
    <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
      Opening your events…
    </p>
  );
}
