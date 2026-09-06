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
import { describeError } from "./errors";
import {
  addExpense,
  addAttendee,
  cancelAttendee,
  cancelBooking,
  clearExpenses,
  createBooking,
  deleteEverything,
  getSettings,
  importBackup,
  createEvent,
  deleteEvent,
  lastSavedTimes,
  listEvents,
  listExpenseTemplates,
  moveAttendees,
  removeExpense,
  runRetentionSweep,
  saveSettings,
  updateAttendee,
  updateBookingDetails,
  updateExpense,
  updateEventDetails,
  type AttendeePatch,
  type CreatedBooking,
  type EventDetailsPatch,
  type EventTimes,
  type ExpenseInput,
  type ExpensePatch,
  type ImportMode,
  type ImportOutcome,
  type MoveTarget,
  type TableInput,
  type TicketPriceInput,
} from "./repository";
import {
  DEFAULT_SETTINGS,
  type Event,
  type ExpenseTemplate,
  type Settings,
} from "./types";

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
  /** What the event is sold at. Empty when prices are not settled yet. */
  ticketPrices: readonly TicketPriceInput[];
  /**
   * The tables the event is laid out with, numbered in the order given. They
   * are changed afterwards through `editEventDetails`, which takes the same
   * list; both sit on Manage events and nowhere else.
   */
  tables: readonly TableInput[];
}

export interface UseEventsResult {
  state: LoadState;
  error: string;
  /** Active events only: the spec gives tabs to active events. */
  activeEvents: Event[];
  /**
   * Every stored event, closed ones included. The tabs show only the active
   * ones, so this is what the management screen reads to reach the rest.
   */
  allEvents: Event[];
  /**
   * Cleared expense lines, newest use first. Kept here rather than in the
   * screen because clearing a line is what creates one, and that happens
   * through this hook.
   */
  expenseTemplates: ExpenseTemplate[];
  /**
   * Times carried over from the event saved most recently, for the New event
   * form to start from. Both null when there is no event to copy.
   */
  lastTimes: EventTimes;
  /**
   * The app's own settings, as opposed to any event's: how long a closed
   * event is kept, and the folder exports are written to.
   */
  settings: Settings;
  /**
   * Change some of the settings and leave the rest.
   *
   * One call for all of them rather than one per field: they are one stored
   * record, they are all written the same way, and the export folder — a live
   * directory handle rather than a value — is no exception. Pass null for it
   * to forget the folder.
   */
  saveSetting: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Empty the store: every event and the reusable expense lines. Settings
   * stay. There is no undo, so the screen asking for this says what goes.
   */
  deleteAllData: () => Promise<{ events: number; expenseLines: number }>;
  /**
   * Write a backup's events into the store and reload everything from it, so
   * the tabs and the screens show what arrived.
   */
  importData: (
    events: readonly Event[],
    expenseTemplates: readonly ExpenseTemplate[],
    mode: ImportMode,
  ) => Promise<ImportOutcome>;
  addEvent: (input: NewEventInput) => Promise<Event>;
  /** Edit an event's name, date, times, ticket prices or tables. */
  editEventDetails: (id: string, patch: EventDetailsPatch) => Promise<Event>;
  /** Delete an event and everything recorded against it. Cannot be undone. */
  removeEvent: (id: string) => Promise<void>;
  addBooking: (
    eventId: string,
    input: NewBookingInput,
  ) => Promise<CreatedBooking>;
  editBookingDetails: (
    eventId: string,
    bookingId: string,
    details: { partyName: string; telephone: string },
  ) => Promise<Event>;
  editAttendee: (
    eventId: string,
    bookingId: string,
    attendeeId: string,
    patch: AttendeePatch,
  ) => Promise<Event>;
  /** Move named guests to a table, or off their tables with null. */
  moveGuests: (
    eventId: string,
    targets: readonly MoveTarget[],
    tableNumber: number | null,
  ) => Promise<Event>;
  cancelOneAttendee: (
    eventId: string,
    bookingId: string,
    attendeeId: string,
  ) => Promise<Event>;
  /** One more guest on a party already booked, at the party's own price. */
  addGuest: (eventId: string, bookingId: string) => Promise<Event>;
  addExpenseLine: (eventId: string, input: ExpenseInput) => Promise<Event>;
  editExpense: (
    eventId: string,
    expenseId: string,
    patch: ExpensePatch,
  ) => Promise<Event>;
  /** Clear one line. It stays in the reusable library for a later event. */
  clearExpenseLine: (eventId: string, expenseId: string) => Promise<Event>;
  /** Clear every line at once, each one remembered the same way. */
  clearAllExpenses: (eventId: string) => Promise<Event>;
  cancelWholeBooking: (eventId: string, bookingId: string) => Promise<Event>;
  reload: () => Promise<void>;
}

/** Earliest event date first, so the next event to happen leads the tabs. */
function byEventDate(a: Event, b: Event): number {
  return a.eventDate.localeCompare(b.eventDate);
}

/** Every event, and the active subset the tabs show, from one read. */
async function readEvents(): Promise<{ all: Event[]; active: Event[] }> {
  const all = await listEvents();
  return {
    all,
    active: all.filter((event) => event.status === "active").sort(byEventDate),
  };
}

export function useEvents(): UseEventsResult {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [expenseTemplates, setExpenseTemplates] = useState<ExpenseTemplate[]>(
    [],
  );
  const [lastTimes, setLastTimes] = useState<EventTimes>({
    startTime: null,
    endTime: null,
    eventDate: null,
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refreshEvents = useCallback(async () => {
    const { all, active } = await readEvents();
    setAllEvents(all);
    setActiveEvents(active);
  }, []);

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
      await refreshEvents();
      setExpenseTemplates(await listExpenseTemplates());
      setLastTimes(await lastSavedTimes());
      setSettings(await getSettings());
      setState("ready");
      setError("");
    } catch (caught) {
      setState("error");
      setError(describeError(caught));
    }
  }, [refreshEvents]);

  // Strict Mode double-invokes effects in development. The sweep is
  // idempotent, so a second run is harmless, but skipping it avoids two
  // concurrent reads racing to set the same state.
  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void load();
  }, [load]);

  const saveSetting = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch));
  }, []);

  const addEvent = useCallback(async (input: NewEventInput) => {
    const created = await createEvent(input);
    await refreshEvents();
    setLastTimes(await lastSavedTimes());
    return created;
  }, [refreshEvents]);

  const editEventDetails = useCallback(
    async (id: string, patch: EventDetailsPatch) => {
      const updated = await updateEventDetails(id, patch);
      await refreshEvents();
      // The times of the most recent event are what a new event starts from,
      // so an edit here changes that default.
      setLastTimes(await lastSavedTimes());
      return updated;
    },
    [refreshEvents],
  );

  const removeEvent = useCallback(
    async (id: string) => {
      await deleteEvent(id);
      await refreshEvents();
      setLastTimes(await lastSavedTimes());
    },
    [refreshEvents],
  );

  // Every mutation returns the saved event and refreshes the list from the
  // store, so the screens render what was actually written rather than an
  // optimistic guess that could drift from it.
  const applyChange = useCallback(
    async (change: () => Promise<Event>): Promise<Event> => {
      const updated = await change();
      await refreshEvents();
      return updated;
    },
    [refreshEvents],
  );

  // Returns more than the event: the caller needs the new booking's id to
  // open it, and which table the party landed at to say so.
  const addBooking = useCallback(
    async (eventId: string, input: NewBookingInput) => {
      const created = await createBooking(eventId, input);
      await refreshEvents();
      return created;
    },
    [refreshEvents],
  );

  const editBookingDetails = useCallback(
    (
      eventId: string,
      bookingId: string,
      details: { partyName: string; telephone: string },
    ) => applyChange(() => updateBookingDetails(eventId, bookingId, details)),
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

  const moveGuests = useCallback(
    (
      eventId: string,
      targets: readonly MoveTarget[],
      tableNumber: number | null,
    ) => applyChange(() => moveAttendees(eventId, targets, tableNumber)),
    [applyChange],
  );

  const cancelOneAttendee = useCallback(
    (eventId: string, bookingId: string, attendeeId: string) =>
      applyChange(() => cancelAttendee(eventId, bookingId, attendeeId)),
    [applyChange],
  );

  const addGuest = useCallback(
    (eventId: string, bookingId: string) =>
      applyChange(() => addAttendee(eventId, bookingId)),
    [applyChange],
  );

  const addExpenseLine = useCallback(
    (eventId: string, input: ExpenseInput) =>
      applyChange(() => addExpense(eventId, input)),
    [applyChange],
  );

  const editExpense = useCallback(
    (eventId: string, expenseId: string, patch: ExpensePatch) =>
      applyChange(() => updateExpense(eventId, expenseId, patch)),
    [applyChange],
  );

  // Clearing a line puts it in the library, so these refresh the library as
  // well as the event.
  const applyLibraryChange = useCallback(
    async (change: () => Promise<Event>): Promise<Event> => {
      const updated = await applyChange(change);
      setExpenseTemplates(await listExpenseTemplates());
      return updated;
    },
    [applyChange],
  );

  const clearExpenseLine = useCallback(
    (eventId: string, expenseId: string) =>
      applyLibraryChange(() => removeExpense(eventId, expenseId)),
    [applyLibraryChange],
  );

  const clearAllExpenses = useCallback(
    (eventId: string) => applyLibraryChange(() => clearExpenses(eventId)),
    [applyLibraryChange],
  );

  const cancelWholeBooking = useCallback(
    (eventId: string, bookingId: string) =>
      applyChange(() => cancelBooking(eventId, bookingId)),
    [applyChange],
  );

  // An import can bring in anything, so everything is re-read afterwards
  // rather than the events alone: the reusable expense lines come in with it.
  const importData = useCallback(
    async (
      events: readonly Event[],
      templates: readonly ExpenseTemplate[],
      mode: ImportMode,
    ) => {
      const outcome = await importBackup(events, templates, mode);
      await refreshEvents();
      setExpenseTemplates(await listExpenseTemplates());
      setLastTimes(await lastSavedTimes());
      return outcome;
    },
    [refreshEvents],
  );

  // Everything is re-read afterwards: the tabs, the rail and every screen
  // are looking at a store that is now empty.
  const deleteAllData = useCallback(async () => {
    const gone = await deleteEverything();
    await refreshEvents();
    setExpenseTemplates(await listExpenseTemplates());
    setLastTimes(await lastSavedTimes());
    return gone;
  }, [refreshEvents]);

  return {
    state,
    error,
    activeEvents,
    allEvents,
    expenseTemplates,
    lastTimes,
    settings,
    saveSetting,
    deleteAllData,
    importData,
    addEvent,
    editEventDetails,
    removeEvent,
    addBooking,
    editBookingDetails,
    editAttendee,
    moveGuests,
    cancelOneAttendee,
    addGuest,
    cancelWholeBooking,
    addExpenseLine,
    editExpense,
    clearExpenseLine,
    clearAllExpenses,
    reload: load,
  };
}
