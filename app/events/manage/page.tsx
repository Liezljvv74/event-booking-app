"use client";

/**
 * Every event in one place: create, rename, re-date, re-time, re-price, or
 * delete. Every function that is about an event as a whole lives here, so
 * none of the event's own screens has to carry a second way of doing it.
 *
 * A section of the nav rather than one of the event's own three. It is about
 * all of the events, closed ones included, and those appear in no tab.
 *
 * The screen is split in two: the events that exist on the left, the form
 * that makes another on the right. Creating one used to be a "+ New event"
 * button that swapped itself for the form; with the form given a column of
 * its own there is nothing left for the button to open, so it is gone.
 */

import { useState } from "react";
import { useEventContext } from "@/components/event-provider";
import { EventEditor } from "@/components/event-editor";
import { NewEventForm } from "@/components/new-event-form";
import { formatEventDate } from "@/lib/event-time";
import { type Event } from "@/lib/types";

function byDateThenName(a: Event, b: Event): number {
  return a.eventDate.localeCompare(b.eventDate) || a.name.localeCompare(b.name);
}

export default function ManageEventsScreen() {
  const { allEvents, lastTimes, addEvent, editEventDetails, removeEvent } =
    useEventContext();
  /**
   * Bumped after every event created. It is the form's key, so a new one
   * remounts it: the fields clear, and the times it starts from are re-read
   * from the event just saved. The form no longer unmounts by itself, and
   * without this it would sit there still showing the last event entered.
   */
  const [created, setCreated] = useState(0);

  const active = allEvents
    .filter((event) => event.status === "active")
    .sort(byDateThenName);
  const closed = allEvents
    .filter((event) => event.status === "closed")
    .sort(byDateThenName)
    .reverse();

  return (
    /* Two columns of equal width, and only once there is room for both: an
       opened event and the New event form are the same four fields across, so
       whatever width one of them needs the other needs too.

       Each column is a query container, so the rows inside lay themselves
       out against the width they actually have rather than the window's. */
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section data-column="events" className="@container">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            Scheduled Events
          </h2>
          <p
            data-active-count
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {active.length} event{active.length === 1 ? "" : "s"}
          </p>
        </div>

        {active.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
            {allEvents.length === 0
              ? "You have no events yet. Schedule your first one to start adding tables and bookings."
              : "Nothing active. An event closes automatically 48 hours after its date."}
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5">
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

        {closed.length > 0 && (
          <div className="mt-5">
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">
              Closed
            </h3>
            <p className="mt-1 max-w-prose text-xs text-zinc-600 dark:text-zinc-400">
              Kept for the retention period and then deleted automatically.
              This is the only screen they appear on, so delete one here to be
              rid of it sooner.
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {closed.map((event) => (
                <EventEditor
                  key={event.id}
                  event={event}
                  onSave={(patch) => editEventDetails(event.id, patch)}
                  onRemove={() => removeEvent(event.id)}
                />
              ))}
            </ul>
          </div>
        )}

        {allEvents.length > 0 && (
          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
            Earliest event {formatEventDate(allEvents[0].eventDate)} ·{" "}
            {allEvents.length} event{allEvents.length === 1 ? "" : "s"} stored
          </p>
        )}
      </section>

      <section data-column="new" className="@container">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Schedule a new event
        </h2>

        <div className="mt-3">
          <NewEventForm
            key={created}
            lastTimes={lastTimes}
            onCreate={async (input) => {
              const event = await addEvent(input);
              // Staying put: the new event appears in the list beside this
              // one, and the point of being here is to work on the set.
              setCreated((count) => count + 1);
              return event;
            }}
          />
        </div>
      </section>
    </div>
  );
}
