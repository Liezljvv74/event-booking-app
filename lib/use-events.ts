"use client";

/**
 * Loads active events from IndexedDB.
 *
 * Selection is not tracked here: the URL owns it, so the browser's back and
 * forward buttons move between events for free and a refresh keeps its place.
 *
 * IndexedDB exists only in the browser, so the first render must not read it.
 * The hook starts in "loading" and fetches inside an effect, which keeps the
 * server-rendered markup and the first client render identical.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isBrowser } from "./db";
import {
  TooManyActiveEventsError,
  addTable,
  cancelAttendee,
  cancelBooking,
  createBooking,
  createEvent,
  listEvents,
  removeTable,
  runRetentionSweep,
  setTableSeatCount,
  updateAttendee,
  updateEventSchedule,
  type AttendeePatch,
} from "./repository";
import { MAX_ACTIVE_EVENTS, type Event } from "./types";

export interface NewBookingInput {
  partyName: string;
  telephone: string;
  guestCount: number;
  ticketPriceCents: number;
}

export type LoadState = "loading" | "ready" | "error";

export interface NewEventInput {
  name: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
}

export interface ScheduleInput {
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
}

export interface UseEventsResult {
  state: LoadState;
  error: string;
  /** Active events only: the spec gives tabs to active events. */
  activeEvents: Event[];
  atEventLimit: boolean;
  addEvent: (input: NewEventInput) => Promise<Event>;
  updateSchedule: (id: string, schedule: ScheduleInput) => Promise<Event>;
  addEventTable: (eventId: string) => Promise<Event>;
  setSeatCount: (
    eventId: string,
    tableId: string,
    seatCount: number,
  ) => Promise<Event>;
  removeEventTable: (eventId: string, tableId: string) => Promise<Event>;
  addBooking: (eventId: string, input: NewBookingInput) => Promise<Event>;
  editAttendee: (
    eventId: string,
    bookingId: string,
    attendeeId: string,
    patch: AttendeePatch,
  ) => Promise<Event>;
  cancelOneAttendee: (
    eventId: string,
    bookingId: string,
    attendeeId: string,
  ) => Promise<Event>;
  cancelWholeBooking: (eventId: string, bookingId: string) => Promise<Event>;
  reload: () => Promise<void>;
}

function describeError(error: unknown): string {
  if (error instanceof TooManyActiveEventsError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Earliest event date first, so the next event to happen leads the tabs. */
function byEventDate(a: Event, b: Event): number {
  return a.eventDate.localeCompare(b.eventDate);
}

async function readActiveEvents(): Promise<Event[]> {
  const events = await listEvents();
  return events.filter((event) => event.status === "active").sort(byEventDate);
}

export function useEvents(): UseEventsResult {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);

  const load = useCallback(async () => {
    if (!isBrowser()) {
      setState("error");
      setError("This browser has no IndexedDB, so nothing can be saved.");
      return;
    }

    try {
      // Sweeping first means a tab left open for days sees the same closures
      // and deletions a fresh load would.
      await runRetentionSweep();
      setActiveEvents(await readActiveEvents());
      setState("ready");
      setError("");
    } catch (caught) {
      setState("error");
      setError(describeError(caught));
    }
  }, []);

  // Strict Mode double-invokes effects in development. The sweep is
  // idempotent, so a second run is harmless, but skipping it avoids two
  // concurrent reads racing to set the same state.
  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void load();
  }, [load]);

  const addEvent = useCallback(async (input: NewEventInput) => {
    const created = await createEvent(input);
    setActiveEvents(await readActiveEvents());
    return created;
  }, []);

  const updateSchedule = useCallback(
    async (id: string, schedule: ScheduleInput) => {
      const updated = await updateEventSchedule(id, schedule);
      setActiveEvents(await readActiveEvents());
      return updated;
    },
    [],
  );

  // Every mutation returns the saved event and refreshes the list from the
  // store, so the screens render what was actually written rather than an
  // optimistic guess that could drift from it.
  const applyChange = useCallback(
    async (change: () => Promise<Event>): Promise<Event> => {
      const updated = await change();
      setActiveEvents(await readActiveEvents());
      return updated;
    },
    [],
  );

  const addEventTable = useCallback(
    (eventId: string) => applyChange(() => addTable(eventId)),
    [applyChange],
  );

  const setSeatCount = useCallback(
    (eventId: string, tableId: string, seatCount: number) =>
      applyChange(() => setTableSeatCount(eventId, tableId, seatCount)),
    [applyChange],
  );

  const removeEventTable = useCallback(
    (eventId: string, tableId: string) =>
      applyChange(() => removeTable(eventId, tableId)),
    [applyChange],
  );

  const addBooking = useCallback(
    (eventId: string, input: NewBookingInput) =>
      applyChange(() => createBooking(eventId, input)),
    [applyChange],
  );

  const editAttendee = useCallback(
    (
      eventId: string,
      bookingId: string,
      attendeeId: string,
      patch: AttendeePatch,
    ) => applyChange(() => updateAttendee(eventId, bookingId, attendeeId, patch)),
    [applyChange],
  );

  const cancelOneAttendee = useCallback(
    (eventId: string, bookingId: string, attendeeId: string) =>
      applyChange(() => cancelAttendee(eventId, bookingId, attendeeId)),
    [applyChange],
  );

  const cancelWholeBooking = useCallback(
    (eventId: string, bookingId: string) =>
      applyChange(() => cancelBooking(eventId, bookingId)),
    [applyChange],
  );

  return {
    state,
    error,
    activeEvents,
    atEventLimit: activeEvents.length >= MAX_ACTIVE_EVENTS,
    addEvent,
    updateSchedule,
    addEventTable,
    setSeatCount,
    removeEventTable,
    addBooking,
    editAttendee,
    cancelOneAttendee,
    cancelWholeBooking,
    reload: load,
  };
}
