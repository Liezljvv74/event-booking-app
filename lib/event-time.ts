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

/**
 * "18:00 – 23:30", "from 18:00", "until 23:30", or "" when neither is set.
 *
 * The times are printed and nothing else. An end at or before the start means
 * the event runs past midnight, which a late function ordinarily does; it was
 * once marked "(next day)" wherever a range appeared, and that note is not
 * wanted — 20:00 – 01:30 says it.
 */
export function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
): string {
  if (startTime === null && endTime === null) return "";
  if (endTime === null) return `from ${startTime}`;
  if (startTime === null) return `until ${endTime}`;
  return `${startTime} – ${endTime}`;
}
