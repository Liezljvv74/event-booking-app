/**
 * Date and clock-time formatting for events.
 *
 * Every function here parses "YYYY-MM-DD" by splitting the string rather than
 * handing it to `new Date`, which reads a bare date as UTC midnight and shifts
 * it by the viewer's offset — showing the wrong day west of Greenwich.
 */

/** "14 Mar 2026" from "2026-03-14". */
export function formatEventDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Minutes since midnight for "HH:MM", or null if unparseable. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Whether the event runs past midnight. An end at or before the start is not
 * a mistake — a function starting 20:00 and ending 01:00 is ordinary — so it
 * is reported rather than rejected.
 */
export function endsAfterMidnight(
  startTime: string | null,
  endTime: string | null,
): boolean {
  if (startTime === null || endTime === null) return false;
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (start === null || end === null) return false;
  return end <= start;
}

/**
 * "18:00 – 23:30", "from 18:00", "until 23:30", or "" when neither is set.
 *
 * A range crossing midnight can be marked "(next day)" so the end time is not
 * misread, which the event tabs do: a tab is a line of small print skimmed
 * next to three others. The dashboard asks for it off — the event's schedule
 * is set in the heading there, and a late finish reads plainly enough at that
 * size without the note.
 */
export function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  { markNextDay = true }: { markNextDay?: boolean } = {},
): string {
  if (startTime === null && endTime === null) return "";
  if (endTime === null) return `from ${startTime}`;
  if (startTime === null) return `until ${endTime}`;

  const suffix =
    markNextDay && endsAfterMidnight(startTime, endTime) ? " (next day)" : "";
  return `${startTime} – ${endTime}${suffix}`;
}
