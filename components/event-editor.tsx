"use client";

import { useState } from "react";
import Link from "next/link";
import type { EventDetailsPatch } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";
import { eventHref } from "@/lib/event-routes";
import {
  TicketPricesEditor,
  signatureOfPrices,
  useTicketPriceRows,
} from "@/components/ticket-prices-editor";

interface Props {
  event: Event;
  onSave: (patch: EventDetailsPatch) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}

const fieldClass =
  "h-11 w-full min-w-0 rounded-md sm:h-9 border border-zinc-300 bg-white px-2 text-base text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-xs text-zinc-600 dark:text-zinc-400";

/** What removing this event would destroy, so the confirm can say so. */
function contents(event: Event) {
  const guests = event.bookings
    .flatMap((booking) => booking.attendees)
    .filter((attendee) => SEAT_OCCUPYING_STATUSES.includes(attendee.status));

  return {
    tables: event.tables.length,
    bookings: event.bookings.length,
    guests: guests.length,
    expenses: event.expenses.length,
  };
}

/**
 * One event's details, editable, with the option to delete it.
 *
 * The name could not be changed anywhere before this: it was fixed at
 * creation, so a typo in a name lived on the tab for the life of the event.
 */
export function EventEditor({ event, onSave, onRemove }: Props) {
  const [name, setName] = useState(event.name);
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const prices = useTicketPriceRows(event.ticketPrices);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Editing any field clears the last refusal, so a corrected field is not
   * left sitting beside a complaint about what it used to hold.
   */
  function edit(apply: () => void) {
    apply();
    if (error !== "") setError("");
  }

  // The stored event wins when it changes underneath, so a refused edit does
  // not leave the fields showing something that was never saved.
  const [last, setLast] = useState(event);
  if (last !== event) {
    setLast(event);
    setName(event.name);
    setEventDate(event.eventDate);
    setStartTime(event.startTime ?? "");
    setEndTime(event.endTime ?? "");
    prices.reset(event.ticketPrices);
  }

  const changed =
    name !== event.name ||
    eventDate !== event.eventDate ||
    startTime !== (event.startTime ?? "") ||
    endTime !== (event.endTime ?? "") ||
    prices.signature !== signatureOfPrices(event.ticketPrices);

  const held = contents(event);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (name.trim() === "") {
      setError("Give the event a name.");
      return;
    }
    if (eventDate === "") {
      setError("Pick an event date.");
      return;
    }
    const priced = prices.toInputs();
    if ("error" in priced) {
      setError(priced.error);
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onSave({
        name,
        eventDate,
        startTime: startTime === "" ? null : startTime,
        endTime: endTime === "" ? null : endTime,
        ticketPrices: priced.prices,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onRemove();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      data-manage-event={event.id}
      className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
    >
      <form onSubmit={submit}>
        {/* Name, date, times and Save on one line, so a screenful of events
            is a screenful rather than four of them. */}
        <div className="grid gap-2 sm:grid-cols-[minmax(9rem,1fr)_10rem_7rem_7rem_auto]">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Event name</span>
            <input
              type="text"
              value={name}
              disabled={busy}
              aria-label={`Name of ${event.name}`}
              data-manage-name={event.id}
              onChange={(changedField) =>
                edit(() => setName(changedField.target.value))
              }
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Date</span>
            <input
              type="date"
              value={eventDate}
              disabled={busy}
              aria-label={`Date of ${event.name}`}
              data-manage-date={event.id}
              onChange={(changedField) =>
                edit(() => setEventDate(changedField.target.value))
              }
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Start</span>
            <input
              type="time"
              value={startTime}
              disabled={busy}
              aria-label={`Start time of ${event.name}`}
              data-manage-start={event.id}
              onChange={(changedField) =>
                edit(() => setStartTime(changedField.target.value))
              }
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>End</span>
            <input
              type="time"
              value={endTime}
              disabled={busy}
              aria-label={`End time of ${event.name}`}
              data-manage-end={event.id}
              onChange={(changedField) =>
                edit(() => setEndTime(changedField.target.value))
              }
              className={fieldClass}
            />
          </label>

          {/* Aligned with the fields rather than their labels. */}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy || !changed}
              data-manage-save={event.id}
              className="h-11 w-full rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-40 sm:h-9 sm:w-auto dark:bg-zinc-50 dark:text-black"
            >
              {busy ? "Saving…" : changed ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        {/* Below the row rather than inside it. How many prices an event has
            varies, and keeping them out of the grid is what lets the date
            fields sit beside the name. */}
        <div className="mt-1.5">
          <TicketPricesEditor
            control={prices}
            disabled={busy}
            scope={event.id}
            ofWhat={event.name}
          />
        </div>
      </form>

      {error !== "" && (
        <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p
          data-manage-contents={event.id}
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {held.tables} table{held.tables === 1 ? "" : "s"} · {held.bookings}{" "}
          booking{held.bookings === 1 ? "" : "s"} · {held.guests} guest
          {held.guests === 1 ? "" : "s"} · {held.expenses} expense line
          {held.expenses === 1 ? "" : "s"}
        </p>

        {event.status === "active" && (
          <Link
            href={eventHref(event.id)}
            data-manage-open={event.id}
            className="text-xs text-zinc-700 underline dark:text-zinc-300"
          >
            Open
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              {/* Names what goes, because none of it comes back. */}
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                Delete {event.name} and its {held.bookings} booking
                {held.bookings === 1 ? "" : "s"}?
              </span>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                data-manage-confirm-remove={event.id}
                className="h-9 rounded-md bg-red-600 px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              data-manage-remove={event.id}
              aria-label={`Remove ${event.name}`}
              className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
            >
              Remove event
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
