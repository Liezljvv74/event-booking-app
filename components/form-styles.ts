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
 *
 * The look and the width it answers to are kept apart, because they part
 * company. Most screens tighten their fields at a viewport width — `sm:` —
 * but a party's guest table tightens at its own *container* width, since a
 * party card can be narrow on a very wide screen. So the shape of a field,
 * of a label and of a tick box is exported without a size on it, and each
 * caller says what makes it tighten.
 */

/**
 * Everything about a text, date, time or number input except how tall it is
 * and how big its text is: the full width of whatever holds it, and the
 * borders and colours that make it a field rather than a word.
 */
export const FIELD_SHAPE =
  "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 " +
  "text-black disabled:opacity-50 " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/**
 * That field, sized against the viewport: tall enough to hit with a thumb,
 * and one step shorter from `sm` up where a pointer is doing the hitting.
 */
export const FIELD_CLASS = `h-11 text-base ${FIELD_SHAPE} sm:h-9`;

/**
 * The same field where several sit across one line — the price rows and the
 * table rows — which is the one place the text drops a size to match.
 */
export const DENSE_FIELD_CLASS = `${FIELD_CLASS} sm:text-sm`;

/** The small grey word above a field. */
export const FIELD_LABEL_CLASS = "text-xs text-zinc-600 dark:text-zinc-400";

/**
 * The same word above a field on a stacked card, and gone once the list has a
 * header row saying it once for every line beneath it.
 *
 * Carries `aria-hidden` wherever it is used, the way the header rows it
 * stands in for do. Every control under one of these already says the same
 * words in its own `aria-label`, and a field announced twice is worse than a
 * field announced once.
 */
export const CARD_LABEL_CLASS = `mb-0.5 block sm:hidden ${FIELD_LABEL_CLASS}`;

/** A tick box, with no size on it. */
export const TICK_SHAPE = "shrink-0 accent-black dark:accent-zinc-300";

/**
 * A tick box: a thumb's width on a phone, and back to a pointer's from `sm`
 * up, where it also centres itself under its column heading.
 */
export const TICK_CLASS = `h-5 w-5 ${TICK_SHAPE} sm:h-4 sm:w-4 sm:justify-self-center`;
