"use client";

import { useParams } from "next/navigation";
import { useEventContext } from "@/components/event-provider";

/** Placeholder screen. Tables for the selected event. */
export default function TablesScreen() {
  const { activeEvents } = useEventContext();
  const params = useParams<{ eventId: string }>();

  const event = activeEvents.find(
    (candidate) => candidate.id === params.eventId,
  );
  if (!event) return null;

  return (
    <section>
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        {`${event.name} · Tables`}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        A numbered list of tables with seat counts, ten seats by default.
      </p>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
        Not built yet. This screen exists so navigation, back and forward all
        work while the features are added.
      </p>
    </section>
  );
}
