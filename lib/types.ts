/**
 * Domain types for the Event Booking & Table Manager.
 *
 * Money is stored in integer cents, never floats. Summing floats for the
 * dashboard totals produces artefacts like 1249.9999999999998; integers
 * cannot drift. Use the helpers in ./money to convert at the UI boundary.
 */

/** Payment state of a single attendee. */
export type AttendeeStatus =
  | "paid"
  | "pay_at_venue"
  | "not_paying"
  | "cancelled";

/** Statuses that still occupy a seat. A cancelled attendee frees theirs. */
export const SEAT_OCCUPYING_STATUSES: readonly AttendeeStatus[] = [
  "paid",
  "pay_at_venue",
  "not_paying",
];

/**
 * What a guest still owes at the door, and what one has already handed over.
 *
 * Both are decided by the status and not by the price on the record, which is
 * the whole point of them. Cancelling zeroes the price where it is written,
 * and every screen filtered on the status besides - two habits that had to
 * agree, in two files, with nothing keeping them honest. A third way of
 * cancelling, or a record that arrived by some other road, and a party that
 * is not coming would have been owing money.
 *
 * A cancelled guest owes nothing and has paid nothing. So does a guest on the
 * house: `not_paying` is exactly the status of somebody who is coming and
 * settles nothing either way.
 */
export function amountDueCents(attendee: Attendee): number {
  return attendee.status === "pay_at_venue" ? attendee.ticketPriceCents : 0;
}

export function amountPaidCents(attendee: Attendee): number {
  return attendee.status === "paid" ? attendee.ticketPriceCents : 0;
}

/** An event is active until 48 hours after its date, then closed. */
export type EventStatus = "active" | "closed";

/**
 * The shape of a table, which is what the venue has to put out.
 *
 * Descriptive only. The spec keeps a floor plan out of scope and tables a
 * numbered list, so nothing seats anybody differently for being round — it is
 * on the table so the setup sheet can say what to carry in.
 */
export type TableShape = "long" | "round" | "square";

/**
 * What a table is when nobody has said, on request: long.
 *
 * Two things read this, and they are the same question asked at two moments.
 * A new event's plan opens on it, because the venue this was built for lays
 * out long tables and typing the same answer into every event is what a
 * default is for. And a table stored before shapes existed is read back as it,
 * because the app never asked and something has to be said — the same guess,
 * made about the same room.
 */
export const DEFAULT_TABLE_SHAPE: TableShape = "long";

/**
 * How many times a new event may be repeated in one go.
 *
 * A year of weeks. Not a rule about how often a venue may hold a function,
 * only a limit on how many a single press may create — fifty-two rows
 * appearing at once is already more than anybody meant to type by accident.
 */
export const MAX_REPEATS = 52;

/** The most tables one event can be laid out with. A guard against a typo. */
export const MAX_TABLES = 200;

export interface Table {
  id: string;
  /** Displayed number, not an index. Unique within its event. */
  tableNumber: number;
  seatCount: number;
  /**
   * Long, round or square. Tables created before shapes existed are read back
   * as round, which is a guess — the app never asked, so there is nothing
   * better to say and nothing that depends on the answer.
   */
  shape: TableShape;
}

/**
 * One price an event is sold at, and what that price buys.
 *
 * An event can be sold at several prices at once — dinner and dance against
 * dance only, say — so this is a list rather than a single figure on the
 * event. What each price includes is the manager's own wording; it is there
 * to be read off when someone asks what they are paying for, so nothing
 * derives from it and it may be left blank.
 */
export interface TicketPrice {
  id: string;
  amountCents: number;
  /** Free text, blank when the price needs no explaining. */
  includes: string;
}

export interface Attendee {
  id: string;
  name: string;
  /** Table.tableNumber, or null when not yet seated. */
  assignedTableNumber: number | null;
  status: AttendeeStatus;
  /** Optional per attendee; the booking's telephone is the required one. */
  telephone?: string;
  ticketPriceCents: number;
  /**
   * Somebody who comes to everything: a regular.
   *
   * The tick on a guest's row. What it actually does is put them on the
   * standing list of regulars, which is what new events are built from; this
   * says which entry, so unticking here removes the right one and removing
   * them on Settings can untick them here.
   *
   * Null for everybody else. Guests stored before regulars existed read back
   * as null too.
   */
  regularId: string | null;
}

/** What a party of carried-over regulars is called until it is renamed. */
export const REGULARS_PARTY = "Regular";

/**
 * Somebody on the standing list of regulars.
 *
 * The list is the app's, not any event's, and that is the point of it. The
 * mark used to live only on a guest's row, so "who are the regulars" could
 * only be answered by looking at whichever event was written most recently —
 * which made the answer depend on the order events happened to be created in,
 * and would have lost the lot the day that event was deleted or swept away by
 * the retention period. A list of its own is answerable at any time, survives
 * every event being deleted, and can be read and pruned on one screen.
 */
export interface RegularGuest {
  id: string;
  name: string;
  /** Their own number, where the party they came from had one for them. */
  telephone: string;
  /** The table they always sit at, or null if they have never had one. */
  tableNumber: number | null;
}

export interface Booking {
  id: string;
  partyName: string;
  /** Mandatory for the booking as a whole. */
  telephone: string;
  /**
   * Default ticket price applied to attendees this booking generates.
   * Not in the written spec, but the spec's attendee rule ("defaults from
   * the booking's price") requires the booking to hold one.
   */
  ticketPriceCents: number;
  attendees: Attendee[];
  createdAt: number;
}

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  /**
   * Who the money goes to, the note against the line, and whether it has
   * been settled. Only the description and the amount are required to save a
   * line, so these three are blank or false on a line jotted down in a hurry
   * — empty strings rather than optional keys, so no screen has to decide
   * what a missing provider looks like.
   */
  provider: string;
  paid: boolean;
  notes: string;
}

export interface Event {
  id: string;
  name: string;
  /** Calendar date as "YYYY-MM-DD", interpreted in the viewer's timezone. */
  eventDate: string;
  /**
   * Start and end clock times as "HH:MM" in 24-hour local time, or null when
   * not set. An end at or before the start means the event runs past
   * midnight, which a late function legitimately does; it is not an error.
   */
  startTime: string | null;
  endTime: string | null;
  status: EventStatus;
  /**
   * What the event is sold at, in the order they were entered. Empty on an
   * event whose prices have not been decided, and on every event created
   * before prices existed.
   *
   * These are what the event charges, not what any guest has been charged:
   * a booking copies an amount out of this list and can then be edited
   * freely, so changing a price here never rewrites a booking already taken.
   */
  ticketPrices: TicketPrice[];
  tables: Table[];
  bookings: Booking[];
  expenses: Expense[];
  createdAt: number;
  /** Set when the event auto-closes; retention counts from here. */
  closedAt: number | null;
}

/**
 * A removed expense line item, kept for reuse in later events. Separate from
 * Expense so deleting an event's line item never destroys the reusable copy.
 */
export interface ExpenseTemplate {
  id: string;
  description: string;
  amountCents: number;
  lastUsedAt: number;
}

/** Spec default seat count for a newly added table. */
export const DEFAULT_SEAT_COUNT = 10;

/** As many seats as one table may be given. A guard against a stray key. */
export const MAX_SEAT_COUNT = 100;

export interface Settings {
  /** Days a closed event is kept before auto-deletion. Spec default: 14. */
  retentionDays: number;
  /**
   * Seats a table starts with when one is added. The spec's default is 10; a
   * room laid out in eights or twelves should not have to be retyped table by
   * table, event by event.
   */
  defaultSeatCount: number;
  /**
   * Everybody who comes to everything, in the order they were added.
   *
   * Kept with the settings rather than with any event, because that is what
   * they are: a standing fact about the venue rather than a fact about one
   * night. Emptying this is what stops somebody being written into new
   * events, and it is the only thing that does.
   */
  regulars: RegularGuest[];
  /**
   * What their party is called on each new event. "Regular" until renamed on
   * a party's own row, which then renames it for every event after — the name
   * is kept here rather than read back off whichever event was last.
   */
  regularsPartyName: string;
  /**
   * The currency amounts are shown in, as an ISO 4217 code — "ZAR", "GBP" —
   * or empty for none, which is what the app did before this existed and
   * remains the default. The spec names no currency, so neither does the app
   * until it is told one.
   *
   * A code rather than a symbol: it says which currency the money is in and
   * lets the browser write it the way that currency and the reader's locale
   * are written, rather than pinning one character in front of a number.
   *
   * On screen only. Exports keep writing bare numbers: a symbol in a CSV cell
   * makes it text, and a spreadsheet cannot add up text.
   */
  currency: string;
  /**
   * Remembered export folder, persisted as a live handle. Desktop Chromium
   * only; null everywhere else, where exports fall back to a download.
   */
  exportDirectory: FileSystemDirectoryHandle | null;
}

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 14,
  defaultSeatCount: DEFAULT_SEAT_COUNT,
  currency: "",
  regulars: [],
  regularsPartyName: REGULARS_PARTY,
  exportDirectory: null,
};

/** Hours after an event's date that it auto-closes. */
export const AUTO_CLOSE_AFTER_HOURS = 48;

/**
 * The shortest retention period Settings will accept.
 *
 * Zero, which means a closed event is deleted by the same sweep that closes
 * it and never appears in the Closed list at all.
 *
 * The spec said the two weeks were "changeable to a longer period", and this
 * was 14 for that reason. It was asked to go down as well as up, and the spec
 * is amended to match: how long to keep a finished event is the manager's
 * business, and a floor the app will not go below is the app deciding it
 * knows better. The screen still says what a shorter period would destroy
 * before it saves one.
 */
export const MIN_RETENTION_DAYS = 0;

/** Ten years. Not a rule, just a guard against a typo becoming forever. */
export const MAX_RETENTION_DAYS = 3650;
