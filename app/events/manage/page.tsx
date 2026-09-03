"use client";

/**
 * Every event in one place: rename, re-date, re-time, or delete.
 *
 * Deliberately outside the /events/[eventId] layout. That layout is chrome
 * for one event — tabs and section nav — and this screen is about all of
 * them, closed ones included, which never appear in those tabs at all.
 */

import { useState } from "react";
import Link from "next/link";
import { EventEditor } from "@/components/event-editor";
import { NewEventForm } from "@/components/new-event-form";
import { formatEventDate } from "@/lib/event-time";
import { useEvents } from "@/lib/use-events";
import { MAX_ACTIVE_EVENTS, type Event } from "@/lib/types";

function byDateThenName(a: Event, b: Event): number {
  return a.eventDate.localeCompare(b.eventDate) || a.name.localeCompare(b.name);
}

export default function ManageEventsScreen() {
  const {
    state,
    error,
    allEvents,
    atEventLimit,
    lastTimes,
    addEvent,
    editEventDetails,
    removeEvent,
  } = useEvents();
  const [creating, setCreating] = useState(false);

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

  const active = allEvents
    .filter((event) => event.status === "active")
    .sort(byDateThenName);
  const closed = allEvents
    .filter((event) => event.status === "closed")
    .sort(byDateThenName)
    .reverse();

  const first = active[0] ?? allEvents[0];

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Manage events
        </h1>
        <Link
          href={first === undefined ? "/" : `/events/${first.id}`}
          className="text-sm text-zinc-700 underline dark:text-zinc-300"
        >
          Back to your events
        </Link>
      </div>

      <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        Create an event here, change one&apos;s name, date or times, or delete
        one you no longer want. Deleting takes its tables, bookings and
        expenses with it and cannot be undone.
      </p>

      {creating ? (
        <div className="mt-4">
          <NewEventForm
            lastTimes={lastTimes}
            onCreate={async (input) => {
              const created = await addEvent(input);
              // Staying put: the new event appears in the list below, and
              // the point of being here is to work on the set of them.
              setCreating(false);
              return created;
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={atEventLimit}
          data-new-event
          title={
            atEventLimit
              ? `${MAX_ACTIVE_EVENTS} events are already active. Delete one to make room.`
              : undefined
          }
          className="mt-4 h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-black"
        >
          + New event
        </button>
      )}

      {atEventLimit && !creating && (
        <p className="mt-2 max-w-prose text-sm text-amber-700 dark:text-amber-500">
          {MAX_ACTIVE_EVENTS} events are already active, which is the limit.
          Delete one below to make room for another.
        </p>
      )}

      {allEvents.length === 0 ? (
        <p className="mt-6 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          You have no events yet. Create your first one above to start adding
          tables and bookings.
        </p>
      ) : (
        <section className="mt-6">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">
              Active
            </h2>
            <p
              data-active-count
              className="text-xs text-zinc-600 dark:text-zinc-400"
            >
              {active.length} of {MAX_ACTIVE_EVENTS} in use
            </p>
          </div>

          {active.length === 0 ? (
            <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
              Nothing active. An event closes automatically 48 hours after its
              date.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {active.map((event) => (
                <EventEditor
                  key={event.id}
                  event={event}
                  onSave={(patch) => editEventDetails(event.id, patch)}
                  onRemove={() => removeEvent(event.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {closed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">
            Closed
          </h2>
          <p className="mt-1 max-w-prose text-xs text-zinc-600 dark:text-zinc-400">
            Kept for the retention period and then deleted automatically. This
            is the only screen they appear on, so delete one here to be rid of
            it sooner.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((event) => (
              <EventEditor
                key={event.id}
                event={event}
                onSave={(patch) => editEventDetails(event.id, patch)}
                onRemove={() => removeEvent(event.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {allEvents.length > 0 && (
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
          Earliest event {formatEventDate(allEvents[0].eventDate)} ·{" "}
          {allEvents.length} event{allEvents.length === 1 ? "" : "s"} stored
        </p>
      )}
    </div>
  );
}
