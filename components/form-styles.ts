/**
 * The look of a form field, in one place.
 *
 * Four files had written this out for themselves — the New event form and an
 * event's row on Manage events with one string each, character for character
 * the same, and the ticket-prices and tables editors with the same string
 * again plus a size. Four copies of a look is four things to remember on the
 * day the look changes, and the two screens that must match each other are
 * exactly the two most likely to be edited apart: the form that creates an
 * event and the row that edits one are meant to be the same shape.
 *
 * The New booking form is deliberately not here. Its fields are wider-padded
 * and stay full size, and folding them in would change how that screen looks
 * rather than tidying how it is written.
 */

/**
 * A text, date, time or number input: full width of whatever holds it, tall
 * enough to hit with a thumb, and one step shorter from `sm` up where a
 * pointer is doing the hitting.
 */
export const FIELD_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 " +
  "text-base text-black disabled:opacity-50 sm:h-9 " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/**
 * The same field where several sit across one line — the price rows and the
 * table rows — which is the one place the text drops a size to match.
 */
export const DENSE_FIELD_CLASS = `${FIELD_CLASS} sm:text-sm`;

/** The small grey word above a field. */
export const FIELD_LABEL_CLASS = "text-xs text-zinc-600 dark:text-zinc-400";

/**
 * The same word above a field on a phone card, and gone from `sm` up, where
 * the list has a header row saying it once for every line beneath it.
 *
 * Carries `aria-hidden` wherever it is used, the way the header rows it
 * stands in for do. Every control under one of these already says the same
 * words in its own `aria-label`, and a field announced twice is worse than a
 * field announced once.
 */
export const CARD_LABEL_CLASS = `mb-0.5 block sm:hidden ${FIELD_LABEL_CLASS}`;

/**
 * A tick box: a thumb's width on a phone, and back to a pointer's from `sm`
 * up, where it also centres itself under its column heading.
 */
export const TICK_CLASS =
  "h-5 w-5 shrink-0 accent-black sm:h-4 sm:w-4 sm:justify-self-center " +
  "dark:accent-zinc-300";
