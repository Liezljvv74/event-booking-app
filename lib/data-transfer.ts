/**
 * Turning the store into a file, and a file back into the store.
 *
 * Three things get written, each doing the job it is good at.
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
 * **The door list** is neither. It is one event's guests on one page, in the
 * order the door will call them, with a box to tick as each one arrives and
 * the paid column left open where money is still to come. It is written as
 * SpreadsheetML — Excel's own XML, a single file with no archive around it,
 * which is what lets it be a real workbook without a library to build one —
 * or as plain CSV for anything that is not Excel.
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

/* -------------------------------------------------------------- door list */

/**
 * The list the door works from on the night: every guest expected, the table
 * they are at, whether they have paid, and a box to tick as they walk in.
 *
 * One event per list. The columns carry no event name because there is no room
 * on a clipboard for a column saying the same thing on every line — the event
 * is in the title above them and in the name of the file.
 *
 * Cancelled guests are left out. They are not coming, and a name on a door
 * list is a name the door will stand there looking for.
 */
export interface DoorRow {
  /** The table, or blank for a guest not seated yet. */
  table: string;
  guest: string;
  /** "yes" when already paid, blank when they pay at the venue. */
  paid: string;
}

/**
 * `yes` for money already in, blank for money still to come.
 *
 * The blank is deliberate, and is what the door writes into: a guest paying at
 * the venue has "paid" typed beside their name as they hand it over, which is
 * the whole reason the column is left empty rather than filled with "no".
 *
 * A guest who is not paying at all is neither, and saying nothing about them
 * would put them in the same column as somebody who still owes. "no charge"
 * tells the door not to ask.
 */
function paidCell(status: string): string {
  if (status === "paid") return "yes";
  if (status === "not_paying") return "no charge";
  return "";
}

/**
 * The rows for one event, in the order the door reads them: up the tables, by
 * name within a table, and anyone not yet seated at the end where they can be
 * found rather than scattered among the seated.
 */
export function doorRows(event: Event): DoorRow[] {
  const listed: { sortTable: number; sortName: string; row: DoorRow }[] = [];

  for (const booking of event.bookings) {
    for (const attendee of booking.attendees) {
      if (attendee.status === "cancelled") continue;

      // A guest with no name yet is still a guest the door has to let in, so
      // the party they belong to stands in for the name.
      const named =
        attendee.name.trim() === ""
          ? `${booking.partyName} (not named)`
          : attendee.name;

      listed.push({
        // Unseated last, by giving them a table number no table has, rather
        // than a flag the sort would have to test for separately.
        sortTable: attendee.assignedTableNumber ?? Number.MAX_SAFE_INTEGER,
        sortName: named.toLocaleLowerCase(),
        row: {
          table:
            attendee.assignedTableNumber === null
              ? ""
              : String(attendee.assignedTableNumber),
          guest: named,
          paid: paidCell(attendee.status),
        },
      });
    }
  }

  return listed
    .sort(
      (a, b) =>
        a.sortTable - b.sortTable || a.sortName.localeCompare(b.sortName),
    )
    .map((entry) => entry.row);
}

const DOOR_HEADER = ["arrived", "table", "guest", "paid"] as const;

/** The door list as a plain spreadsheet, for anything that is not Excel. */
export function doorListCsv(event: Event): string {
  return rows(
    DOOR_HEADER,
    // The tick column leads and is empty: it is there to be written in.
    doorRows(event).map((row) => ["", row.table, row.guest, row.paid]),
  );
}

/* --------------------------------------------------------- Excel's own XML */

/** Text safe to sit between two XML tags. */
function xmlText(value: string): string {
  return (
    value
      // Characters XML 1.0 cannot represent at all. A guest name should never
      // hold one, but a workbook Excel refuses to open is worth a cheap guard.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );
}

/** One cell. An empty one is written as an empty cell, not as empty text. */
function sheetCell(value: string, style: string): string {
  return value === ""
    ? `<Cell ss:StyleID="${style}"/>`
    : `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlText(value)}</Data></Cell>`;
}

/**
 * The door list as a SpreadsheetML 2003 workbook.
 *
 * This is Excel's own XML: one plain text file with no archive around it,
 * opened by a double-click and saved back from Excel like any other workbook.
 * Which is what makes it the format to write here — an `.xlsx` is a zip
 * archive and could not be built without a library, and the spec's dependency
 * rule is worth more than the newer extension.
 *
 * It is a working document rather than a printout. The tick column is an empty
 * boxed cell to put an x in, and the paid column is left blank for everyone
 * paying at the venue so that "paid" can be typed beside them as the money
 * arrives.
 *
 * Deliberately plain: styles, column widths, a title, and nothing else. Frozen
 * panes and print setup are each one line away, and each is a line Excel may
 * decide is malformed — a workbook that opens with a repair warning is worse
 * than one whose header scrolls off the top.
 */
export function doorListXml(event: Event): string {
  const title = `${event.name} · ${event.eventDate}`;

  const body = doorRows(event)
    .map(
      (row) =>
        `   <Row>${sheetCell("", "tick")}${sheetCell(row.table, "middle")}` +
        `${sheetCell(row.guest, "cell")}${sheetCell(row.paid, "middle")}</Row>`,
    )
    .join("\n");

  // The tick column's heading is blank: the box under it says what it is.
  const header = DOOR_HEADER.map((name) =>
    sheetCell(name === "arrived" ? "" : name, "head"),
  ).join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="title">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1"/>
  </Style>
  <Style ss:ID="head">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#EFEFEF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="cell">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
   </Borders>
  </Style>
  <Style ss:ID="middle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/>
   </Borders>
  </Style>
  <Style ss:ID="tick">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Door list">
  <Table>
   <Column ss:Width="34"/>
   <Column ss:Width="44"/>
   <Column ss:Width="190"/>
   <Column ss:Width="62"/>
   <Row ss:Height="22">
    <Cell ss:StyleID="title" ss:MergeAcross="3"><Data ss:Type="String">${xmlText(title)}</Data></Cell>
   </Row>
   <Row ss:Height="18">${header}</Row>
${body}
  </Table>
 </Worksheet>
</Workbook>
`;
}

/* ------------------------------------------------------------- file names */

/** "2026-09-05", for stamping into a file name. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Part of a file name made from something a person typed.
 *
 * Windows refuses a name holding any of \ / : * ? " < > | and every system
 * dislikes a name ending in a dot or a space, so everything but letters,
 * digits and dashes is folded to a dash and the run is collapsed.
 */
function slug(text: string): string {
  const folded = text
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded === "" ? "event" : folded.slice(0, 50);
}

/**
 * What an export writes.
 *
 * `json` is the backup, `csv` the three spreadsheets of everything, and the
 * two `door-` formats the list the door works from: the same rows, as Excel's
 * own XML or as plain CSV.
 */
export type ExportFormat = "json" | "csv" | "door-xml" | "door-csv";

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
  format: ExportFormat,
  events: readonly Event[],
  expenseTemplates: readonly ExpenseTemplate[],
): OutputFile[] {
  const stamp = today();

  // A door list is one event's worth of paper, so one file per event rather
  // than one file with an event column nobody at the door needs.
  if (format === "door-xml" || format === "door-csv") {
    const xml = format === "door-xml";
    return events.map((event) => ({
      name: `door-list-${slug(event.name)}-${event.eventDate}.${xml ? "xml" : "csv"}`,
      text: xml ? doorListXml(event) : doorListCsv(event),
      // The SpreadsheetML type is what tells Windows to open it with Excel.
      type: xml ? "application/vnd.ms-excel" : "text/csv",
    }));
  }

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
