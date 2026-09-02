"use client";

import { useParams } from "next/navigation";
import { useEventContext } from "@/components/event-provider";

/** Placeholder screen. Expense line items for the selected event. */
export default function ExpensesScreen() {
  const { activeEvents } = useEventContext();
  const params = useParams<{ eventId: string }>();

  const event = activeEvents.find(
    (candidate) => candidate.id === params.eventId,
  );
  if (!event) return null;

  return (
    <section>
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        {`${event.name} · Expenses`}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        Line items for this event, carried forward automatically when a new event is created.
      </p>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
        Not built yet. This screen exists so navigation, back and forward all
        work while the features are added.
      </p>
    </section>
  );
}
