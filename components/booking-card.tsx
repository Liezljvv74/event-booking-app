"use client";

import { useId, useState } from "react";
import {
  ATTENDEE_GRID,
  ATTENDEE_MIN_WIDTH,
  AttendeeRow,
} from "@/components/attendee-row";

import { tableOccupancy, type AttendeePatch } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Booking, type Event } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { useMoney } from "@/components/event-provider";

interface Props {
  event: Event;
  booking: Booking;
  expanded: boolean;
  onToggle: () => void;
  onPatchAttendee: (attendeeId: string, patch: AttendeePatch) => Promise<unknown>;
  /** Moves exactly these guests, leaving the rest of the party where it is. */
  onMoveGuests: (
    attendeeIds: readonly string[],
    tableNumber: number | null,
  ) => Promise<unknown>;
  onCancelAttendee: (attendeeId: string) => Promise<unknown>;
  /** One more guest on this party, at the party's own price. */
  onAddGuest: () => Promise<unknown>;
  onCancelBooking: () => Promise<unknown>;
  onSaveDetails: (details: {
    partyName: string;
    telephone: string;
  }) => Promise<unknown>;
}

/** The tables the party's uncancelled guests are sitting at. */
function tablesInUse(booking: Booking): number[] {
  const numbers = booking.attendees
    .filter((attendee) => SEAT_OCCUPYING_STATUSES.includes(attendee.status))
    .map((attendee) => attendee.assignedTableNumber)
    .filter((table): table is number => table !== null);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export function BookingCard({
  event,
  booking,
  expanded,
  onToggle,
  onPatchAttendee,
  onMoveGuests,
  onCancelAttendee,
  onAddGuest,
  onCancelBooking,
  onSaveDetails,
}: Props) {
  const money = useMoney();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guestsId = useId();

  // Drafts of the two fields the header carries, held only while editing.
  const [draftName, setDraftName] = useState(booking.partyName);
  const [draftPhone, setDraftPhone] = useState(booking.telephone);

  function openEdit() {
    // Read from the booking each time, so a cancelled edit is not remembered.
    setDraftName(booking.partyName);
    setDraftPhone(booking.telephone);
    setError("");
    setEditing(true);
  }

  async function addGuest() {
    setBusy(true);
    setError("");
    try {
      await onAddGuest();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSaveDetails({
        partyName: draftName,
        telephone: draftPhone,
      });
      setEditing(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  // Guests picked for a move, by id. Held here rather than per row so several
  // can travel together, and so the destinations can be worked out against
  // the whole selection at once.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggleSelected(attendeeId: string, wanted: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (wanted) next.add(attendeeId);
      else next.delete(attendeeId);
      return next;
    });
  }

  const live = booking.attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );
  const cancelledCount = booking.attendees.length - live.length;
  const allCancelled = live.length === 0;
  const dueCents = booking.attendees
    .filter((attendee) => attendee.status === "pay_at_venue")
    .reduce((total, attendee) => total + attendee.ticketPriceCents, 0);

  const tables = tablesInUse(booking);
  const unseated = live.filter(
    (attendee) => attendee.assignedTableNumber === null,
  ).length;

  // Collapsed, the party line is all the manager sees, so it has to say where
  // the party is sitting and whether anyone still needs a seat.
  // Pluralised on the number of tables alone. Tying it to the unseated count
  // as well read "tables 2 · 7 unseated" for a party sitting at one table
  // with the rest still to place — now the ordinary way a shared table fills.
  const seating =
    tables.length === 0
      ? live.length > 0
        ? "unseated"
        : ""
      : `${tables.length === 1 ? "table" : "tables"} ${tables.join(", ")}` +
        (unseated > 0 ? ` · ${unseated} unseated` : "");

  // A cancelled guest cannot be picked, so everyone travelling needs a seat.
  const seatsNeeded = live.filter((attendee) => selected.has(attendee.id))
    .length;
  // Discounting the travellers, so the table they are leaving does not look
  // occupied by the very guests about to vacate it.
  const destinations = tableOccupancy(event, selected);
  const allSelected = live.length > 0 && selected.size === live.length;

  async function move(choice: string) {
    setBusy(true);
    setError("");
    try {
      await onMoveGuests(
        [...selected],
        choice === "none" ? null : Number(choice),
      );
      setSelected(new Set());
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    setBusy(true);
    setError("");
    try {
      await onCancelBooking();
      setConfirming(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    /**
     * A party with anybody still to place is marked, on request, in the amber
     * this app already uses for something that wants attention but is not
     * wrong — the same colour as the dashboard's unseated line and the
     * bookings screen's own warning about more guests than seats.
     *
     * The whole card rather than a badge on it: the point of a colour is to
     * be findable while scrolling past thirty parties, and a badge has to be
     * read to be noticed. A wholly cancelled party is left alone even though
     * nobody in it has a seat — nobody in it is coming either.
     */
    <li
      data-booking={booking.id}
      data-has-unseated={unseated > 0 && !allCancelled ? "" : undefined}
      className={`rounded-lg border p-2 ${
        unseated > 0 && !allCancelled
          ? "border-amber-400 bg-amber-50 dark:border-amber-700/70 dark:bg-amber-950/30"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* Editing replaces the header rather than opening a panel beneath it.
          The name and the telephone are what the header already shows, so a
          second view of them said nothing the first had not. */}
      {editing ? (
        <form
          onSubmit={saveDetails}
          data-party-form={booking.id}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            value={draftName}
            disabled={busy}
            autoFocus
            aria-label={`Party name of ${booking.partyName}`}
            data-party-name-input={booking.id}
            onChange={(changed) => setDraftName(changed.target.value)}
            className="h-9 min-w-[8rem] flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <input
            type="tel"
            value={draftPhone}
            disabled={busy}
            aria-label={`Telephone for ${booking.partyName}`}
            data-party-phone-input={booking.id}
            onChange={(changed) => setDraftPhone(changed.target.value)}
            className="h-9 min-w-[8rem] flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={busy}
            data-party-save={booking.id}
            className="h-9 rounded-md bg-black px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            Cancel
          </button>
        </form>
      ) : (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {/* The party name is the control that opens the guests, so the whole
            label is the click target rather than a separate small caret. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={guestsId}
          data-party-toggle={booking.id}
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <span
            aria-hidden="true"
            className={`text-xs text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="truncate text-sm font-semibold text-black dark:text-zinc-50">
            {booking.partyName}
          </span>
          <span
            data-booking-summary={booking.id}
            className="truncate text-xs font-normal text-zinc-600 dark:text-zinc-400"
          >
            {live.length}/{booking.attendees.length} guests
            {seating === "" ? "" : ` · ${seating}`}
            {cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}
            {dueCents > 0 ? ` · ${money(dueCents)} due` : ""}
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={`tel:${booking.telephone}`}
            className="hidden text-xs text-zinc-600 underline sm:inline dark:text-zinc-400"
          >
            {booking.telephone}
          </a>

          <button
            type="button"
            onClick={openEdit}
            data-party-edit={booking.id}
            aria-label={`Edit ${booking.partyName} details`}
            className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
          >
            Edit
          </button>

          {allCancelled ? (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Party cancelled
            </span>
          ) : confirming ? (
            <>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Cancel all {live.length}?
              </span>
              <button
                type="button"
                onClick={cancelAll}
                disabled={busy}
                data-confirm-cancel-booking={booking.id}
                className="h-9 rounded-md bg-red-600 px-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Cancel party
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
              >
                Keep
              </button>
            </>
          ) : (
            /* Square, so it reads as a cross rather than a word. It only
               asks the question — the red button that answers it keeps its
               words, because a cross beside "Keep" would be read as "never
               mind" by half the people who pressed it, and cancelling a
               party is the one thing in this app that cannot be undone. */
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Cancel the whole of ${booking.partyName}`}
              title="Cancel this whole party"
              data-cancel-booking={booking.id}
              className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      </div>
      )}

      {error !== "" && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Kept in the DOM but hidden while collapsed, so a half-typed guest
          name is not thrown away by closing the party. */}
      <div id={guestsId} hidden={!expanded}>
        {selected.size > 0 && (
          <div
            data-move-bar={booking.id}
            className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-zinc-100 px-2 py-1.5 dark:bg-zinc-900"
          >
            <span className="text-xs font-medium text-black dark:text-zinc-50">
              {selected.size} guest{selected.size === 1 ? "" : "s"} picked
            </span>

            {/* Choosing a destination performs the move, as elsewhere in the
                app, rather than arming a separate confirm button. The value
                stays empty so the label returns after each move. */}
            <select
              value=""
              disabled={busy}
              aria-label={`Move ${selected.size} picked guests`}
              data-move-to={booking.id}
              onChange={(changed) => void move(changed.target.value)}
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="">Move to…</option>
              <option value="none">No table</option>
              {destinations.map((entry) => {
                const room = entry.free >= seatsNeeded;
                return (
                  <option
                    key={entry.tableNumber}
                    value={entry.tableNumber}
                    disabled={!room}
                  >
                    {`Table ${entry.tableNumber} · ${entry.free} free`}
                    {room ? "" : " - too few"}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={busy}
              aria-label={`Clear the guests picked in ${booking.partyName}`}
              title="Clear the guests picked"
              data-move-clear={booking.id}
              className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden="true">×</span>
            </button>

          </div>
        )}

        {/* Nothing to lay out for a party that is wholly cancelled: its
            guests are all in Cancelled guests below, and the column headings
            on their own read as a table waiting to be filled. The header
            line above already says the party is off. */}
        {allCancelled ? null : (
        /* The columns are narrower than a phone, so they scroll sideways
           here rather than wrapping each guest onto several lines. */
        <div className="mt-2 overflow-x-auto">
          <div className={ATTENDEE_MIN_WIDTH}>
            <div
              className={`${ATTENDEE_GRID} px-1 pb-1 text-xs text-zinc-500 dark:text-zinc-500`}
            >
              <input
                type="checkbox"
                checked={allSelected}
                disabled={busy}
                aria-label={`Select every guest in ${booking.partyName}`}
                data-select-all={booking.id}
                onChange={(changed) =>
                  setSelected(
                    changed.target.checked
                      ? new Set(live.map((guest) => guest.id))
                      : new Set(),
                  )
                }
                className="h-4 w-4 justify-self-center accent-black dark:accent-zinc-300"
              />
              <span>Name</span>
              <span className="text-center">Regular</span>
              <span>Table</span>
              <span>Status</span>
              <span>Ticket</span>
              <span />
            </div>

            {/* The rows Enter walks down, one list per party: Enter on the
                last guest adds another and goes to it. */}
            <ul data-list className="flex flex-col gap-0.5">
              {live.map((attendee, index) => (
                <AttendeeRow
                  key={attendee.id}
                  event={event}
                  attendee={attendee}
                  position={index + 1}
                  selected={selected.has(attendee.id)}
                  onSelect={(wanted) => toggleSelected(attendee.id, wanted)}
                  onPatch={(patch) => onPatchAttendee(attendee.id, patch)}
                  onCancel={() => onCancelAttendee(attendee.id)}
                  onAddGuest={onAddGuest}
                />
              ))}
            </ul>

          </div>
        </div>
        )}

        {/* Bottom right of the party, below its guests: the place a list is
            added to. Left off a wholly cancelled party — that booking is
            off, and a live guest on it would be an un-cancellation by the
            side door, which this app does not have. */}
        {!allCancelled && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={addGuest}
              disabled={busy}
              data-add-guest={booking.id}
              aria-label={`Add a guest to ${booking.partyName}`}
              title="Add a guest to this party"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
