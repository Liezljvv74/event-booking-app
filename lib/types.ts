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
}

export interface Event {
  id: string;
  name: string;
  /** Calendar date as "YYYY-MM-DD", interpreted in the viewer's timezone. */
  eventDate: string;
  status: EventStatus;
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

/** Spec limit: at most this many events may be active at once. */
export const MAX_ACTIVE_EVENTS = 4;

/** Spec default seat count for a newly added table. */
export const DEFAULT_SEAT_COUNT = 10;

/** Hours after an event's date that it auto-closes. */
export const AUTO_CLOSE_AFTER_HOURS = 48;
