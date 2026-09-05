/**
 * Turning the store into a file, and a file back into the store.
 *
 * Two formats, each doing the job it is good at.
 *
 * **JSON** is the backup. It is the events exactly as they are held —
 * nesting, ids and all — so it can be read back in and be the same data it
 * was. This is the only format import accepts.
 *
 * **CSV** is a report. A spreadsheet is a grid and an event is not: an event
 * holds tables, and bookings, and guests inside those bookings, and expense
 * lines. Flattening all of that into one grid loses the shape, so the CSV
 * export is three grids that each answer a question — who is coming, how the
 * room is laid out, what it costs — with the event's name and date repeated
 * down each one so a row stands on its own. Nothing reads them back; the JSON
 * beside them is what a restore is for.
 *
 * Nothing here touches the browser. Building the text and reading it back are
 * decisions about the data, and keeping them out of the file-writing code
 * means they can be reasoned about — and one day tested — without a DOM.
 */

import { formatCents } from "./money";
import type { Event, ExpenseTemplate } from "./types";

/** Stamped into every backup, so a file that is not one can be refused. */
export const BACKUP_FORMAT = "event-diary-backup";

/**
 * The shape of the file, not the shape of the app. It is 1 and will stay 1
 * until the stored data changes in a way a reader has to know about; an older
 * file will then still say which shape it is.
 */
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** When the file was written, for the reader to show. */
  exportedAt: number;
  events: Event[];
  /**
   * The reusable expense lines. They belong to the app rather than to any one
   * event, and a restore without them would lose work that was never on an
   * event to begin with.
   */
  expenseTemplates: ExpenseTemplate[];
}

/**
 * Settings are deliberately absent. The retention period is a preference of
 * this browser rather than a fact about the events, and the export folder is
 * a live handle to a directory on one machine — neither survives a trip
 * through JSON as anything meaningful, and restoring a backup should not
 * quietly repoint where the next one is written.
 */
export function buildBackup(
  events: readonly Event[],
  expenseTemplates: readonly ExpenseTemplate[],
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    events: [...events],
    expenseTemplates: [...expenseTemplates],
  };
}

/** Pretty-printed: a backup is a file a person may want to look inside. */
export function backupToText(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/* ------------------------------------------------------------- reading in */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Enough of an event to be worth importing.
 *
 * Not a full validation: the store is this app's own and a file it wrote is
 * the case that matters. What this catches is the file that is not a backup
 * at all, or one damaged badly enough that letting it in would put a record
 * in the store that every screen then has to survive.
 */
function looksLikeEvent(value: unknown): value is Event {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id !== "" &&
    typeof value.name === "string" &&
    typeof value.eventDate === "string" &&
    (value.status === "active" || value.status === "closed") &&
    Array.isArray(value.tables) &&
    Array.isArray(value.bookings) &&
    Array.isArray(value.expenses)
  );
}

function looksLikeTemplate(value: unknown): value is ExpenseTemplate {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.description === "string" &&
    typeof value.amountCents === "number"
  );
}

/**
 * Read a file's text as a backup, or say why it is not one.
 *
 * Every refusal names what was wrong in words the person holding the file can
 * act on, because the only thing they can do about it is pick a different
 * file.
 */
export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      error:
        "That file is not JSON. Pick the .json file an export wrote, not a CSV.",
    };
  }

  if (!isObject(parsed)) {
    return { error: "That file holds no data this app can read." };
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return {
      error:
        "That JSON file was not written by this app, so there is nothing in it to import.",
    };
  }

  if (typeof parsed.version !== "number" || parsed.version > BACKUP_VERSION) {
    return {
      error: `That backup was written by a newer version of the app (file version ${String(parsed.version)}). Update the app and try again.`,
    };
  }

  if (!Array.isArray(parsed.events)) {
    return { error: "That backup has no list of events in it." };
  }

  const events = parsed.events.filter(looksLikeEvent);
  if (events.length !== parsed.events.length) {
    return {
      error: `${parsed.events.length - events.length} of the ${parsed.events.length} events in that file are damaged, so none of it has been imported.`,
    };
  }

  const templates = Array.isArray(parsed.expenseTemplates)
    ? parsed.expenseTemplates.filter(looksLikeTemplate)
    : [];

  return {
    backup: {
      format: BACKUP_FORMAT,
      version: parsed.version,
      exportedAt:
        typeof parsed.exportedAt === "number" ? parsed.exportedAt : 0,
      events,
      expenseTemplates: templates,
    },
  };
}

/* ------------------------------------------------------------------- CSV */

/**
 * One cell, quoted when it has to be.
 *
 * Quoting only where needed keeps the file readable, and a doubled quote is
 * how a quote is written inside one. A leading `=`, `+`, `-` or `@` is
 * prefixed with a quote of its own: a spreadsheet reads those as the start of
 * a formula, and a party named "=Smith" should arrive as text rather than as
 * something Excel tries to calculate.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const risky = /^[=+\-@]/.test(text) ? `'${text}` : text;

  return /[",\n\r]/.test(risky) ? `"${risky.replace(/"/g, '""')}"` : risky;
}

function rows(header: readonly string[], body: readonly string[][]): string {
  // CRLF, which is what a spreadsheet expects of a CSV on Windows.
  return [header, ...body].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** One row per guest, cancelled ones included: who is coming, and on what terms. */
export function guestsCsv(events: readonly Event[]): string {
  const body: string[][] = [];

  for (const event of events) {
    for (const booking of event.bookings) {
      for (const attendee of booking.attendees) {
        body.push([
          event.name,
          event.eventDate,
          booking.partyName,
          booking.telephone,
          attendee.name,
          attendee.telephone ?? "",
          attendee.assignedTableNumber === null
            ? ""
            : String(attendee.assignedTableNumber),
          attendee.status,
          formatCents(attendee.ticketPriceCents),
        ]);
      }
    }
  }

  return rows(
    [
      "event",
      "date",
      "party",
      "party_phone",
      "guest",
      "guest_phone",
      "table",
      "status",
      "price",
    ],
    body,
  );
}

/** One row per table: how the room is laid out. */
export function tablesCsv(events: readonly Event[]): string {
  const body = events.flatMap((event) =>
    event.tables.map((table) => [
      event.name,
      event.eventDate,
      String(table.tableNumber),
      String(table.seatCount),
    ]),
  );

  return rows(["event", "date", "table", "seats"], body);
}

/** One row per expense line: what the event costs. */
export function expensesCsv(events: readonly Event[]): string {
  const body = events.flatMap((event) =>
    event.expenses.map((expense) => [
      event.name,
      event.eventDate,
      expense.description,
      expense.provider,
      formatCents(expense.amountCents),
      expense.paid ? "yes" : "no",
      expense.notes,
    ]),
  );

  return rows(
    ["event", "date", "description", "provider", "amount", "paid", "notes"],
    body,
  );
}

/* ------------------------------------------------------------- file names */

/** "2026-09-05", for stamping into a file name. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** One file to write, named and filled. */
export interface OutputFile {
  name: string;
  text: string;
  type: string;
}

/**
 * The files an export writes: one for JSON, three for CSV.
 *
 * Dated rather than numbered, so yesterday's export is still there under its
 * own name and this one does not quietly overwrite it. Two exports on the
 * same day do overwrite each other, which is the behaviour a daily backup
 * wants.
 */
export function exportFiles(
  format: "json" | "csv",
  events: readonly Event[],
  expenseTemplates: readonly ExpenseTemplate[],
): OutputFile[] {
  const stamp = today();

  if (format === "json") {
    return [
      {
        name: `event-diary-${stamp}.json`,
        text: backupToText(buildBackup(events, expenseTemplates)),
        type: "application/json",
      },
    ];
  }

  return [
    {
      name: `event-diary-guests-${stamp}.csv`,
      text: guestsCsv(events),
      type: "text/csv",
    },
    {
      name: `event-diary-tables-${stamp}.csv`,
      text: tablesCsv(events),
      type: "text/csv",
    },
    {
      name: `event-diary-expenses-${stamp}.csv`,
      text: expensesCsv(events),
      type: "text/csv",
    },
  ];
}
