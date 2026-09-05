"use client";

import { useState } from "react";
import Link from "next/link";
import { tableOccupancy, type EventDetailsPatch } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";
import { eventHref } from "@/lib/event-routes";
import { formatEventDate } from "@/lib/event-time";
import { describeError } from "@/lib/errors";
import {
  TicketPricesEditor,
  signatureOfPrices,
  useTicketPriceRows,
} from "@/components/ticket-prices-editor";
import {
  TablesEditor,
  signatureOfTables,
  useTableRows,
} from "@/components/tables-editor";
import { FIELD_CLASS, FIELD_LABEL_CLASS } from "@/components/form-styles";

interface Props {
  event: Event;
  onSave: (patch: EventDetailsPatch) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}

const fieldClass = FIELD_CLASS;
const labelClass = FIELD_LABEL_CLASS;

/** A pen, drawn rather than fetched: the dependency list stays as it is. */
function PenIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.9 1.9a1.6 1.6 0 0 1 2.2 2.2L5.4 12.8l-3 .8.8-3z" />
      <path d="M10.6 3.2l2.2 2.2" />
    </svg>
  );
}

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
 * One event in the list: its name and date on a line, and the pen that opens
 * the rest of it to be edited, saved or cancelled.
 *
 * Closed shut by default. A screenful of events used to be a screenful of
 * open forms — every field of every event on show whether or not any of them
 * were being changed — and the list is read far more often than it is
 * edited. Everything that acts on the event, deleting it included, lives
 * inside the opened detail, so nothing on a closed row can be triggered by a
 * stray click while reading down the list.
 */
export function EventEditor({ event, onSave, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(event.name);
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const prices = useTicketPriceRows(event.ticketPrices);
  // Tables are edited here too, and saved with the rest of the row: this is
  // the only screen that lays an event out, so the event's own screens have
  // no second way of doing it.
  const tables = useTableRows(event.tables);
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

  /** Back to what is stored, which is what both Cancel and the pen do. */
  function revert() {
    setName(event.name);
    setEventDate(event.eventDate);
    setStartTime(event.startTime ?? "");
    setEndTime(event.endTime ?? "");
    prices.reset(event.ticketPrices);
    tables.reset(event.tables);
    setError("");
    setConfirming(false);
  }

  // The stored event wins when it changes underneath, so a refused edit does
  // not leave the fields showing something that was never saved.
  const [last, setLast] = useState(event);
  if (last !== event) {
    setLast(event);
    revert();
  }

  const changed =
    name !== event.name ||
    eventDate !== event.eventDate ||
    startTime !== (event.startTime ?? "") ||
    endTime !== (event.endTime ?? "") ||
    prices.signature !== signatureOfPrices(event.ticketPrices) ||
    tables.signature !== signatureOfTables(event.tables);

  const held = contents(event);

  /** Guests at each table, so a cross can say what removing it would cost. */
  const seated = new Map(
    tableOccupancy(event).map((entry) => [entry.tableNumber, entry.taken]),
  );

  function close() {
    revert();
    setOpen(false);
  }

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
    const laid = tables.toInputs();
    if ("error" in laid) {
      setError(laid.error);
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
        tables: laid.tables,
      });
      // Saved is done: the row closes back to the line it opened from. A
      // refusal is not done, and leaves it open with the reason showing.
      setOpen(false);
    } catch (caught) {
      setError(describeError(caught));
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
      setError(describeError(caught));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      data-manage-event={event.id}
      data-open={open ? "" : undefined}
      className="rounded-lg border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
    >
      {/* The closed row, and the heading of the open one: what the event is,
          with no labels on it, because a name beside a date needs none. */}
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-zinc-50">
          {event.name}
        </span>
        <span className="shrink-0 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
          {formatEventDate(event.eventDate)}
        </span>
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          disabled={busy}
          aria-expanded={open}
          aria-label={open ? `Close ${event.name}` : `Edit ${event.name}`}
          title={open ? "Close without saving" : "Edit this event"}
          data-manage-edit={event.id}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-zinc-700 disabled:opacity-50 dark:text-zinc-300 ${
            open
              ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
              : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          }`}
        >
          <PenIcon />
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-2">
          {/* Name, date and times on one line, the same shape the New event
              form has, measured against the column this sits in rather
              than the window. */}
          <div className="grid gap-2 @xl:grid-cols-[minmax(9rem,1fr)_10rem_7rem_7rem]">
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
          </div>

          {/* Below the row rather than inside it. How many prices an event
              has varies, and keeping them out of the grid is what lets the
              date fields sit beside the name. */}
          <div className="mt-1.5">
            <TicketPricesEditor
              control={prices}
              disabled={busy}
              scope={event.id}
              ofWhat={event.name}
            />
          </div>

          {/* Last of the fields, as on the New event form. Removing a table
              unseats whoever is at it, so the crosses say how many that
              would be, and nothing is written until Save. */}
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <TablesEditor
              control={tables}
              disabled={busy}
              seated={seated}
              scope={event.id}
              ofWhat={event.name}
            />
          </div>

          {error !== "" && (
            <p
              role="alert"
              className="mt-1.5 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p
              data-manage-contents={event.id}
              className="text-xs text-zinc-600 dark:text-zinc-400"
            >
              {held.tables} table{held.tables === 1 ? "" : "s"} ·{" "}
              {held.bookings} booking{held.bookings === 1 ? "" : "s"} ·{" "}
              {held.guests} guest{held.guests === 1 ? "" : "s"} ·{" "}
              {held.expenses} expense line{held.expenses === 1 ? "" : "s"}
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
                <>
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
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    data-manage-cancel={event.id}
                    className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !changed}
                    data-manage-save={event.id}
                    className="h-9 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-black"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      )}
    </li>
  );
}
