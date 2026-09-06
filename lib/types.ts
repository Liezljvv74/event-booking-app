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

/** An event is active until 48 hours after its date, then closed. */
export type EventStatus = "active" | "closed";

export interface Table {
  id: string;
  /** Displayed number, not an index. Unique within its event. */
  tableNumber: number;
  seatCount: number;
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

export interface Settings {
  /** Days a closed event is kept before auto-deletion. Spec default: 14. */
  retentionDays: number;
  /**
   * Remembered export folder, persisted as a live handle. Desktop Chromium
   * only; null everywhere else, where exports fall back to a download.
   */
  exportDirectory: FileSystemDirectoryHandle | null;
}

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 14,
  exportDirectory: null,
};

/** Spec default seat count for a newly added table. */
export const DEFAULT_SEAT_COUNT = 10;

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
