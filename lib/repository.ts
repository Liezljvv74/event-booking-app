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
  DEFAULT_SETTINGS,
  DEFAULT_TABLE_SHAPE,
  MAX_RETENTION_DAYS,
  MAX_SEAT_COUNT,
  MIN_RETENTION_DAYS,
  SEAT_OCCUPYING_STATUSES,
  type Attendee,
  type AttendeeStatus,
  type Booking,
  type Event,
  type Expense,
  type ExpenseTemplate,
  type Settings,
  type RegularGuest,
  type Table,
  type TableShape,
  type TicketPrice,
} from "./types";
import { isKnownCurrency } from "./currency";
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

/** Tables gained a shape after the store was first written. */
type StoredTable = Omit<Table, "shape"> & Partial<Pick<Table, "shape">>;

/** Attendees gained the regular mark after the store was first written. */
type StoredAttendee = Omit<Attendee, "regularId"> &
  Partial<Pick<Attendee, "regularId">> & { regular?: boolean };

type StoredBooking = Omit<Booking, "attendees"> & {
  attendees: StoredAttendee[];
};

type StoredEvent = Omit<Event, "expenses" | "tables" | "bookings"> & {
  expenses: StoredExpense[];
  tables: StoredTable[];
  bookings: StoredBooking[];
};

/**
 * Fill in the fields a stored record may predate.
 *
 * An undefined `paid` would render as an indeterminate checkbox rather than
 * an unticked one, so every line leaves here fully populated.
 */
function withStoredDefaults(event: StoredEvent): Event {
  return {
    ...event,
    tables: event.tables.map((table) => ({
      ...table,
      shape: table.shape ?? DEFAULT_TABLE_SHAPE,
    })),
    bookings: event.bookings.map((booking) => ({
      ...booking,
      attendees: booking.attendees.map((attendee) => ({
        ...attendee,
        regularId: attendee.regularId ?? null,
        /**
         * A cancelled guest is charged nothing, whatever the record says.
         *
         * Cancelling zeroes the price where it happens, so a guest cancelled
         * in this app arrives here at nought already. A guest cancelled in an
         * older one, or restored out of a backup taken before that rule, does
         * not - and the exports print the price they find rather than asking
         * the status, so a party that had called off was leaving with a
         * charge against its name in guests.csv.
         *
         * Doing it on the way out of the store fixes it for every reader at
         * once, including the ones that are not screens.
         */
        ticketPriceCents:
          attendee.status === "cancelled" ? 0 : attendee.ticketPriceCents,
      })),
    })),
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
 * A table as the New event form supplies it: a seat count and nothing else.
 *
 * Table numbers are not given here. They run 1, 2, 3 down the form in the
 * order the lines were entered, so the form would only be repeating what its
 * own ordering already says, and a line deleted halfway through would leave
 * it to renumber the rest.
 */
export interface TableInput {
  /**
   * The stored table this line stands for, or null for one being added.
   * `createEvent` has nothing to match against and ignores it; editing an
   * event uses it to tell a table whose seats changed from a table that has
   * gone and a new one put in its place.
   */
  id?: string | null;
  seatCount: number;
  /** Long, round or square. Round when the caller does not care. */
  shape?: TableShape;
}

/**
 * The standing regulars, written into a new event.
 *
 * They arrive as one party. Its name is "Regular" until it is renamed, and a
 * rename sticks because the name is kept with the list rather than worked out
 * again from whichever event happened to be last.
 *
 * They are seated at the table each of them always sits at, so long as the new
 * room has it: they are written in before anybody else, into an empty room, so
 * nothing can have taken the chair first. A room laid out without that table
 * leaves them unseated - there is nowhere to put them, and inventing a table
 * nobody asked for would be worse.
 *
 * Nobody arrives having paid, it being a different event, and everybody starts
 * on the cheapest of the new event's prices, which is where any new guest
 * starts.
 */
function carriedRegulars(
  regulars: readonly RegularGuest[],
  partyName: string,
  made: Event,
): Booking | null {
  if (regulars.length === 0) return null;

  const cheapest = made.ticketPrices.reduce<number | null>(
    (lowest, price) =>
      lowest === null || price.amountCents < lowest ? price.amountCents : lowest,
    null,
  );

  // Counted as they are seated, so two regulars who both sit at a table that
  // has since been made smaller do not both claim its last chair.
  const room = new Map(
    made.tables.map((table) => [table.tableNumber, table.seatCount]),
  );

  const attendees: Attendee[] = regulars.map((regular) => {
    const wanted = regular.tableNumber;
    const left = wanted === null ? undefined : room.get(wanted);
    const keepsSeat = wanted !== null && left !== undefined && left > 0;
    if (keepsSeat) room.set(wanted, left - 1);

    return {
      id: newId(),
      regularId: regular.id,
      name: regular.name,
      telephone: regular.telephone === "" ? undefined : regular.telephone,
      assignedTableNumber: keepsSeat ? wanted : null,
      status: "pay_at_venue" as AttendeeStatus,
      ticketPriceCents: cheapest ?? 0,
    };
  });

  return {
    id: newId(),
    partyName,
    // Every booking needs one, and without it this party could not even be
    // renamed: saving a party's details refuses an empty telephone.
    telephone:
      regulars.find((regular) => regular.telephone.trim() !== "")?.telephone ??
      "",
    ticketPriceCents: cheapest ?? 0,
    attendees,
    createdAt: Date.now(),
  };
}

/**
 * Create an event, seeding its expenses from the most recent existing event
 * so the manager starts from the previous event's costs rather than a blank
 * list.
 *
 * The count check and the write share one transaction; splitting them would
 * let two quick clicks both pass a stale count and create a fifth event.
 */
export async function createEvent(input: {
  name: string;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  ticketPrices?: readonly TicketPriceInput[];
  /** The event's tables, set up as it is scheduled. */
  tables?: readonly TableInput[];
  seedExpensesFromEventId?: string;
}): Promise<Event> {
  // Read before the write transaction opens: the regulars live in another
  // store, and awaiting it from inside would let this one auto-commit.
  const { regulars, regularsPartyName } = await getSettings();

  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    // However many are already active: an event may always be scheduled.
    const existing = await getAll<Event>(transaction, STORE_EVENTS);

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

    // Laid out by the same rule that lays out an edited event, so tables
    // are numbered from 1 here and there is one place that numbers them.
    const laid = applyTables(event, input.tables ?? []);

    // After the tables, because where they sit depends on what the room
    // turned out to be.
    const party = carriedRegulars(regulars, regularsPartyName, laid);
    const withRegulars =
      party === null ? laid : { ...laid, bookings: [...laid.bookings, party] };

    await put(transaction, STORE_EVENTS, withRegulars);
    return withRegulars;
  });
}

function mostRecentEvent(events: readonly Event[]): Event | null {
  if (events.length === 0) return null;
  return events.reduce((latest, event) =>
    event.createdAt > latest.createdAt ? event : latest,
  );
}

/** Clock times an event runs between, either of which may be unset. */
export interface EventTimes {
  startTime: string | null;
  endTime: string | null;
  /**
   * The date of the event saved most recently, for the next one to be dated
   * from. Null when there is no event to copy.
   */
  eventDate: string | null;
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
    eventDate: latest?.eventDate ?? null,
  };
}

/**
 * The previous event's expense lines, ready to be the next event's starting
 * point: the spec's rule that a new event opens with last event's costs
 * rather than a blank list, still editable and still removable.
 *
 * Fresh ids, so editing the new event's expenses never touches the source.
 */
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
  /**
   * The event's tables in full, the same way the prices are given: a table
   * left out of the list is a table removed. Unlike the prices these have
   * identity — a guest is seated by table number — so each line says which
   * stored table it is, and a line with no id is a table being added.
   * Omitting the field leaves the stored tables alone.
   */
  tables?: readonly TableInput[];
}

/**
 * Edit an event's own details, and the tables it is laid out with.
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
      // Put back for now; the tables are applied below, against the event as
      // it stands, because working out who has to be unseated needs the
      // seating as it was rather than the list that is replacing it.
      tables: event.tables,
    };
    const name = updated.name.trim();

    if (name === "") throw new Error("Give the event a name.");
    if (updated.eventDate === "") throw new Error("Pick an event date.");

    return patch.tables === undefined
      ? { ...updated, name }
      : applyTables({ ...updated, name }, patch.tables);
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
 * The single place that decides what "occupied" means, so the seating list on
 * the dashboard, the options offered in a guest's table dropdown and the
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

export class SeatsBelowOccupancyError extends Error {
  constructor(tableNumber: number, occupied: number) {
    super(
      `Table ${tableNumber} already seats ${occupied} guest${occupied === 1 ? "" : "s"}. ` +
        `Move them before reducing its seats.`,
    );
    this.name = "SeatsBelowOccupancyError";
  }
}

/**
 * Lay the event out with the tables given: keep the ones still listed, at
 * whatever seat counts they now carry, drop the ones that are not, and number
 * the new ones from one past the highest in use.
 *
 * The whole list arrives at once because that is how the form works — an
 * event's tables are edited on Manage events, in the row that edits its name
 * and its prices, and saved together with them. Which makes this the one
 * place three rules have to hold at the same time:
 *
 * *A table keeps its number.* Numbers are how a guest is seated, so a table
 * that survives the edit is the same table: only its seats can change. It is
 * matched by id rather than by position, so removing the first of four does
 * not renumber the other three underneath the guests sitting at them.
 *
 * *A new number is never a reused one.* Numbering from the highest in use
 * rather than from the count means removing table 2 of three leaves 1 and 3,
 * and the next table added is 4. A gap is better than a second table 2 while
 * anyone is still recorded as sitting at the first.
 *
 * *Nobody is left pointing at a table that has gone.* Attendees seated at a
 * removed table are unseated rather than stranded: a guest holding a number
 * no table has counts against no table and shows up in no tally. Unseated,
 * they return to the pool the dashboard calls out, to be seated again.
 */
function applyTables(event: Event, inputs: readonly TableInput[]): Event {
  const kept = new Set<string>();
  const tables: Table[] = [];
  let highest = event.tables.reduce(
    (max, table) => Math.max(max, table.tableNumber),
    0,
  );

  for (const input of inputs) {
    if (!Number.isInteger(input.seatCount) || input.seatCount < 1) {
      throw new Error("A table needs at least one seat.");
    }

    const existing =
      input.id === undefined || input.id === null
        ? undefined
        : event.tables.find((candidate) => candidate.id === input.id);

    if (existing === undefined) {
      highest += 1;
      tables.push({
        id: newId(),
        tableNumber: highest,
        seatCount: input.seatCount,
        shape: input.shape ?? DEFAULT_TABLE_SHAPE,
      });
      continue;
    }

    // Counted against the event as it stands, since nothing has moved.
    const occupied = occupiedSeats(event, existing.tableNumber);
    if (input.seatCount < occupied) {
      throw new SeatsBelowOccupancyError(existing.tableNumber, occupied);
    }

    kept.add(existing.id);
    tables.push({
      ...existing,
      seatCount: input.seatCount,
      shape: input.shape ?? existing.shape ?? DEFAULT_TABLE_SHAPE,
    });
  }

  const gone = new Set(
    event.tables
      .filter((table) => !kept.has(table.id))
      .map((table) => table.tableNumber),
  );

  return {
    ...event,
    tables: tables.sort((a, b) => a.tableNumber - b.tableNumber),
    bookings:
      gone.size === 0
        ? event.bookings
        : event.bookings.map((booking) => ({
            ...booking,
            attendees: booking.attendees.map((attendee) =>
              attendee.assignedTableNumber !== null &&
              gone.has(attendee.assignedTableNumber)
                ? { ...attendee, assignedTableNumber: null }
                : attendee,
            ),
          })),
  };
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
 * Returns null when no single table can hold them all, in which case
 * `planSplitSeating` looks for a run of neighbouring tables instead.
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

/**
 * Nobody is left sitting on their own. A table taking part of a split party
 * takes at least this many of them, so a party of five never becomes four
 * and a stray.
 */
export const MIN_GUESTS_PER_SHARED_TABLE = 2;

/** One table's share of a party seated across several. */
export interface SeatingShare {
  tableNumber: number;
  guestCount: number;
}

/**
 * Which tables to use for a party too large for any single one, and how many
 * of them sit at each.
 *
 * Three rules, in this order:
 *
 * 1. **The tables are as close together as possible.** Tables are a numbered
 *    list and there is no floor plan, so nearness is the distance between
 *    table numbers: the arrangement spanning tables 4 to 5 beats the one
 *    spanning 2 to 9, even if the second uses fewer tables. Only where two
 *    arrangements span the same distance does the one using fewer tables
 *    win, and then the lower-numbered one.
 * 2. **Nobody sits alone.** Every table used takes at least
 *    `MIN_GUESTS_PER_SHARED_TABLE` of the party, which is what rules out
 *    seating four of a party of five and stranding the fifth. A table with a
 *    single free seat is therefore no use to a split party at all, though it
 *    still counts towards the distance between the tables that are used.
 * 3. **Each table takes as many as it can hold.** Working up the table
 *    numbers, every table is filled to its free seats before the next is
 *    started, short of leaving a later one below the minimum.
 *
 * Returns null when no arrangement seats the *whole* party under those
 * rules. Seating goes all together or not at all: a part-seated party leaves
 * the manager to work out who is missing, which is worse than an unseated
 * one the screen can describe.
 */
export function planSplitSeating(
  event: Event,
  guestCount: number,
): SeatingShare[] | null {
  const byNumber = event.tables
    .map((table) => ({
      tableNumber: table.tableNumber,
      free: freeSeatsAtTable(event, table.tableNumber),
    }))
    .sort((a, b) => a.tableNumber - b.tableNumber);

  // A table that cannot take two is no use here, but the tables it sits
  // between are still as far apart as their numbers say.
  const usable = byNumber.filter(
    (table) => table.free >= MIN_GUESTS_PER_SHARED_TABLE,
  );

  let best: { span: number; tables: number; shares: SeatingShare[] } | null =
    null;

  // Every arrangement has a lowest and a highest table, and those two are
  // what its span is measured across — so trying each pair of ends, and
  // filling in from between them, covers all of them.
  for (let first = 0; first < usable.length; first += 1) {
    for (let last = first + 1; last < usable.length; last += 1) {
      const span = usable[last].tableNumber - usable[first].tableNumber;
      // The span only grows as the far end moves out, so once it is wider
      // than the best already found, so is everything after it.
      if (best !== null && span > best.span) break;

      const chosen = fillBetween(usable, first, last, guestCount);
      if (chosen === null) continue;

      if (
        best === null ||
        span < best.span ||
        (span === best.span && chosen.length < best.tables)
      ) {
        best = {
          span,
          tables: chosen.length,
          shares: shareOut(chosen, guestCount),
        };
      }
    }
  }

  return best?.shares ?? null;
}

/**
 * The tables to use between two chosen ends, or null if the party cannot be
 * seated across them.
 *
 * Both ends are used by definition — they are what the span was measured
 * across. Tables from between them are added roomiest first, so the party is
 * held by as few of them as possible, and only until they hold it. Adding a
 * table also raises the number of guests the arrangement must find, since
 * every table used needs its minimum, which is what stops a party of five
 * being spread over three tables.
 */
function fillBetween(
  usable: readonly { tableNumber: number; free: number }[],
  first: number,
  last: number,
  guestCount: number,
): { tableNumber: number; free: number }[] | null {
  const chosen = [usable[first], usable[last]];
  let capacity = chosen[0].free + chosen[1].free;
  if (chosen.length * MIN_GUESTS_PER_SHARED_TABLE > guestCount) return null;
  if (capacity >= guestCount) return chosen;

  const between = usable
    .slice(first + 1, last)
    .sort((a, b) => b.free - a.free || a.tableNumber - b.tableNumber);

  for (const table of between) {
    if ((chosen.length + 1) * MIN_GUESTS_PER_SHARED_TABLE > guestCount) {
      return null;
    }
    chosen.push(table);
    capacity += table.free;
    if (capacity >= guestCount) return chosen;
  }

  return null;
}

/**
 * Hand the party out across the tables chosen for it, lowest number first,
 * each taking all it can hold short of leaving a later table below the
 * minimum. The caller has already established that the tables hold the party
 * and that there are enough guests to give each of them its minimum.
 */
function shareOut(
  chosen: readonly { tableNumber: number; free: number }[],
  guestCount: number,
): SeatingShare[] {
  const ordered = [...chosen].sort((a, b) => a.tableNumber - b.tableNumber);
  const shares: SeatingShare[] = [];
  let left = guestCount;

  ordered.forEach((table, index) => {
    const laterTables = ordered.length - index - 1;
    const take = Math.min(
      table.free,
      left - laterTables * MIN_GUESTS_PER_SHARED_TABLE,
    );
    shares.push({ tableNumber: table.tableNumber, guestCount: take });
    left -= take;
  });

  return shares;
}

export interface CreatedBooking {
  event: Event;
  bookingId: string;
  /**
   * Where the party landed: one entry when a single table held it, several
   * when it was split across a run of them, and none when it is unseated.
   */
  seating: SeatingShare[];
}

/**
 * Create a booking and the attendee records its guest count implies.
 *
 * The first guest takes the party name: whoever booked is normally attending,
 * so making them type it again is busywork. The rest start unnamed.
 *
 * The whole party is seated together at one table when one can hold them,
 * and across the closest run of tables that can when none can. Each guest
 * inherits the booking's ticket price. Both stay editable per guest
 * afterwards.
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
  let seating: SeatingShare[] = [];

  const event = await mutateEvent(eventId, (current) => {
    // One table if one will hold them, and only then the split, so a party
    // that fits somewhere still lands at the tightest table that fits it.
    const together = pickTableForParty(current, input.guestCount);
    seating =
      together !== null
        ? [{ tableNumber: together, guestCount: input.guestCount }]
        : (planSplitSeating(current, input.guestCount) ?? []);

    // The shares flattened into one seat per guest, so the guests are handed
    // out in order and a party split three ways still reads down the list as
    // table 4, table 4, table 5. Empty when the party could not be seated.
    const seats = seating.flatMap((share) =>
      Array.from({ length: share.guestCount }, () => share.tableNumber),
    );

    const attendees: Attendee[] = Array.from(
      { length: input.guestCount },
      (_unused, index) => ({
        id: newId(),
        // Nobody is a regular until somebody says so.
        regularId: null,
        name: index === 0 ? partyName : "",
        assignedTableNumber: seats[index] ?? null,
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

  return { event, bookingId, seating };
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

  return mutateRegulars((stored, settings) => {
    const event = stored
      .map(withStoredDefaults)
      .find((candidate) => candidate.id === eventId);
    if (!event) throw new Error("That event no longer exists.");

    const booking = event.bookings.find(
      (candidate) => candidate.id === bookingId,
    );
    if (!booking) throw new Error("That booking no longer exists.");

    /**
     * Renaming the party of regulars renames it for good.
     *
     * A party every one of whose live guests is on the standing list is that
     * list's party, so what it is called is a fact about the list rather than
     * about this event, and is kept with it. A booking that merely contains a
     * regular or two is somebody else's party and renames only itself.
     */
    const live = booking.attendees.filter((attendee) =>
      SEAT_OCCUPYING_STATUSES.includes(attendee.status),
    );
    const theirs =
      live.length > 0 &&
      live.every((attendee) => attendee.regularId !== null);

    const updated: Event = {
      ...event,
      bookings: event.bookings.map((candidate) =>
        candidate.id === bookingId
          ? { ...candidate, partyName, telephone }
          : candidate,
      ),
    };

    return {
      events: [updated],
      settings: theirs ? { ...settings, regularsPartyName: partyName } : undefined,
      result: updated,
    };
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
  regular?: boolean;
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
/**
 * Add one guest to a party already booked.
 *
 * They take the party's own ticket price, the same one its guests were
 * created with, and a seat at a table the party is already sitting at when
 * one of those has room. Failing that they arrive unseated rather than being
 * sent to whichever table happens to be emptiest: a guest joining a party is
 * joining the people, and putting them across the room without being asked
 * would be a stranger decision than leaving the table for the manager.
 */
export function addAttendee(
  eventId: string,
  bookingId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const booking = event.bookings.find(
      (candidate) => candidate.id === bookingId,
    );
    if (!booking) throw new Error("That booking no longer exists.");
    if (booking.attendees.length >= MAX_GUESTS_PER_BOOKING) {
      throw new Error(
        `That is more than ${MAX_GUESTS_PER_BOOKING} guests. Split it across bookings.`,
      );
    }

    // Where the party already sits, tightest first, so a guest joining fills
    // the table with least room to spare rather than opening a gap elsewhere.
    const partyTables = [
      ...new Set(
        booking.attendees
          .filter(
            (attendee) =>
              SEAT_OCCUPYING_STATUSES.includes(attendee.status) &&
              attendee.assignedTableNumber !== null,
          )
          .map((attendee) => attendee.assignedTableNumber as number),
      ),
    ]
      .map((tableNumber) => ({
        tableNumber,
        free: freeSeatsAtTable(event, tableNumber),
      }))
      .filter((table) => table.free >= 1)
      .sort((a, b) => a.free - b.free || a.tableNumber - b.tableNumber);

    const added: Attendee = {
      id: newId(),
      regularId: null,
      name: "",
      assignedTableNumber: partyTables[0]?.tableNumber ?? null,
      status: "pay_at_venue",
      ticketPriceCents: booking.ticketPriceCents,
    };

    return {
      ...event,
      bookings: event.bookings.map((candidate) =>
        candidate.id === bookingId
          ? { ...candidate, attendees: [...candidate.attendees, added] }
          : candidate,
      ),
    };
  });
}

export function cancelAttendee(
  eventId: string,
  bookingId: string,
  attendeeId: string,
): Promise<Event> {
  return mutateEvent(eventId, (event) => {
    const cancelled = findAttendee(event, bookingId, attendeeId);
    if (cancelled.status === "cancelled") return event;

    // No replacement is opened. The party shrinks by one, the seat is freed
    // for anyone, and a substitute is added back with the party's own +
    // button when there is one. It used to open a blank line automatically,
    // which kept the party's size and its expected income steady but left a
    // nameless row behind after every cancellation.
    return {
      ...event,
      bookings: event.bookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              attendees: booking.attendees.map((attendee) =>
                attendee.id === attendeeId
                  ? {
                      ...attendee,
                      status: "cancelled" as AttendeeStatus,
                      // Nobody is charged for a seat they gave up.
                      ticketPriceCents: 0,
                    }
                  : attendee,
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
            // No replacements: the booking is off, not reshuffled. Nothing
            // is charged for it either.
            attendees: booking.attendees.map((attendee) => ({
              ...attendee,
              status: "cancelled" as AttendeeStatus,
              ticketPriceCents: 0,
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

/**
 * Change some of the settings, leaving the rest alone, and hand back the
 * whole of them as they now stand.
 *
 * The read and the write share one transaction, so two changes made at once
 * cannot each save over a copy taken before the other.
 *
 * A directory handle is stored as the live object it is, not as a path.
 * IndexedDB can hold one because it is structured-cloneable, and it is the
 * only thing that can be held: a browser will not tell a page where a folder
 * is on the disk, only hand it something that can be written to. That is also
 * why permission has to be asked for again each session — the handle survives
 * and the permission does not.
 */
export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const days = patch.retentionDays;
  if (days !== undefined) {
    if (!Number.isInteger(days)) {
      throw new Error("Enter a whole number of days.");
    }
    if (days < MIN_RETENTION_DAYS) {
      throw new Error("A number of days cannot be negative.");
    }
    if (days > MAX_RETENTION_DAYS) {
      throw new Error(
        `${MAX_RETENTION_DAYS} days is as long as they can be kept.`,
      );
    }
  }

  const seats = patch.defaultSeatCount;
  if (seats !== undefined) {
    if (!Number.isInteger(seats) || seats < 1) {
      throw new Error("A table needs at least one seat.");
    }
    if (seats > MAX_SEAT_COUNT) {
      throw new Error(`${MAX_SEAT_COUNT} seats is as large as a table gets.`);
    }
  }

  if (patch.currency !== undefined && !isKnownCurrency(patch.currency)) {
    throw new Error(`"${patch.currency}" is not a currency this app offers.`);
  }

  return runTransaction(STORE_SETTINGS, "readwrite", async (transaction) => {
    const row = await getOne<SettingsRow>(
      transaction,
      STORE_SETTINGS,
      SETTINGS_KEY,
    );
    // Written field by field rather than spread wholesale, so a key left
    // behind by an older shape of the settings — there has been one already —
    // is dropped by the next save rather than carried forever.
    const merged = { ...DEFAULT_SETTINGS, ...row?.value, ...patch };
    const value: Settings = {
      retentionDays: merged.retentionDays,
      defaultSeatCount: merged.defaultSeatCount,
      currency: merged.currency,
      regulars: merged.regulars,
      regularsPartyName: merged.regularsPartyName,
      exportDirectory: merged.exportDirectory,
    };
    await put(transaction, STORE_SETTINGS, { key: SETTINGS_KEY, value });
    return value;
  });
}

/**
 * Empty the store: every event, and the library of reusable expense lines.
 *
 * Settings are deliberately left alone. The retention period, the seat count,
 * the currency and the export folder are how this browser is set up rather
 * than anything recorded in it — and forgetting the folder would lose the
 * place the backup was just written to, which is the last thing to take away
 * from somebody who has only now emptied the store.
 *
 * One transaction, so it empties or it does not.
 */
export function deleteEverything(): Promise<{
  events: number;
  expenseLines: number;
}> {
  return runTransaction(
    [STORE_EVENTS, STORE_EXPENSE_TEMPLATES],
    "readwrite",
    async (transaction) => {
      const events = await getAll<StoredEvent>(transaction, STORE_EVENTS);
      for (const event of events) {
        await remove(transaction, STORE_EVENTS, event.id);
      }

      const templates = await getAll<ExpenseTemplate>(
        transaction,
        STORE_EXPENSE_TEMPLATES,
      );
      for (const template of templates) {
        await remove(transaction, STORE_EXPENSE_TEMPLATES, template.id);
      }

      return { events: events.length, expenseLines: templates.length };
    },
  );
}

/* ---------------------------------------------------------------- regulars */

/**
 * Everything the regulars need doing to them, in one transaction over both
 * the events and the settings.
 *
 * Both, always, because the tick on a guest's row and the entry on the
 * standing list are two halves of one fact. Written separately they would
 * come apart the first time one of the two writes failed, and a tick pointing
 * at nobody is worse than no tick at all.
 */
async function mutateRegulars<T>(
  change: (
    events: StoredEvent[],
    settings: Settings,
  ) => {
    events?: Event[];
    settings?: Settings;
    result: T;
  },
): Promise<T> {
  return runTransaction(
    [STORE_EVENTS, STORE_SETTINGS],
    "readwrite",
    async (transaction) => {
      const stored = await getAll<StoredEvent>(transaction, STORE_EVENTS);
      const row = await getOne<SettingsRow>(
        transaction,
        STORE_SETTINGS,
        SETTINGS_KEY,
      );
      const settings: Settings = { ...DEFAULT_SETTINGS, ...row?.value };

      const outcome = change(stored, settings);

      for (const event of outcome.events ?? []) {
        await put(transaction, STORE_EVENTS, event);
      }
      if (outcome.settings !== undefined) {
        await put(transaction, STORE_SETTINGS, {
          key: SETTINGS_KEY,
          value: outcome.settings,
        });
      }
      return outcome.result;
    },
  );
}

/**
 * Tick or untick a guest as a regular.
 *
 * Ticking adds them to the standing list, at whatever table they are sitting
 * at now — which is the table they will be given on every event after this.
 * Unticking takes them off it. Either way the guest's own row is updated to
 * match, so the tick and the list cannot disagree.
 */
export function setAttendeeRegular(
  eventId: string,
  bookingId: string,
  attendeeId: string,
  wanted: boolean,
): Promise<Event> {
  return mutateRegulars((stored, settings) => {
    const events = stored.map(withStoredDefaults);
    const event = events.find((candidate) => candidate.id === eventId);
    if (!event) throw new Error("That event no longer exists.");
    const attendee = findAttendee(event, bookingId, attendeeId);

    if (wanted === (attendee.regularId !== null)) {
      return { result: event };
    }

    const entry: RegularGuest | null = wanted
      ? {
          id: newId(),
          name: attendee.name,
          telephone: attendee.telephone ?? "",
          tableNumber: attendee.assignedTableNumber,
        }
      : null;

    const updated = withAttendee(event, bookingId, attendeeId, (current) => ({
      ...current,
      regularId: entry === null ? null : entry.id,
    }));

    const regulars =
      entry === null
        ? settings.regulars.filter(
            (regular) => regular.id !== attendee.regularId,
          )
        : [...settings.regulars, entry];

    return {
      events: [updated],
      settings: { ...settings, regulars },
      result: updated,
    };
  });
}

/**
 * Take somebody off the standing list, from Settings.
 *
 * The entry goes, and so does the tick on every guest anywhere who was that
 * entry. Leaving the ticks behind would show a guest as a regular who is no
 * longer on the list, and the screens would disagree about the one thing this
 * feature is for.
 */
export function removeRegular(regularId: string): Promise<Settings> {
  return mutateRegulars((stored, settings) => {
    const touched: Event[] = [];

    for (const raw of stored) {
      const event = withStoredDefaults(raw);
      if (
        !event.bookings.some((booking) =>
          booking.attendees.some(
            (attendee) => attendee.regularId === regularId,
          ),
        )
      ) {
        continue;
      }

      touched.push({
        ...event,
        bookings: event.bookings.map((booking) => ({
          ...booking,
          attendees: booking.attendees.map((attendee) =>
            attendee.regularId === regularId
              ? { ...attendee, regularId: null }
              : attendee,
          ),
        })),
      });
    }

    const settingsNow: Settings = {
      ...settings,
      regulars: settings.regulars.filter(
        (regular) => regular.id !== regularId,
      ),
    };

    return { events: touched, settings: settingsNow, result: settingsNow };
  });
}

/* --------------------------------------------------------------- importing */

/**
 * What an import does with an event already in the store.
 *
 * `add` leaves it alone and imports what is not there — the safe one, and the
 * default, because running the same file twice then changes nothing. `replace`
 * empties the store first, which is what restoring a backup means: the events
 * are the ones in the file and no others.
 */
export type ImportMode = "add" | "replace";

export interface ImportOutcome {
  added: number;
  /** Already in the store and left as they were. Only `add` skips. */
  skipped: number;
  /** Cleared before the file was written in. Only `replace` removes. */
  removed: number;
  expenseLinesAdded: number;
  /**
   * Imported events already past the retention window, which the sweep will
   * delete when the app next loads. Worth saying out loud: importing an old
   * backup and watching half of it disappear on the next refresh is otherwise
   * a mystery.
   */
  pastRetention: number;
}

/**
 * Write events and reusable expense lines from a backup into the store.
 *
 * The whole import is one transaction, so a file that fails halfway leaves
 * the store as it was rather than half replaced.
 */
export async function importBackup(
  events: readonly Event[],
  expenseTemplates: readonly ExpenseTemplate[],
  mode: ImportMode,
): Promise<ImportOutcome> {
  // Read before the write transaction opens: settings live in another store
  // and awaiting them inside would let this transaction auto-commit.
  const { retentionDays } = await getSettings();
  const now = Date.now();

  return runTransaction(
    [STORE_EVENTS, STORE_EXPENSE_TEMPLATES],
    "readwrite",
    async (transaction) => {
      const outcome: ImportOutcome = {
        added: 0,
        skipped: 0,
        removed: 0,
        expenseLinesAdded: 0,
        pastRetention: 0,
      };

      const existing = await getAll<StoredEvent>(transaction, STORE_EVENTS);
      const present = new Set(existing.map((event) => event.id));

      if (mode === "replace") {
        for (const event of existing) {
          await remove(transaction, STORE_EVENTS, event.id);
          outcome.removed += 1;
        }
        present.clear();
      }

      for (const event of events) {
        if (present.has(event.id)) {
          outcome.skipped += 1;
          continue;
        }

        await put(transaction, STORE_EVENTS, event);
        outcome.added += 1;

        const deadline = purgeAt(event, retentionDays);
        if (deadline !== null && now >= deadline) outcome.pastRetention += 1;
      }

      // The reusable lines are merged rather than replaced even by a restore:
      // they belong to the app rather than to any event, and a line the file
      // does not know about is one this browser learned since.
      const heldTemplates = await getAll<ExpenseTemplate>(
        transaction,
        STORE_EXPENSE_TEMPLATES,
      );
      const heldIds = new Set(heldTemplates.map((template) => template.id));

      for (const template of expenseTemplates) {
        if (heldIds.has(template.id)) continue;
        await put(transaction, STORE_EXPENSE_TEMPLATES, template);
        outcome.expenseLinesAdded += 1;
      }

      return outcome;
    },
  );
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

