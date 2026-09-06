"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookingCard } from "@/components/booking-card";
import { CancelledGuests } from "@/components/cancelled-guests";
import { useEventContext } from "@/components/event-provider";
import { NewBookingForm } from "@/components/new-booking-form";
import { tableOccupancy, type SeatingShare } from "@/lib/repository";
import { SEAT_OCCUPYING_STATUSES, type Event } from "@/lib/types";
import {
  MANAGE_EVENTS_PATH,
  eventHref,
  useEventId,
  useWantsUnseated,
} from "@/lib/event-routes";

/** How many tables to name before the line gets too long to scan. */
const MAX_TABLES_LISTED = 8;

/** "table 4", "tables 4 and 5", "tables 4, 5 and 7". */
function listTables(shares: readonly SeatingShare[]): string {
  const numbers = shares.map((share) => share.tableNumber);
  const word = numbers.length === 1 ? "table" : "tables";
  if (numbers.length < 3) return `${word} ${numbers.join(" and ")}`;
  return `${word} ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/**
 * Where a party too big for one table ended up.
 *
 * Named table by table rather than left to be read off the guest rows: the
 * point of splitting a party automatically is that the manager does not have
 * to work out where everyone went, so the arrangement is stated once, here.
 */
function describeSplit(shares: readonly SeatingShare[], guestCount: number) {
  const places = shares.map(
    (share) => `${share.guestCount} at table ${share.tableNumber}`,
  );
  const listed =
    places.length < 3
      ? places.join(" and ")
      : `${places.slice(0, -1).join(", ")} and ${places.at(-1)}`;

  return (
    `No single table had room for ${guestCount} guests, so this party is ` +
    `seated across ${listTables(shares)}: ${listed}. ` +
    `Move guests between tables to change it.`
  );
}

/**
 * Why a party could not be seated at all, and where the room actually is.
 *
 * Reached only when neither one table nor any run of them can take the whole
 * party without leaving somebody sitting alone. That is the manager's cue to
 * place the guests by hand, so it points at the roomiest table rather than
 * leaving them to hunt for it.
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
    `No arrangement of tables seats all ${guestCount} guests without ` +
    `leaving one of them on their own, so this party is unseated. ` +
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
    addGuest,
    cancelWholeBooking,
  } = useEventContext();
  const eventId = useEventId();
  const [creating, setCreating] = useState(false);
  // Parties start collapsed so the screen is a readable list of party names.
  // Several can be open at once, since comparing two parties is common.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /**
   * Arriving from the dashboard's "Seat them", which asks for the parties
   * with somebody still to place rather than the top of the list.
   */
  const wantsUnseated = useWantsUnseated();
  /**
   * The event this screen has already opened for the dashboard's "Seat them",
   * so it does that once and not on every render.
   *
   * Opening the parties is a starting position, not a rule: one closed
   * afterwards stays closed, and nothing folds up under the cursor while a
   * guest is being seated.
   */
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  /** The party to bring on screen, once it has been opened. */
  const [seatTarget, setSeatTarget] = useState<string | null>(null);

  /**
   * Scrolling is a thing done to the document rather than to any state, so it
   * is what an effect is for. Setting the state that leads here is done while
   * rendering instead — the way every "the stored value has changed" case in
   * this app is — because state set from inside an effect renders twice for
   * no reason and the linter rightly says so.
   */
  useEffect(() => {
    if (seatTarget === null) return;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-booking="${CSS.escape(seatTarget)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [seatTarget]);
  /**
   * What became of the party just booked. A split is news and reads in the
   * ordinary text colour; only an unseated party is a problem to solve, and
   * only that is amber.
   */
  const [notice, setNotice] = useState<{
    text: string;
    tone: "news" | "problem";
  } | null>(null);

  function toggle(bookingId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(bookingId)) next.add(bookingId);
      return next;
    });
  }

  const event = activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  /**
   * Arriving from the dashboard's "Seat them": open every party with somebody
   * still to place, and mark the first of them to be brought on screen.
   *
   * Worked out here rather than on mount because the events are still loading
   * on the first render — there is nothing to look through until this line
   * has found one.
   */
  if (wantsUnseated && openedFor !== event.id) {
    setOpenedFor(event.id);

    const needing = event.bookings.filter((booking) =>
      booking.attendees.some(
        (attendee) =>
          SEAT_OCCUPYING_STATUSES.includes(attendee.status) &&
          attendee.assignedTableNumber === null,
      ),
    );

    if (needing.length > 0) {
      setExpanded(
        (current) =>
          new Set([...current, ...needing.map((booking) => booking.id)]),
      );
      setSeatTarget(needing[0].id);
    }
  }

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
            href={MANAGE_EVENTS_PATH}
            className="underline dark:text-zinc-300"
          >
            Add tables on Manage events
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

      {notice !== null && (
        <p
          data-booking-notice
          data-notice-tone={notice.tone}
          className={`mt-3 max-w-prose text-sm ${
            notice.tone === "problem"
              ? "text-amber-700 dark:text-amber-500"
              : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {creating && (
        <div className="mt-3">
          <NewBookingForm
            ticketPrices={event.ticketPrices}
            onCreate={async (input) => {
              const created = await addBooking(event.id, input);
              setCreating(false);
              // Open the party just captured: its guests still need names.
              setExpanded((current) => new Set(current).add(created.bookingId));
              // Nothing to say when one table took them: the party's own
              // rows show the table, and it is where it would have gone.
              setNotice(
                created.seating.length === 0
                  ? {
                      text: describeUnseated(created.event, input.guestCount),
                      tone: "problem",
                    }
                  : created.seating.length === 1
                    ? null
                    : {
                        text: describeSplit(
                          created.seating,
                          input.guestCount,
                        ),
                        tone: "news",
                      },
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
          guest count.
        </p>
      ) : (
        /* Two parties abreast once there is room for both. A party's guest
           rows need 36rem before they start scrolling sideways, and half of
           an `xl` screen still clears that, so the split costs nothing.

           Aligned to the top rather than stretched: one party open beside one
           closed should leave the closed one its own height, not a card of
           empty space matching the open one.

           Every column is minmax(0,1fr), the one below the split included: a
           bare `grid` sizes its implicit column to the widest thing in it,
           which on a phone is the 36rem of guest columns, and the page then
           scrolls sideways instead of the guest rows doing it. */
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] items-start gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
              onAddGuest={() => addGuest(event.id, booking.id)}
              onCancelBooking={() => cancelWholeBooking(event.id, booking.id)}
            />
          ))}
        </ul>
      )}

      {/* Below every booking, whichever parties they were cancelled from. */}
      <CancelledGuests event={event} />
    </section>
  );
}
