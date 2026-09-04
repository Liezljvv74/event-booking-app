"use client";

import { useState } from "react";
import Link from "next/link";
import { BookingCard } from "@/components/booking-card";
import { useEventContext } from "@/components/event-provider";
import { NewBookingForm } from "@/components/new-booking-form";
import { tableOccupancy } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";
import { eventHref, useEventId } from "@/lib/event-routes";

/** How many tables to name before the line gets too long to scan. */
const MAX_TABLES_LISTED = 8;

/**
 * Why a party could not be seated together, and where the room actually is.
 *
 * A party is never split across tables on its own, so this is the manager's
 * cue to place the guests by hand — pointing at the roomiest table rather
 * than leaving them to hunt for it.
 */
function describeUnseated(event: Event, guestCount: number): string {
  const room = tableOccupancy(event)
    .filter((entry) => entry.free > 0)
    .sort((a, b) => b.free - a.free || a.tableNumber - b.tableNumber);

  if (room.length === 0) {
    return (
      `Every table is full, so this party of ${guestCount} is unseated. ` +
      `Add a table, or more seats to an existing one.`
    );
  }

  const roomiest = room[0];
  return (
    `No single table has ${guestCount} free seats, so this party is unseated. ` +
    `Table ${roomiest.tableNumber} has the most room, with ${roomiest.free}. ` +
    `Seat the guests individually, or add seats.`
  );
}

export default function BookingsScreen() {
  const {
    activeEvents,
    addBooking,
    editBookingDetails,
    editAttendee,
    moveGuests,
    cancelOneAttendee,
    cancelWholeBooking,
  } = useEventContext();
  const eventId = useEventId();
  const [creating, setCreating] = useState(false);
  // Parties start collapsed so the screen is a readable list of party names.
  // Several can be open at once, since comparing two parties is common.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState("");

  function toggle(bookingId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(bookingId)) next.add(bookingId);
      return next;
    });
  }

  const event = activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  const attendees = event.bookings.flatMap((booking) => booking.attendees);
  const live = attendees.filter((attendee) =>
    SEAT_OCCUPYING_STATUSES.includes(attendee.status),
  );
  const unseated = live.filter(
    (attendee) => attendee.assignedTableNumber === null,
  ).length;
  const seatsTotal = event.tables.reduce(
    (total, table) => total + table.seatCount,
    0,
  );

  // Tables are shared, so what matters when placing a party is not which
  // tables are empty but which still have room.
  const withRoom = tableOccupancy(event).filter((entry) => entry.free > 0);
  const listed = withRoom.slice(0, MAX_TABLES_LISTED);
  const beyond = withRoom.length - listed.length;

  return (
    <section>
      {/* Heading, counts and the New booking button share one row: ten guest
          rows have to fit on a phone screen, and a separate button row costs
          about sixty pixels of that. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Bookings
        </h1>
        <p
          data-bookings-summary
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {event.bookings.length} booking
          {event.bookings.length === 1 ? "" : "s"} · {live.length} guest
          {live.length === 1 ? "" : "s"}
          {unseated > 0 ? ` · ${unseated} unseated` : ""}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto h-9 rounded-md bg-black px-3 text-sm font-medium whitespace-nowrap text-white dark:bg-zinc-50 dark:text-black"
          >
            <span className="sm:hidden" aria-hidden="true">
              +
            </span>
            <span className="max-sm:sr-only">+ New booking</span>
          </button>
        )}
      </div>

      {event.tables.length > 0 && (
        <p
          data-free-seats
          className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400"
        >
          {withRoom.length === 0 ? (
            <>All {seatsTotal} seats are taken.</>
          ) : (
            <>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Free seats
              </span>
              {" — "}
              {listed
                .map((entry) => `table ${entry.tableNumber}: ${entry.free}`)
                .join(", ")}
              {beyond > 0 ? `, and ${beyond} more` : ""}
            </>
          )}
        </p>
      )}

      {/* Guests can be booked before any table exists, but they cannot be
          seated, so say so rather than leaving an empty Table dropdown. */}
      {event.tables.length === 0 && (
        <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          This event has no tables yet, so guests cannot be seated.{" "}
          <Link
            href={eventHref(event.id, "tables")}
            className="underline dark:text-zinc-300"
          >
            Add tables
          </Link>{" "}
          when you are ready.
        </p>
      )}

      {live.length > seatsTotal && (
        <p
          role="alert"
          className="mt-3 max-w-prose text-sm text-amber-700 dark:text-amber-500"
        >
          {live.length} guests booked but only {seatsTotal} seats exist. Add
          tables or seats to fit everyone.
        </p>
      )}

      {notice !== "" && (
        <p
          data-booking-notice
          className="mt-3 max-w-prose text-sm text-amber-700 dark:text-amber-500"
        >
          {notice}
        </p>
      )}

      {creating && (
        <div className="mt-3">
          <NewBookingForm
            onCreate={async (input) => {
              const created = await addBooking(event.id, input);
              setCreating(false);
              // Open the party just captured: its guests still need names.
              setExpanded((current) => new Set(current).add(created.bookingId));
              setNotice(
                created.seatedAtTable === null
                  ? describeUnseated(created.event, input.guestCount)
                  : "",
              );
              return created;
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {event.bookings.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          No bookings yet. A booking is a party name, a telephone number and a
          guest count. Each party is seated at the table with the least room to
          spare that still fits them, so tables fill up before new ones are
          opened.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {event.bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              event={event}
              booking={booking}
              expanded={expanded.has(booking.id)}
              onToggle={() => toggle(booking.id)}
              onSaveDetails={(details) =>
                editBookingDetails(event.id, booking.id, details)
              }
              onPatchAttendee={(attendeeId, patch) =>
                editAttendee(event.id, booking.id, attendeeId, patch)
              }
              onMoveGuests={(attendeeIds, tableNumber) =>
                moveGuests(
                  event.id,
                  attendeeIds.map((attendeeId) => ({
                    bookingId: booking.id,
                    attendeeId,
                  })),
                  tableNumber,
                )
              }
              onCancelAttendee={(attendeeId) =>
                cancelOneAttendee(event.id, booking.id, attendeeId)
              }
              onCancelBooking={() => cancelWholeBooking(event.id, booking.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
