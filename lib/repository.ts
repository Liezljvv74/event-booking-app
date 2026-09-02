/**
 * Domain operations over the IndexedDB stores: reading and writing events,
 * the reusable expense library, settings, and the auto-close/retention sweep.
 *
 * An Event is stored as one record with its tables, bookings and expenses
 * nested inside it, mirroring the spec's data model. With at most four active
 * events, a normalised schema would buy nothing and cost every read a join.
 */

import {
  AUTO_CLOSE_AFTER_HOURS,
  DEFAULT_SEAT_COUNT,
  DEFAULT_SETTINGS,
  MAX_ACTIVE_EVENTS,
  SEAT_OCCUPYING_STATUSES,
  type Attendee,
  type AttendeeStatus,
  type Booking,
  type Event,
  type Expense,
  type ExpenseTemplate,
  type Settings,
  type Table,
} from "./types";
import {
  INDEX_EVENTS_BY_STATUS,
  STORE_EVENTS,
  STORE_EXPENSE_TEMPLATES,
  STORE_SETTINGS,
  countByIndex,
  getAll,
  getOne,
  newId,
  put,
  remove,
  runTransaction,
} from "./db";

const SETTINGS_KEY = "app";

interface SettingsRow {
  key: string;
  value: Settings;
}

/* ------------------------------------------------------------------ events */

export async function listEvents(): Promise<Event[]> {
  const events = await runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getAll<Event>(transaction, STORE_EVENTS),
  );
  return events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

export async function listActiveEvents(): Promise<Event[]> {
  const events = await listEvents();
  return events.filter((event) => event.status === "active");
}

export function getEvent(id: string): Promise<Event | null> {
  return runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getOne<Event>(transaction, STORE_EVENTS, id),
  );
}

/** Persist an event wholesale. Callers mutate a copy, then save it. */
export function saveEvent(event: Event): Promise<void> {
  return runTransaction(STORE_EVENTS, "readwrite", (transaction) =>
    put(transaction, STORE_EVENTS, event),
  );
}

export function deleteEvent(id: string): Promise<void> {
  return runTransaction(STORE_EVENTS, "readwrite", (transaction) =>
    remove(transaction, STORE_EVENTS, id),
  );
}

export class TooManyActiveEventsError extends Error {
  constructor() {
    super(`At most ${MAX_ACTIVE_EVENTS} events may be active at once.`);
    this.name = "TooManyActiveEventsError";
  }
}

/**
 * Create an event, seeding its expenses from the most recent existing event
 * so the manager starts from the previous event's costs rather than a blank
 * list.
 *
 * The count check and the write share one transaction; splitting them would
 * let two quick clicks both pass a stale count and create a fifth event.
 */
export function createEvent(input: {
  name: string;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  seedExpensesFromEventId?: string;
}): Promise<Event> {
  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const existing = await getAll<Event>(transaction, STORE_EVENTS);
    const activeCount = existing.filter(
      (event) => event.status === "active",
    ).length;

    if (activeCount >= MAX_ACTIVE_EVENTS) {
      throw new TooManyActiveEventsError();
    }

    const source =
      input.seedExpensesFromEventId === undefined
        ? mostRecentEvent(existing)
        : (existing.find(
            (event) => event.id === input.seedExpensesFromEventId,
          ) ?? null);

    const event: Event = {
      id: newId(),
      name: input.name,
      eventDate: input.eventDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      status: "active",
      tables: [],
      bookings: [],
      expenses: copyExpenses(source?.expenses ?? []),
      createdAt: Date.now(),
      closedAt: null,
    };

    await put(transaction, STORE_EVENTS, event);
    return event;
  });
}

function mostRecentEvent(events: readonly Event[]): Event | null {
  if (events.length === 0) return null;
  return events.reduce((latest, event) =>
    event.createdAt > latest.createdAt ? event : latest,
  );
}

/** Fresh ids, so editing the new event's expenses never touches the source. */
function copyExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses.map((expense) => ({
    id: newId(),
    description: expense.description,
    amountCents: expense.amountCents,
  }));
}

/**
 * Update an event's date and clock times.
 *
 * Needed for more than fixing typos: events created before times existed
 * hold null for both, and there would otherwise be no way to fill them in.
 */
export async function updateEventSchedule(
  id: string,
  schedule: { eventDate: string; startTime: string | null; endTime: string | null },
): Promise<Event> {
  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const existing = await getOne<Event>(transaction, STORE_EVENTS, id);
    if (existing === null) throw new Error("That event no longer exists.");

    const updated: Event = { ...existing, ...schedule };
    await put(transaction, STORE_EVENTS, updated);
    return updated;
  });
}

/* ------------------------------------------------------------------ tables */

/** Read, change and write one event inside a single transaction. */
async function mutateEvent(
  id: string,
  change: (event: Event) => Event,
): Promise<Event> {
  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const existing = await getOne<Event>(transaction, STORE_EVENTS, id);
    if (existing === null) throw new Error("That event no longer exists.");

    const updated = change(existing);
    await put(transaction, STORE_EVENTS, updated);
    return updated;
  });
}

/** How many seats at this table are held by attendees who have not cancelled. */
export function occupiedSeats(event: Event, tableNumber: number): number {
  return event.bookings
    .flatMap((booking) => booking.attendees)
    .filter(
      (attendee) =>
        attendee.assignedTableNumber === tableNumber &&
        SEAT_OCCUPYING_STATUSES.includes(attendee.status),
    ).length;
}

/**
 * Add a table numbered one past the highest in use.
 *
 * Numbering from the maximum rather than the count means removing table 2 of
 * three leaves 1 and 3, and the next table is 4. A gap is better than reusing
 * number 2 while attendees are still recorded as sitting at it.
 */
export function addTable(eventId: string): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const highest = event.tables.reduce(
      (max, table) => Math.max(max, table.tableNumber),
      0,
    );
    const table: Table = {
      id: newId(),
      tableNumber: highest + 1,
      seatCount: DEFAULT_SEAT_COUNT,
    };
    return { ...event, tables: [...event.tables, table] };
  });
}

export class SeatsBelowOccupancyError extends Error {
  constructor(occupied: number) {
    super(
      `That table already seats ${occupied} guest${occupied === 1 ? "" : "s"}. ` +
        `Move them before reducing the seat count.`,
    );
    this.name = "SeatsBelowOccupancyError";
  }
}

/**
 * Change one table's seat count.
 *
 * Refuses to drop below the guests already seated there, which would leave
 * the event over-seated and the dashboard's available-seat count negative.
 */
export function setTableSeatCount(
  eventId: string,
  tableId: string,
  seatCount: number,
): Promise<Event> {
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    throw new Error("A table needs at least one seat.");
  }

  return mutateEvent(eventId, (event) => {
    const table = event.tables.find((candidate) => candidate.id === tableId);
    if (!table) throw new Error("That table no longer exists.");

    const occupied = occupiedSeats(event, table.tableNumber);
    if (seatCount < occupied) throw new SeatsBelowOccupancyError(occupied);

    return {
      ...event,
      tables: event.tables.map((candidate) =>
        candidate.id === tableId ? { ...candidate, seatCount } : candidate,
      ),
    };
  });
}

/**
 * Remove a table and unassign anyone seated at it.
 *
 * Leaving attendees pointing at a table that no longer exists would strand
 * them: they would count against no table and never appear in the dashboard's
 * per-table list. Unassigning puts them back in the pool to be re-seated.
 */
export function removeTable(
  eventId: string,
  tableId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const table = event.tables.find((candidate) => candidate.id === tableId);
    if (!table) return event;

    return {
      ...event,
      tables: event.tables.filter((candidate) => candidate.id !== tableId),
      bookings: event.bookings.map((booking) => ({
        ...booking,
        attendees: booking.attendees.map((attendee) =>
          attendee.assignedTableNumber === table.tableNumber
            ? { ...attendee, assignedTableNumber: null }
            : attendee,
        ),
      })),
    };
  });
}


/* ---------------------------------------------------------------- bookings */

export const MAX_GUESTS_PER_BOOKING = 500;

/** Seats at a table not held by an attendee, ignoring one attendee if given. */
export function freeSeatsAtTable(
  event: Event,
  tableNumber: number,
  ignoreAttendeeId?: string,
): number {
  const table = event.tables.find(
    (candidate) => candidate.tableNumber === tableNumber,
  );
  if (!table) return 0;

  const taken = event.bookings
    .flatMap((booking) => booking.attendees)
    .filter(
      (attendee) =>
        attendee.id !== ignoreAttendeeId &&
        attendee.assignedTableNumber === tableNumber &&
        SEAT_OCCUPYING_STATUSES.includes(attendee.status),
    ).length;

  return table.seatCount - taken;
}

export class TableFullError extends Error {
  constructor(tableNumber: number) {
    super(`Table ${tableNumber} has no free seats.`);
    this.name = "TableFullError";
  }
}

/**
 * Create a booking and the attendee records its guest count implies.
 *
 * Attendees start unnamed and unseated: the spec generates them from a count,
 * so names and tables are filled in afterwards. Each inherits the booking's
 * ticket price, which stays editable per attendee.
 */
export function createBooking(
  eventId: string,
  input: {
    partyName: string;
    telephone: string;
    guestCount: number;
    ticketPriceCents: number;
  },
): Promise<Event> {
  const partyName = input.partyName.trim();
  const telephone = input.telephone.trim();

  if (partyName === "") throw new Error("Give the party a name.");
  // Mandatory per the spec's data model, unlike the per-attendee number.
  if (telephone === "") throw new Error("A booking needs a telephone number.");
  if (!Number.isInteger(input.guestCount) || input.guestCount < 1) {
    throw new Error("Enter a whole number of guests, at least 1.");
  }
  if (input.guestCount > MAX_GUESTS_PER_BOOKING) {
    // Guards against a mistyped count generating an unusable number of rows.
    throw new Error(
      `That is more than ${MAX_GUESTS_PER_BOOKING} guests. Split it across bookings.`,
    );
  }
  if (!Number.isInteger(input.ticketPriceCents) || input.ticketPriceCents < 0) {
    throw new Error("Enter a ticket price of zero or more.");
  }

  return mutateEvent(eventId, (event) => {
    const attendees: Attendee[] = Array.from(
      { length: input.guestCount },
      () => ({
        id: newId(),
        name: "",
        assignedTableNumber: null,
        status: "pay_at_venue" as AttendeeStatus,
        ticketPriceCents: input.ticketPriceCents,
      }),
    );

    const booking: Booking = {
      id: newId(),
      partyName,
      telephone,
      ticketPriceCents: input.ticketPriceCents,
      attendees,
      createdAt: Date.now(),
    };

    return { ...event, bookings: [...event.bookings, booking] };
  });
}

/** Replace one attendee, leaving the rest of the party untouched. */
function withAttendee(
  event: Event,
  bookingId: string,
  attendeeId: string,
  change: (attendee: Attendee) => Attendee,
): Event {
  return {
    ...event,
    bookings: event.bookings.map((booking) =>
      booking.id === bookingId
        ? {
            ...booking,
            attendees: booking.attendees.map((attendee) =>
              attendee.id === attendeeId ? change(attendee) : attendee,
            ),
          }
        : booking,
    ),
  };
}

function findAttendee(
  event: Event,
  bookingId: string,
  attendeeId: string,
): Attendee {
  const attendee = event.bookings
    .find((booking) => booking.id === bookingId)
    ?.attendees.find((candidate) => candidate.id === attendeeId);
  if (!attendee) throw new Error("That guest no longer exists.");
  return attendee;
}

export interface AttendeePatch {
  name?: string;
  assignedTableNumber?: number | null;
  status?: AttendeeStatus;
  ticketPriceCents?: number;
}

/**
 * Update one attendee.
 *
 * Seating is checked against the table's free seats, counting only guests who
 * have not cancelled, and ignoring this attendee so re-saving an unchanged
 * row cannot fail against itself.
 */
export function updateAttendee(
  eventId: string,
  bookingId: string,
  attendeeId: string,
  patch: AttendeePatch,
): Promise<Event> {
  if (
    patch.ticketPriceCents !== undefined &&
    (!Number.isInteger(patch.ticketPriceCents) || patch.ticketPriceCents < 0)
  ) {
    throw new Error("Enter a ticket price of zero or more.");
  }

  return mutateEvent(eventId, (event) => {
    const current = findAttendee(event, bookingId, attendeeId);
    const next: Attendee = { ...current, ...patch };

    const takesSeat = SEAT_OCCUPYING_STATUSES.includes(next.status);
    const table = next.assignedTableNumber;

    if (table !== null && takesSeat) {
      const exists = event.tables.some(
        (candidate) => candidate.tableNumber === table,
      );
      if (!exists) throw new Error(`There is no table ${table}.`);

      // Only re-check when the seat claim actually changes, so editing a name
      // never fails because the table filled up in the meantime.
      const claimsNewSeat =
        current.assignedTableNumber !== table ||
        !SEAT_OCCUPYING_STATUSES.includes(current.status);

      if (claimsNewSeat && freeSeatsAtTable(event, table, attendeeId) < 1) {
        throw new TableFullError(table);
      }
    }

    return withAttendee(event, bookingId, attendeeId, () => next);
  });
}

/**
 * Cancel one attendee, freeing their seat but leaving their table assignment
 * recorded. Their seat is free because cancelled guests do not occupy one, so
 * restoring the booking puts them back where they were.
 */
export function cancelAttendee(
  eventId: string,
  bookingId: string,
  attendeeId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) =>
    withAttendee(event, bookingId, attendeeId, (attendee) => ({
      ...attendee,
      status: "cancelled",
    })),
  );
}

/** Cancel every guest in a party, freeing all of their seats at once. */
export function cancelBooking(
  eventId: string,
  bookingId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) => ({
    ...event,
    bookings: event.bookings.map((booking) =>
      booking.id === bookingId
        ? {
            ...booking,
            attendees: booking.attendees.map((attendee) => ({
              ...attendee,
              status: "cancelled" as AttendeeStatus,
            })),
          }
        : booking,
    ),
  }));
}

/* -------------------------------------------------------- expense library */

export async function listExpenseTemplates(): Promise<ExpenseTemplate[]> {
  const templates = await runTransaction(
    STORE_EXPENSE_TEMPLATES,
    "readonly",
    (transaction) =>
      getAll<ExpenseTemplate>(transaction, STORE_EXPENSE_TEMPLATES),
  );
  return templates.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Remember a removed line item so it can be picked from a dropdown later.
 * Matching on description keeps the library from filling with duplicates.
 */
export function rememberExpenseTemplate(
  expense: Pick<Expense, "description" | "amountCents">,
): Promise<ExpenseTemplate> {
  return runTransaction(
    STORE_EXPENSE_TEMPLATES,
    "readwrite",
    async (transaction) => {
      const existing = await getAll<ExpenseTemplate>(
        transaction,
        STORE_EXPENSE_TEMPLATES,
      );
      const match = existing.find(
        (template) =>
          template.description.trim().toLowerCase() ===
          expense.description.trim().toLowerCase(),
      );

      const template: ExpenseTemplate = {
        id: match?.id ?? newId(),
        description: expense.description,
        amountCents: expense.amountCents,
        lastUsedAt: Date.now(),
      };

      await put(transaction, STORE_EXPENSE_TEMPLATES, template);
      return template;
    },
  );
}

/** Permanent removal from the library, per the spec's explicit option. */
export function deleteExpenseTemplate(id: string): Promise<void> {
  return runTransaction(STORE_EXPENSE_TEMPLATES, "readwrite", (transaction) =>
    remove(transaction, STORE_EXPENSE_TEMPLATES, id),
  );
}

/* ---------------------------------------------------------------- settings */

export async function getSettings(): Promise<Settings> {
  const row = await runTransaction(STORE_SETTINGS, "readonly", (transaction) =>
    getOne<SettingsRow>(transaction, STORE_SETTINGS, SETTINGS_KEY),
  );
  return { ...DEFAULT_SETTINGS, ...row?.value };
}

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return runTransaction(STORE_SETTINGS, "readwrite", async (transaction) => {
    const row = await getOne<SettingsRow>(
      transaction,
      STORE_SETTINGS,
      SETTINGS_KEY,
    );
    const value: Settings = { ...DEFAULT_SETTINGS, ...row?.value, ...patch };
    await put(transaction, STORE_SETTINGS, { key: SETTINGS_KEY, value });
    return value;
  });
}

/* ------------------------------------------------- auto-close & retention */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * When an event auto-closes: 48 hours after the end of its event day.
 *
 * The date is split by hand rather than passed to `new Date(string)`, which
 * reads "YYYY-MM-DD" as UTC midnight and would shift the deadline by the
 * viewer's offset, closing a day early or late depending on the timezone.
 */
export function autoCloseAt(eventDate: string): number {
  const [year, month, day] = eventDate.split("-").map(Number);
  const endOfEventDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return endOfEventDay.getTime() + AUTO_CLOSE_AFTER_HOURS * HOUR_MS;
}

/** When a closed event's data is deleted, or null while it is still active. */
export function purgeAt(event: Event, retentionDays: number): number | null {
  if (event.closedAt === null) return null;
  return event.closedAt + retentionDays * DAY_MS;
}

export interface SweepResult {
  closedEventIds: string[];
  deletedEventIds: string[];
}

/**
 * Close events whose date has passed and delete closed events past the
 * retention window. Per the spec this deletion is silent, with no prompt.
 *
 * Call on app start and when the tab regains focus: a tab left open for days
 * would otherwise never notice either deadline passing.
 */
export async function runRetentionSweep(
  now: number = Date.now(),
): Promise<SweepResult> {
  // Read settings before opening the write transaction. Awaiting a second
  // transaction from inside this one would let the first auto-commit.
  const settings = await getSettings();

  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const events = await getAll<Event>(transaction, STORE_EVENTS);
    const result: SweepResult = { closedEventIds: [], deletedEventIds: [] };

    for (const event of events) {
      const alreadyClosed = event.status === "closed";
      const shouldClose = !alreadyClosed && now >= autoCloseAt(event.eventDate);

      if (!alreadyClosed && !shouldClose) continue;

      const closed: Event = alreadyClosed
        ? event
        : { ...event, status: "closed", closedAt: now };

      const deadline = purgeAt(closed, settings.retentionDays);
      if (deadline !== null && now >= deadline) {
        await remove(transaction, STORE_EVENTS, closed.id);
        result.deletedEventIds.push(closed.id);
        continue;
      }

      if (shouldClose) {
        await put(transaction, STORE_EVENTS, closed);
        result.closedEventIds.push(closed.id);
      }
    }

    return result;
  });
}

/** Active-event count, for disabling "New Event" at the spec's limit. */
export function countActiveEvents(): Promise<number> {
  return runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    countByIndex(transaction, STORE_EVENTS, INDEX_EVENTS_BY_STATUS, "active"),
  );
}
