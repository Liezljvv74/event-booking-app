"use client";

import { useId, useState } from "react";
import {
  FIELD_LABEL_CLASS,
  FIELD_SHAPE,
  TICK_SHAPE,
} from "@/components/form-styles";
import { formatCents, parseCents } from "@/lib/money";
import type { ExpensePatch } from "@/lib/repository";
import type { Expense, ExpenseTemplate } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { enterMovesDown } from "@/components/list-keys";
import { useMoney } from "@/components/event-provider";

/**
 * How wide the list has to be before a line can be a row of columns.
 *
 * Six columns have a floor of 624px — the four fixed and minimum tracks plus
 * the five gaps between them — so this is that, rounded up to 40rem for a
 * little slack. It used also to carry a 42rem minimum width, which is where
 * the old 672px figure came from; the container query makes that unnecessary,
 * since the columns are only drawn where they fit.
 *
 * Asked of the container rather than of the window, for the reason the guest
 * table is: a `sm:` breakpoint answers "is the screen wide", and the list has
 * the screen less the event rail and the page padding — about 224px less. So a
 * tablet between 640px and about 860px gave six columns 416 to 544px and hid
 * the last of them behind a sideways scroll, while `sm:` said it was fine.
 *
 * Written out in full at every use, never assembled from a constant: Tailwind
 * reads the source text for the class names it generates, so a name built at
 * run time is a name it never sees and a rule that never exists.
 */
export const EXPENSE_GRID =
  "@min-[40rem]/lines:grid @min-[40rem]/lines:items-center " +
  "@min-[40rem]/lines:gap-2 " +
  "@min-[40rem]/lines:grid-cols-[minmax(8rem,1.3fr)_minmax(7rem,1fr)_6rem_3rem_minmax(8rem,1.3fr)_4.5rem]";

/**
 * The list declares itself the thing those columns measure against. Named,
 * so the query cannot be answered by some other container added later — and
 * named apart from the guest table, which has its own threshold.
 */
export const EXPENSE_CONTAINER = "@container/lines";

/**
 * A last resort rather than the mechanism, as on the guest table: the query
 * above is what keeps the columns from overflowing, and this is here so that
 * if a track ever grows past its floor the list scrolls and not the page.
 */
export const EXPENSE_OVERFLOW = "@min-[40rem]/lines:overflow-x-auto";

/** A line's field: thumb-sized in the stack, tightened in the columns. */
export const LINE_FIELD_CLASS =
  `h-11 w-full text-base ${FIELD_SHAPE} ` +
  "@min-[40rem]/lines:h-9 @min-[40rem]/lines:text-sm";

/** A field name above it in the stack, gone once the header carries it. */
export const LINE_LABEL_CLASS =
  `mb-0.5 block @min-[40rem]/lines:hidden ${FIELD_LABEL_CLASS}`;

/**
 * The paid tick. In the stack it sits low enough for its middle to line up
 * with the middle of the two boxes beside it, which its label above and its
 * smaller height would otherwise put it above.
 */
export const LINE_TICK_CLASS =
  `h-5 w-5 ${TICK_SHAPE} @max-[40rem]/lines:mb-3 ` +
  "@min-[40rem]/lines:h-4 @min-[40rem]/lines:w-4 " +
  "@min-[40rem]/lines:justify-self-center";

/**
 * Clearing a line: off this event, and kept in the saved lines to be picked
 * again on the next one.
 *
 * Set apart below a rule in the stack, the way the guest row sets its cancel
 * apart, but in the app's ordinary grey rather than in red. Cancelling a
 * guest cannot be undone; this can, by picking the line back out of the
 * dropdown, so it is not the same kind of button and should not wear the same
 * colour.
 *
 * The width and the type size are stated once for the stack and once for the
 * columns, as a `@max-`/`@min-` pair that cannot both apply. The colours are
 * the same either way and so are said once, unprefixed.
 */
const CLEAR_CLASS =
  "rounded-md border border-zinc-300 leading-none text-zinc-700 " +
  "hover:bg-zinc-100 disabled:opacity-50 " +
  "@max-[40rem]/lines:h-11 @max-[40rem]/lines:w-full " +
  "@max-[40rem]/lines:text-sm @max-[40rem]/lines:font-medium " +
  "@min-[40rem]/lines:h-9 @min-[40rem]/lines:w-9 " +
  "@min-[40rem]/lines:justify-self-center @min-[40rem]/lines:text-base " +
  "dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

interface Props {
  expense: Expense;
  /**
   * Saved lines this line may take. One already held by another line on the
   * event is not among them until that line is cleared.
   */
  templates: readonly ExpenseTemplate[];
  onPatch: (patch: ExpensePatch) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  /**
   * Enter was pressed in one of this line's fields. The field is committed
   * either way; this is the screen's cue to open a blank line below and put
   * the cursor in it, so a list is typed straight down without going back to
   * the button between every line.
   */
  onEnter: () => void;
}

export function ExpenseRow({
  expense,
  templates,
  onPatch,
  onClear,
  onEnter,
}: Props) {
  const money = useMoney();
  const savedLinesId = useId();
  const [description, setDescription] = useState(expense.description);
  const [provider, setProvider] = useState(expense.provider);
  const [amount, setAmount] = useState(formatCents(expense.amountCents));
  const [notes, setNotes] = useState(expense.notes);
  // Held locally like every other field in the row, so the tick answers the
  // click at once instead of springing back until the save has landed.
  const [paid, setPaid] = useState(expense.paid);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The stored values win when they change underneath, so a refused edit
  // never leaves a field showing something that was never saved. Adjusted
  // during render because an effect would show the stale value first.
  const [last, setLast] = useState(expense);
  if (last !== expense) {
    setLast(expense);
    setDescription(expense.description);
    setProvider(expense.provider);
    setAmount(formatCents(expense.amountCents));
    setNotes(expense.notes);
    setPaid(expense.paid);
  }

  async function apply(patch: ExpensePatch, revert: () => void) {
    setBusy(true);
    setError("");
    try {
      await onPatch(patch);
    } catch (caught) {
      setError(describeError(caught));
      revert();
    } finally {
      setBusy(false);
    }
  }

  function commitText(
    field: "provider" | "notes",
    typed: string,
    reset: (value: string) => void,
  ) {
    if (typed.trim() === expense[field]) return;
    void apply({ [field]: typed }, () => reset(expense[field]));
  }

  function savedLineNamed(value: string): ExpenseTemplate | undefined {
    const wanted = value.trim().toLowerCase();
    return templates.find(
      (template) => template.description.trim().toLowerCase() === wanted,
    );
  }

  function commitDescription() {
    const typed = description.trim();
    if (typed === expense.description) return;

    // A saved line brings its amount along, but only into a line that has
    // none yet. Overwriting a figure already entered would lose it, and the
    // dropdown sits in the description column, not the amount one.
    const saved = savedLineNamed(typed);
    const patch: ExpensePatch =
      saved !== undefined && expense.amountCents === 0
        ? { description: typed, amountCents: saved.amountCents }
        : { description: typed };

    void apply(patch, () => setDescription(expense.description));
  }

  function commitAmount() {
    const cents = parseCents(amount);
    if (cents === null || cents < 0) {
      setError("Enter an amount of zero or more, for example 250.00.");
      setAmount(formatCents(expense.amountCents));
      return;
    }
    if (cents === expense.amountCents) return;
    void apply({ amountCents: cents }, () =>
      setAmount(formatCents(expense.amountCents)),
    );
  }

  /**
   * Commit on blur and on Enter, the way every other row in the app does.
   *
   * Only the saving. Where the cursor goes next is handled once for the whole
   * row, below, so that every field moves down the list the same way without
   * each of them having to know how.
   *
   * The commit is fired and not waited for. Enter is a typing key: the cursor
   * has to move at the speed of the keystroke rather than at the speed of a
   * write to IndexedDB, and a refused edit still puts itself right in this
   * row, which the cursor has by then left.
   */
  function keyCommit(commit: () => void) {
    return (pressed: React.KeyboardEvent) => {
      if (pressed.key !== "Enter") return;
      commit();
    };
  }

  return (
    /**
     * A card on a phone, a bare row from `sm` up. The border is what tells
     * one line from the next once the fields are stacked; in the grid the
     * columns lining up already do it.
     */
    <li
      data-expense={expense.id}
      data-list-row
      // Enter moves down the column; every field in the row bubbles to here.
      onKeyDown={enterMovesDown(onEnter)}
      className={`rounded-md border border-zinc-200 p-2 @min-[40rem]/lines:rounded-none @min-[40rem]/lines:border-0 @min-[40rem]/lines:p-0 dark:border-zinc-800 ${
        paid ? "opacity-70" : ""
      }`}
    >
      <div className={EXPENSE_GRID}>
        {/* What the cost was, which is the line's name. First on the card and
            first in the row.

            Each group below is a line of the card on a phone, and `contents`
            from `sm` up, where it dissolves and hands its fields straight to
            the grid. That is what lets one order of fields serve both. */}
        <div className="@min-[40rem]/lines:contents">
          <span aria-hidden="true" className={LINE_LABEL_CLASS}>
            Description
          </span>
          <input
            type="text"
            list={savedLinesId}
            value={description}
            disabled={busy}
            aria-label={`Description of ${expense.description}`}
            data-expense-description={expense.id}
            data-list-field="description"
            onChange={(changed) => setDescription(changed.target.value)}
            onBlur={commitDescription}
            onKeyDown={keyCommit(commitDescription)}
            className={LINE_FIELD_CLASS}
          />
        </div>

        {/* Who it went to, how much it was, and whether it has gone out yet.
            One line of the card between them: all three are short, and a
            line on its own for each would make a card of six. */}
        <div className="mt-2 flex items-end gap-2 @min-[40rem]/lines:contents">
          <div className="min-w-0 flex-1 @min-[40rem]/lines:contents">
            <span aria-hidden="true" className={LINE_LABEL_CLASS}>
              Provider
            </span>
            <input
              type="text"
              value={provider}
              disabled={busy}
              placeholder="-"
              aria-label={`Provider for ${expense.description}`}
              data-expense-provider={expense.id}
              data-list-field="provider"
              onChange={(changed) => setProvider(changed.target.value)}
              onBlur={() => commitText("provider", provider, setProvider)}
              onKeyDown={keyCommit(() =>
                commitText("provider", provider, setProvider),
              )}
              className={LINE_FIELD_CLASS}
            />
          </div>

          <div className="w-24 shrink-0 @min-[40rem]/lines:contents">
            <span aria-hidden="true" className={LINE_LABEL_CLASS}>
              Amount
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              aria-label={`Amount of ${expense.description}`}
              data-expense-amount={expense.id}
              data-list-field="amount"
              onChange={(changed) => setAmount(changed.target.value)}
              onBlur={commitAmount}
              onKeyDown={keyCommit(commitAmount)}
              className={`${LINE_FIELD_CLASS} text-right`}
            />
          </div>

          {/* The tick sits low enough on the card for its middle to line up
              with the middle of the two boxes beside it, which its label
              above and its smaller height would otherwise put it above. */}
          <div className="flex shrink-0 flex-col items-center @min-[40rem]/lines:contents">
            <span aria-hidden="true" className={LINE_LABEL_CLASS}>
              Paid
            </span>
            <input
              type="checkbox"
              checked={paid}
              disabled={busy}
              aria-label={`${expense.description} is paid`}
              data-expense-paid={expense.id}
              data-list-field="paid"
              onChange={(changed) => {
                const wanted = changed.target.checked;
                setPaid(wanted);
                void apply({ paid: wanted }, () => setPaid(expense.paid));
              }}
              className={LINE_TICK_CLASS}
            />
          </div>
        </div>

        {/* Whatever else is worth writing down, on a line of its own: it is
            the one field here with no length to it. */}
        <div className="mt-2 @min-[40rem]/lines:contents">
          <span aria-hidden="true" className={LINE_LABEL_CLASS}>
            Notes
          </span>
          <input
            type="text"
            value={notes}
            disabled={busy}
            placeholder="-"
            aria-label={`Notes on ${expense.description}`}
            data-expense-notes={expense.id}
            data-list-field="notes"
            onChange={(changed) => setNotes(changed.target.value)}
            onBlur={() => commitText("notes", notes, setNotes)}
            onKeyDown={keyCommit(() => commitText("notes", notes, setNotes))}
            className={LINE_FIELD_CLASS}
          />
        </div>

        {/* Set apart at the foot of the card, away from the fields a thumb
            has just been over. In the grid it is the square cross it has
            always been: what it does is in its name and its tooltip, which
            is where the word went — a line's own button does not need to
            spell itself out in a column it shares with nineteen others
            saying the same thing. */}
        <div className="mt-2 border-t border-zinc-200 pt-2 @min-[40rem]/lines:contents dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void onClear()}
            disabled={busy}
            aria-label={`Clear ${expense.description}`}
            title="Clear this line, keeping it in the saved lines"
            data-expense-clear={expense.id}
            className={CLEAR_CLASS}
          >
            <span className="@min-[40rem]/lines:hidden">Clear line</span>
            <span aria-hidden="true" className="hidden @min-[40rem]/lines:inline">
              ×
            </span>
          </button>
        </div>
      </div>

      <datalist id={savedLinesId} data-saved-lines={expense.id}>
        {templates.map((template) => (
          <option key={template.id} value={template.description}>
            {money(template.amountCents)}
          </option>
        ))}
      </datalist>

      {error !== "" && (
        <p
          role="alert"
          className="mt-1 mb-1 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </li>
  );
}
