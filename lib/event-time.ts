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

/** A local date written the way the store keeps one: "YYYY-MM-DD". */
function asIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A date so many days on, as "YYYY-MM-DD".
 *
 * Built through the Date constructor's own overflow — day 32 of March is the
 * 1st of April — rather than by adding milliseconds, which goes wrong twice a
 * year: a week of 7 × 24 hours across a daylight-saving change lands an hour
 * out, and an hour out at midnight is a different day.
 */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return asIso(new Date(year, month - 1, day + days));
}

/**
 * A date so many months on, as "YYYY-MM-DD". Negative counts go back.
 *
 * The day of the month is kept, because that is what a monthly function means
 * to whoever writes it in a diary: the 14th, every month. Where the month it
 * lands in is too short for that day, the last day of it is used — the 31st of
 * January repeats on the 28th of February and then on the 31st of March, and
 * never on the 3rd of the following month, which is where the Date
 * constructor's own overflow would put it.
 *
 * Counted from the original date every time rather than a month on from the
 * last answer, so a run that gets clamped once does not stay clamped for the
 * rest of the year.
 */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const landing = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(
    landing.getFullYear(),
    landing.getMonth() + 1,
    0,
  ).getDate();
  landing.setDate(Math.min(day, lastDay));
  return asIso(landing);
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayIso(): string {
  return asIso(new Date());
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
