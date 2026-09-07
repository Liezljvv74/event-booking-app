"use client";

/**
 * Moving down a list with the Enter key.
 *
 * A list of expenses, or of guests, is typed down a column rather than along a
 * row: every description, then every amount. Enter is what a typist presses at
 * the end of a line, so Enter goes to the same field on the line below — and,
 * at the bottom of the list, makes the next line and goes to that.
 *
 * Done through the DOM rather than through React state, and deliberately.
 * Which line is below which is a fact about what is on the screen; keeping a
 * parallel model of it in state would be a second answer to a question the
 * document already answers, and the two would disagree the first time a row
 * was filtered, sorted or removed. The three attributes below are the whole
 * of the arrangement:
 *
 * - `data-list` on whatever holds the rows,
 * - `data-list-row` on each row,
 * - `data-list-field` on each field, naming its column.
 *
 * Tab needs none of this. It already moves to the next field to the right,
 * because it follows the order the fields are written in and every row in this
 * app is written left to right — nothing anywhere reorders itself visually
 * with `order-*` or a reversed flex direction, which is the one thing that
 * would put Tab out of step with the eye.
 */

export const LIST_ATTRIBUTE = "data-list";
export const ROW_ATTRIBUTE = "data-list-row";
export const FIELD_ATTRIBUTE = "data-list-field";

/** Where a field sits: which list, which row of it, and what column. */
function place(field: HTMLElement): {
  rows: Element[];
  index: number;
  column: string;
} | null {
  const column = field.getAttribute(FIELD_ATTRIBUTE);
  const row = field.closest(`[${ROW_ATTRIBUTE}]`);
  const list = row?.closest(`[${LIST_ATTRIBUTE}]`);
  if (column === null || !row || !list) return null;

  const rows = Array.from(list.querySelectorAll(`[${ROW_ATTRIBUTE}]`));
  return { rows, index: rows.indexOf(row), column };
}

/**
 * Focus the same column on the row below, and say whether there was one.
 *
 * Read from the document on every call, which is what lets the same function
 * be tried again once a new row has been added.
 */
function stepDown(field: HTMLElement): boolean {
  const at = place(field);
  if (at === null) return false;

  const next = at.rows[at.index + 1];
  if (next === undefined) return false;

  /**
   * The first one that is actually on the screen, not simply the first in the
   * markup.
   *
   * A row can hold the same column twice now: the expense lines carry a
   * compact field for a narrow list and a table cell for a wide one, and CSS
   * decides which is shown. `querySelector` would hand back whichever comes
   * first in the source either way, so Enter spent half its time focusing a
   * `display: none` field — which silently does nothing at all, leaving the
   * cursor where it was and the key looking broken.
   */
  const target = Array.from(
    next.querySelectorAll(`[${FIELD_ATTRIBUTE}="${CSS.escape(at.column)}"]`),
  ).find((candidate) => candidate.getClientRects().length > 0);
  if (!(target instanceof HTMLElement)) return false;

  target.focus();
  // A field arrived at by Enter is a field about to be replaced, far more
  // often than one about to be appended to.
  if (target instanceof HTMLInputElement && target.type === "text") {
    target.select();
  }
  return true;
}

/**
 * An Enter handler for a whole row: down to the next line, or on to a new one.
 *
 * Put on the row rather than on each field, so every field is covered — the
 * selects and the tick as well as the text boxes — and so a field's own
 * handler can get on with saving what was typed without also having to know
 * where the cursor goes next. Both run: the field's first, then this as it
 * bubbles.
 *
 * Only fields answer to it. Anything without `data-list-field` is left alone,
 * which is what keeps Enter on a Remove button doing what Enter on a button
 * should.
 *
 * `create` is what to do at the bottom of the list. Where it returns a promise
 * — a guest being added to a party, which is a write — the move is tried again
 * once the row exists and the screen has been painted. Where it returns
 * nothing, the caller is taken to be putting the cursor where it wants it
 * itself, as the blank expense line does.
 */
export function enterMovesDown(
  create?: () => Promise<unknown> | void,
): (event: React.KeyboardEvent) => void {
  return (event) => {
    if (event.key !== "Enter") return;

    const field = event.target;
    if (!(field instanceof HTMLElement)) return;

    // A field, and one in a list. Anything else — a button in the row, a
    // field on a form that happens to be marked, a row not inside a list —
    // is left to do whatever Enter does there. Checked before the default is
    // prevented, because handling nothing and swallowing the key is worse
    // than either.
    if (place(field) === null) return;

    event.preventDefault();
    if (stepDown(field)) return;

    const made = create?.();
    if (made === undefined || made === null) return;

    void Promise.resolve(made).then(() => {
      // After the write has landed and React has painted the row it caused.
      requestAnimationFrame(() => stepDown(field));
    });
  };
}
