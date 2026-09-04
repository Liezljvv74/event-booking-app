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
  type TicketPrice,
} from "./types";
import {
  STORE_EVENTS,
  STORE_EXPENSE_TEMPLATES,
  STORE_SETTINGS,
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

/**
 * What is actually on disk, which need not match the current Event.
 *
 * Expense lines gained a provider, a paid flag and notes after the store was
 * first written, so a record saved before that has none of those keys. Typing
 * the read as Event would be a lie the compiler then helps enforce.
 */
type StoredExpense = Omit<Expense, "provider" | "paid" | "notes"> &
  Partial<Pick<Expense, "provider" | "paid" | "notes">>;

type StoredEvent = Omit<Event, "expenses"> & { expenses: StoredExpense[] };

/**
 * Fill in the fields a stored record may predate.
 *
 * An undefined `paid` would render as an indeterminate checkbox rather than
 * an unticked one, so every line leaves here fully populated.
 */
function withStoredDefaults(event: StoredEvent): Event {
  return {
    ...event,
    expenses: event.expenses.map((expense) => ({
      ...expense,
      provider: expense.provider ?? "",
      paid: expense.paid ?? false,
      notes: expense.notes ?? "",
    })),
  };
}

export async function listEvents(): Promise<Event[]> {
  const events = await runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getAll<StoredEvent>(transaction, STORE_EVENTS),
  );
  return events
    .map(withStoredDefaults)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}


export async function getEvent(id: string): Promise<Event | null> {
  const event = await runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getOne<StoredEvent>(transaction, STORE_EVENTS, id),
  );
  return event === null ? null : withStoredDefaults(event);
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
 * A ticket price as a screen supplies it: an amount already in cents, and
 * whatever the manager wrote about what it includes. Ids belong to the store,
 * so they are minted here rather than by the form.
 */
export interface TicketPriceInput {
  amountCents: number;
  includes: string;
}

/**
 * Turn supplied prices into stored ones, rejecting what cannot be a price.
 *
 * Ids are new every save. Nothing refers to a ticket price by id — a booking
 * copies the amount rather than pointing at it — so there is no reference to
 * break, and generating them here keeps forms from having to invent ids for
 * rows a person may yet delete.
 */
function normaliseTicketPrices(
  inputs: readonly TicketPriceInput[],
): TicketPrice[] {
  return inputs.map((input) => {
    if (!Number.isFinite(input.amountCents) || input.amountCents < 0) {
      throw new Error("A ticket price cannot be negative.");
    }
    return {
      id: newId(),
      amountCents: Math.round(input.amountCents),
      includes: input.includes.trim(),
    };
  });
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
  ticketPrices?: readonly TicketPriceInput[];
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
      ticketPrices: normaliseTicketPrices(input.ticketPrices ?? []),
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
/** Clock times an event runs between, either of which may be unset. */
export interface EventTimes {
  startTime: string | null;
  endTime: string | null;
}

/**
 * The times to offer when creating an event, taken from the one saved most
 * recently.
 *
 * A venue's functions tend to run to the same hours, so entering 19:00 to
 * 23:30 once should be enough for the run of them. This follows the same
 * "most recently saved" rule that decides whose expenses are copied forward,
 * so both defaults on the New event form come from the same event.
 *
 * Either time is null when that event had it unset, and both are null before
 * there is any event to copy from.
 */
export async function lastSavedTimes(): Promise<EventTimes> {
  const latest = mostRecentEvent(await listEvents());
  return {
    startTime: latest?.startTime ?? null,
    endTime: latest?.endTime ?? null,
  };
}

function copyExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses.map((expense) => ({
    id: newId(),
    description: expense.description,
    amountCents: expense.amountCents,
    provider: expense.provider,
    // Notes and the paid flag belong to the event that was settled, not to
    // the next one: a copied line starts unpaid, with last time's note gone.
    paid: false,
    notes: "",
  }));
}

/**
 * Update an event's date and clock times.
 *
 * Needed for more than fixing typos: events created before times existed
 * hold null for both, and there would otherwise be no way to fill them in.
 */
/** Anything about an event a person can change after creating it. */
export interface EventDetailsPatch {
  name?: string;
  eventDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  /**
   * The event's prices in full, not lines to add: saving replaces the list,
   * so removing a price is expressed by leaving it out. Omitting the field
   * leaves the stored prices alone, for a caller that changes something else
   * about the event.
   */
  ticketPrices?: readonly TicketPriceInput[];
}

/**
 * Edit an event's own details, leaving its tables, bookings and expenses be.
 *
 * Times may be set to null, which is why the patch is applied by spread
 * rather than by checking each field for truthiness: clearing a start time is
 * a real edit, not a missing one.
 */
export function updateEventDetails(
  id: string,
  patch: EventDetailsPatch,
): Promise<Event> {
  return mutateEvent(id, (event) => {
    // Spread first for the fields that carry across as they are, then put
    // the prices back: the patch holds them without ids, which is not what
    // the store keeps.
    const updated: Event = {
      ...event,
      ...patch,
      ticketPrices:
        patch.ticketPrices === undefined
          ? event.ticketPrices
          : normaliseTicketPrices(patch.ticketPrices),
    };
    const name = updated.name.trim();

    if (name === "") throw new Error("Give the event a name.");
    if (updated.eventDate === "") throw new Error("Pick an event date.");

    return { ...updated, name };
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

/**
 * Attendees to leave out of a seat count: one, several, or none.
 *
 * A guest being moved must not be counted against the table they are moving
 * to, and a batch move has to discount all of them at once or the last guest
 * of the batch appears to be competing with the first for a seat.
 */
export type Ignored = string | ReadonlySet<string>;

const NO_ONE: ReadonlySet<string> = new Set();

function asIdSet(ignore?: Ignored): ReadonlySet<string> {
  if (ignore === undefined) return NO_ONE;
  return typeof ignore === "string" ? new Set([ignore]) : ignore;
}

/**
 * Guests holding a seat at this table, optionally ignoring some of them.
 *
 * The single place that decides what "occupied" means, so the seat count on
 * the Tables screen, the options offered in a guest's table dropdown and the
 * check that refuses an over-full table can never disagree.
 */
function countSeatedAt(
  event: Event,
  tableNumber: number,
  ignore?: Ignored,
): number {
  const ignored = asIdSet(ignore);
  return event.bookings
    .flatMap((booking) => booking.attendees)
    .filter(
      (attendee) =>
        !ignored.has(attendee.id) &&
        attendee.assignedTableNumber === tableNumber &&
        SEAT_OCCUPYING_STATUSES.includes(attendee.status),
    ).length;
}

/** How many seats at this table are held by attendees who have not cancelled. */
export function occupiedSeats(event: Event, tableNumber: number): number {
  return countSeatedAt(event, tableNumber);
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
  ignore?: Ignored,
): number {
  const table = event.tables.find(
    (candidate) => candidate.tableNumber === tableNumber,
  );
  if (!table) return 0;

  return table.seatCount - countSeatedAt(event, tableNumber, ignore);
}

/** One party's share of a table. Several parties can sit at the same table. */
export interface SeatedParty {
  bookingId: string;
  partyName: string;
  /** Guests of this party holding a seat here, never zero. */
  guestCount: number;
}

export interface TableOccupancy {
  tableNumber: number;
  seatCount: number;
  taken: number;
  free: number;
  /** Parties seated here, in the order they were booked. */
  parties: SeatedParty[];
  /**
   * Who is sitting here, in booking order. A party can be taken down before
   * its guests are named, so those are counted in `unnamed` rather than
   * padding this list with blanks.
   */
  guestNames: string[];
  unnamed: number;
}

/**
 * Who is sitting at each table, and how much room is left.
 *
 * A table is shared, not owned: a party of four at a ten-seat table leaves
 * six seats that any other party may take. Nothing enforced that either way,
 * but nothing showed it either, so the free seats were invisible until a
 * dropdown refused a table. This is what the screens read to say so.
 *
 * Pass attendee ids to leave them out of the count, which is what a guest's
 * own table dropdown needs: their current table must not look full to them,
 * and what a batch move needs for the table it is moving guests to.
 */
export function tableOccupancy(
  event: Event,
  ignore?: Ignored,
): TableOccupancy[] {
  const ignored = asIdSet(ignore);

  return event.tables.map((table) => {
    const parties: SeatedParty[] = [];
    const guestNames: string[] = [];
    let unnamed = 0;

    for (const booking of event.bookings) {
      const seated = booking.attendees.filter(
        (attendee) =>
          !ignored.has(attendee.id) &&
          attendee.assignedTableNumber === table.tableNumber &&
          SEAT_OCCUPYING_STATUSES.includes(attendee.status),
      );
      if (seated.length === 0) continue;

      parties.push({
        bookingId: booking.id,
        partyName: booking.partyName,
        guestCount: seated.length,
      });

      for (const attendee of seated) {
        const name = attendee.name.trim();
        if (name === "") unnamed += 1;
        else guestNames.push(name);
      }
    }

    const taken = parties.reduce((total, party) => total + party.guestCount, 0);

    return {
      tableNumber: table.tableNumber,
      seatCount: table.seatCount,
      taken,
      // Clamped: an over-full table is a bug elsewhere, but a negative count
      // on screen would read as a feature.
      free: Math.max(0, table.seatCount - taken),
      parties,
      guestNames,
      unnamed,
    };
  });
}

export class TableFullError extends Error {
  constructor(tableNumber: number) {
    super(`Table ${tableNumber} has no free seats.`);
    this.name = "TableFullError";
  }
}

/**
 * Pick a table that seats the whole party together.
 *
 * Tables are shared, not claimed: this counts free seats, so a party of four
 * already at a ten-seat table leaves six seats that the next party of six or
 * fewer will be given. Prefers the tightest table the party still fits in,
 * which both keeps a party of two off a ten-seater while a two-seater sits
 * empty and packs the part-filled tables before opening a fresh one. Ties
 * break on the lower table number so the choice is predictable.
 *
 * Returns null when no single table can hold them all, in which case they
 * stay unseated rather than being split across tables behind the manager's
 * back — the screen then says where the free seats are.
 */
export function pickTableForParty(
  event: Event,
  guestCount: number,
): number | null {
  const candidates = event.tables
    .map((table) => ({
      tableNumber: table.tableNumber,
      free: freeSeatsAtTable(event, table.tableNumber),
    }))
    .filter((candidate) => candidate.free >= guestCount)
    .sort(
      (a, b) => a.free - b.free || a.tableNumber - b.tableNumber,
    );

  return candidates[0]?.tableNumber ?? null;
}

export interface CreatedBooking {
  event: Event;
  bookingId: string;
  /** The table the whole party was seated at, or null if none could hold it. */
  seatedAtTable: number | null;
}

/**
 * Create a booking and the attendee records its guest count implies.
 *
 * The first guest takes the party name: whoever booked is normally attending,
 * so making them type it again is busywork. The rest start unnamed.
 *
 * The whole party is seated together at one table when one can hold them,
 * and each guest inherits the booking's ticket price. Both stay editable per
 * guest afterwards.
 */
export async function createBooking(
  eventId: string,
  input: {
    partyName: string;
    telephone: string;
    guestCount: number;
    ticketPriceCents: number;
  },
): Promise<CreatedBooking> {
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

  let bookingId = "";
  let seatedAtTable: number | null = null;

  const event = await mutateEvent(eventId, (current) => {
    const table = pickTableForParty(current, input.guestCount);
    seatedAtTable = table;

    const attendees: Attendee[] = Array.from(
      { length: input.guestCount },
      (_unused, index) => ({
        id: newId(),
        name: index === 0 ? partyName : "",
        assignedTableNumber: table,
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
    bookingId = booking.id;

    return { ...current, bookings: [...current.bookings, booking] };
  });

  return { event, bookingId, seatedAtTable };
}

/**
 * Edit a party's own details. The guests are edited individually, so this
 * covers only what belongs to the booking itself.
 */
export function updateBookingDetails(
  eventId: string,
  bookingId: string,
  details: { partyName: string; telephone: string },
): Promise<Event> {
  const partyName = details.partyName.trim();
  const telephone = details.telephone.trim();

  if (partyName === "") throw new Error("Give the party a name.");
  if (telephone === "") throw new Error("A booking needs a telephone number.");

  return mutateEvent(eventId, (event) => ({
    ...event,
    bookings: event.bookings.map((booking) =>
      booking.id === bookingId
        ? { ...booking, partyName, telephone }
        : booking,
    ),
  }));
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

export class CancelledGuestError extends Error {
  constructor() {
    super("That guest has cancelled, so their line can no longer be changed.");
    this.name = "CancelledGuestError";
  }
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
    // A cancelled guest is a closed record. Their replacement line is where
    // changes go, so refusing here keeps that the only way in.
    if (current.status === "cancelled") throw new CancelledGuestError();
    // Cancelling goes through cancelAttendee, which also opens the
    // replacement line. Allowing it as a plain status change would cancel a
    // guest and take the party's seat with them.
    if (patch.status === "cancelled") {
      throw new Error("Use Cancel on the guest's row to cancel them.");
    }

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

/** One guest to move, named by their party so they can be found. */
export interface MoveTarget {
  bookingId: string;
  attendeeId: string;
}

export class NotEnoughFreeSeatsError extends Error {
  constructor(tableNumber: number, needed: number, free: number) {
    const room =
      free === 0
        ? "no free seats"
        : `only ${free} free seat${free === 1 ? "" : "s"}`;
    super(
      `Table ${tableNumber} has ${room}, but ${needed} guest` +
        `${needed === 1 ? "" : "s"} would move there.`,
    );
    this.name = "NotEnoughFreeSeatsError";
  }
}

/**
 * Move guests to a table, or off their tables when given null.
 *
 * A guest moves on their own account: any guest of any party can be sent to
 * any table with room, and the rest of their party stays where it is. Passing
 * several guests moves exactly those, not their parties.
 *
 * Applied as one change, so either everyone named moves or nobody does.
 * Moving guests one at a time can half-succeed — three guests sent to a table
 * with two free seats would leave two of them moved and the third behind,
 * splitting the group the move was meant to keep together.
 *
 * A cancelled guest cannot travel: their line is closed, and the table on it
 * is the record of where they would have sat.
 */
export function moveAttendees(
  eventId: string,
  targets: readonly MoveTarget[],
  tableNumber: number | null,
): Promise<Event> {
  if (targets.length === 0) {
    throw new Error("Choose at least one guest to move.");
  }

  return mutateEvent(eventId, (event) => {
    // Resolved before anything is written, so a stale id fails the whole move
    // rather than moving the guests that happened to still exist.
    const moving = targets.map((target) =>
      findAttendee(event, target.bookingId, target.attendeeId),
    );
    if (moving.some((attendee) => attendee.status === "cancelled")) {
      throw new CancelledGuestError();
    }
    const movingIds = new Set(moving.map((attendee) => attendee.id));

    if (tableNumber !== null) {
      const exists = event.tables.some(
        (candidate) => candidate.tableNumber === tableNumber,
      );
      if (!exists) throw new Error(`There is no table ${tableNumber}.`);

      const needed = moving.filter((attendee) =>
        SEAT_OCCUPYING_STATUSES.includes(attendee.status),
      ).length;
      const free = freeSeatsAtTable(event, tableNumber, movingIds);

      if (needed > free) {
        throw new NotEnoughFreeSeatsError(
          tableNumber,
          needed,
          Math.max(0, free),
        );
      }
    }

    return {
      ...event,
      bookings: event.bookings.map((booking) => ({
        ...booking,
        attendees: booking.attendees.map((attendee) =>
          movingIds.has(attendee.id)
            ? { ...attendee, assignedTableNumber: tableNumber }
            : attendee,
        ),
      })),
    };
  });
}

/**
 * Cancel one guest and open a blank line in their place.
 *
 * A cancelled guest is a closed record: their row keeps the table and price
 * they held, for the account of what happened, and nothing about it can be
 * edited afterwards. What the party does not lose is the seat — a guest
 * dropping out of a party of six leaves six seats booked, one of them now
 * going spare — so a fresh line takes the cancelled guest's table and price
 * and waits to be named.
 *
 * The replacement sits where the cancelled guest sat in the list, so the
 * party keeps its shape. Cancelling the whole booking does not do this: the
 * booking is off, and six blank lines are not what is wanted.
 */
export function cancelAttendee(
  eventId: string,
  bookingId: string,
  attendeeId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const cancelled = findAttendee(event, bookingId, attendeeId);
    if (cancelled.status === "cancelled") return event;

    const replacement: Attendee = {
      id: newId(),
      name: "",
      assignedTableNumber: cancelled.assignedTableNumber,
      status: "pay_at_venue",
      ticketPriceCents: cancelled.ticketPriceCents,
    };

    return {
      ...event,
      bookings: event.bookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              attendees: booking.attendees.flatMap((attendee) =>
                attendee.id === attendeeId
                  ? [
                      { ...attendee, status: "cancelled" as AttendeeStatus },
                      replacement,
                    ]
                  : [attendee],
              ),
            }
          : booking,
      ),
    };
  });
}

/** Cancel every guest in a party, freeing all of their seats at once. */
/**
 * Cancel every guest of a party. No replacement lines: the booking is off,
 * unlike a single guest dropping out of one that stands.
 */
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

/* ---------------------------------------------------------------- expenses */

/** A new expense line. Only the description and the amount are required. */
export interface ExpenseInput {
  description: string;
  amountCents: number;
  provider?: string;
  paid?: boolean;
  notes?: string;
}

export interface ExpensePatch {
  description?: string;
  amountCents?: number;
  provider?: string;
  paid?: boolean;
  notes?: string;
}

/**
 * Check the two fields a line cannot be saved without.
 *
 * Provider, notes and the paid flag are all optional, so a line can be taken
 * down mid-phone-call with nothing but a name and a figure, and filled in
 * afterwards.
 */
function checkRequired(description: string, amountCents: number): void {
  if (description === "") throw new Error("Give the expense a description.");
  if (!Number.isInteger(amountCents)) {
    throw new Error("Enter an amount, for example 250.00.");
  }
  if (amountCents < 0) throw new Error("Enter an amount of zero or more.");
}

export function addExpense(
  eventId: string,
  input: ExpenseInput,
): Promise<Event> {
  const description = input.description.trim();
  checkRequired(description, input.amountCents);

  return mutateEvent(eventId, (event) => {
    const expense: Expense = {
      id: newId(),
      description,
      amountCents: input.amountCents,
      provider: input.provider?.trim() ?? "",
      paid: input.paid ?? false,
      notes: input.notes?.trim() ?? "",
    };
    return { ...event, expenses: [...event.expenses, expense] };
  });
}

export function updateExpense(
  eventId: string,
  expenseId: string,
  patch: ExpensePatch,
): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const current = event.expenses.find(
      (candidate) => candidate.id === expenseId,
    );
    if (!current) throw new Error("That expense line no longer exists.");

    const next: Expense = {
      ...current,
      ...patch,
      description: (patch.description ?? current.description).trim(),
      provider: (patch.provider ?? current.provider).trim(),
      notes: (patch.notes ?? current.notes).trim(),
    };
    // Still required once the line exists: an emptied description would
    // leave a row that nothing identifies.
    checkRequired(next.description, next.amountCents);

    return {
      ...event,
      expenses: event.expenses.map((candidate) =>
        candidate.id === expenseId ? next : candidate,
      ),
    };
  });
}

/**
 * Clear one line, keeping it in the reusable library first.
 *
 * The spec asks that a removed line item stay available to pick for a later
 * event, so its description and amount are remembered before it goes. The
 * provider and the notes are not: those belong to this event's dealings,
 * while the library is a list of costs that recur.
 */
export async function removeExpense(
  eventId: string,
  expenseId: string,
): Promise<Event> {
  const event = await getEvent(eventId);
  const expense = event?.expenses.find(
    (candidate) => candidate.id === expenseId,
  );
  if (expense) await rememberExpenseTemplate(expense);

  return mutateEvent(eventId, (current) => ({
    ...current,
    expenses: current.expenses.filter(
      (candidate) => candidate.id !== expenseId,
    ),
  }));
}

/** Clear every line at once, each one remembered the same way. */
export async function clearExpenses(eventId: string): Promise<Event> {
  const event = await getEvent(eventId);
  for (const expense of event?.expenses ?? []) {
    await rememberExpenseTemplate(expense);
  }

  return mutateEvent(eventId, (current) => ({ ...current, expenses: [] }));
}

/* -------------------------------------------------------- expense library */

export async function listExpenseTemplates(): Promise<ExpenseTemplate[]> {
  const templates = await runTransaction(
    STORE_EXPENSE_TEMPLATES,
    "readonly",
    (transaction) =>
      getAll<ExpenseTemplate>(transaction, STORE_EXPENSE_TEMPLATES),
  );
  // Most recently used first. Clearing every line at once stamps them all
  // within the same millisecond, so description breaks the tie rather than
  // leaving the dropdown order down to whatever the store hands back.
  return templates.sort(
    (a, b) =>
      b.lastUsedAt - a.lastUsedAt ||
      a.description.localeCompare(b.description),
  );
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

/**
 * Saved lines not already on this event.
 *
 * A saved line is offered in the Description dropdown of every expense line,
 * and a description already in the list is offered nowhere — including on the
 * line that holds it, where picking it again would change nothing. Two lines
 * both called "Venue hire" would be indistinguishable in the list anyway, and
 * would collapse back into a single library entry the moment either was
 * cleared. Clearing the line that holds a description returns it to the
 * dropdowns.
 */
export function unusedExpenseTemplates(
  templates: readonly ExpenseTemplate[],
  expenses: readonly Expense[],
): ExpenseTemplate[] {
  const taken = new Set(
    expenses.map((expense) => expense.description.trim().toLowerCase()),
  );

  return templates.filter(
    (template) => !taken.has(template.description.trim().toLowerCase()),
  );
}


/* ---------------------------------------------------------------- settings */

export async function getSettings(): Promise<Settings> {
  const row = await runTransaction(STORE_SETTINGS, "readonly", (transaction) =>
    getOne<SettingsRow>(transaction, STORE_SETTINGS, SETTINGS_KEY),
  );
  return { ...DEFAULT_SETTINGS, ...row?.value };
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

