"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useDismiss } from "@/components/use-dismiss";
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
  /** Whether the provider-and-notes panel is over the screen. */
  const [open, setOpen] = useState(false);

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
     * One compact line where the list is narrow, a row of six columns where
     * it is wide. The border is what tells one line from the next in the
     * compact list; in the grid the columns lining up already do it.
     */
    <li
      data-expense={expense.id}
      data-list-row
      // Enter moves down the column; every field in the row bubbles to here.
      onKeyDown={enterMovesDown(onEnter)}
      className={`rounded-md border border-zinc-200 @min-[40rem]/lines:rounded-none @min-[40rem]/lines:border-0 dark:border-zinc-800 ${
        paid ? "opacity-70" : ""
      }`}
    >
      {/* --------------------------------------- narrow: one compact line

          What a cost was and what it came to, which is what a list of
          expenses is read for, plus the tick that says whether it has gone
          out. Provider and notes are behind the note button: they are written
          once and looked at rarely, and on a phone they cost two of the four
          lines a card had.

          Every field here is a control, so there is no spare part of the row
          to tap — which is why the notes have a button of their own rather
          than the whole line being the way in, as it is for a guest. It fills
          in when there is something written, so the list also says which
          lines carry a note. */}
      <div
        data-expense-line={expense.id}
        className="flex items-center gap-1.5 p-1 @min-[40rem]/lines:hidden"
      >
        <input
          type="text"
          list={savedLinesId}
          value={description}
          disabled={busy}
          aria-label={`Description of ${expense.description}`}
          data-expense-description-quick={expense.id}
          data-list-field="description"
          onChange={(changed) => setDescription(changed.target.value)}
          onBlur={commitDescription}
          onKeyDown={keyCommit(commitDescription)}
          className={`h-11 min-w-0 flex-1 text-base ${FIELD_SHAPE}`}
        />

        <input
          type="text"
          inputMode="decimal"
          value={amount}
          disabled={busy}
          aria-label={`Amount of ${expense.description}`}
          data-expense-amount-quick={expense.id}
          data-list-field="amount"
          onChange={(changed) => setAmount(changed.target.value)}
          onBlur={commitAmount}
          onKeyDown={keyCommit(commitAmount)}
          className={`h-11 w-[4.75rem] shrink-0 text-right text-base ${FIELD_SHAPE}`}
        />

        <input
          type="checkbox"
          checked={paid}
          disabled={busy}
          aria-label={`${expense.description} is paid`}
          data-expense-paid-quick={expense.id}
          onChange={(changed) => {
            const wanted = changed.target.checked;
            setPaid(wanted);
            void apply({ paid: wanted }, () => setPaid(expense.paid));
          }}
          className={`h-5 w-5 shrink-0 ${TICK_SHAPE}`}
        />

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Provider and notes for ${expense.description}`}
          title="Provider and notes"
          data-expense-more={expense.id}
          data-has-notes={notes.trim() === "" ? undefined : ""}
          className={`h-11 w-10 shrink-0 rounded-md border text-base leading-none ${
            notes.trim() === "" || provider.trim() === ""
              ? "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-500"
              : "border-zinc-400 text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          }`}
        >
          {/* A pencil, not a star: a star reads as a favourite, and this is
              the way in to two more fields. Whether anything is written in
              them is said by the border and the ink instead. */}
          <span aria-hidden="true">✎</span>
        </button>

        <button
          type="button"
          onClick={() => void onClear()}
          disabled={busy}
          aria-label={`Clear ${expense.description}`}
          title="Clear this line, keeping it in the saved lines"
          data-expense-clear-quick={expense.id}
          className="h-11 w-10 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {/* ------------------------------------- wide: the row of six columns */}
      <div className={`${EXPENSE_GRID} hidden`}>
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
          className="mt-1 mb-1 px-1 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {open && (
        <LineDetail
          expense={expense}
          description={description}
          onClose={() => setOpen(false)}
        >
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Provider</span>
            <input
              type="text"
              value={provider}
              disabled={busy}
              placeholder="-"
              data-expense-provider={expense.id}
              onChange={(changed) => setProvider(changed.target.value)}
              onBlur={() => commitText("provider", provider, setProvider)}
              className={`mt-0.5 h-11 w-full text-base ${FIELD_SHAPE}`}
            />
          </label>

          {/* One field holding everything written about this line, not one
              per note. An expense carries a single `notes` string, so what is
              already there and whatever is added to it are the same value —
              this is a taller box for it, nothing more. */}
          <label className="mt-3 block">
            <span className={FIELD_LABEL_CLASS}>Notes</span>
            <textarea
              value={notes}
              disabled={busy}
              rows={5}
              placeholder="Anything worth remembering about this cost"
              data-expense-notes={expense.id}
              onChange={(changed) => setNotes(changed.target.value)}
              onBlur={() => commitText("notes", notes, setNotes)}
              className={`mt-0.5 w-full resize-y py-2 text-base ${FIELD_SHAPE}`}
            />
          </label>
        </LineDetail>
      )}
    </li>
  );
}

/**
 * The two fields the compact line does not carry, over the screen.
 *
 * Portalled to `<body>`, and it has to be: the expense list declares
 * `container-type: inline-size`, which makes it a containing block for
 * `position: fixed` descendants — so a panel rendered inside the list would
 * be pinned to the list rather than to the window.
 *
 * Nothing in here answers to a container query. The panel is always narrow,
 * so its two fields are simply stacked, which is why it needs no
 * `@container` of its own the way the guest detail does: that one reuses the
 * table's own fields and has to make them believe they are in a narrow list,
 * while these two exist only here.
 */
function LineDetail({
  expense,
  description,
  onClose,
  children,
}: {
  expense: Expense;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismiss(true, panel, onClose);

  useEffect(() => {
    panel.current?.focus();
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = had;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-expense-detail={expense.id}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="max-h-[85vh] w-[min(26rem,100%)] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-2 flex items-baseline gap-2">
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-base font-semibold text-black dark:text-zinc-50"
          >
            {description.trim() === "" ? "This line" : description.trim()}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close provider and notes"
            data-expense-detail-close
            className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {children}

        {/* Both fields commit as they are left, the way they do in the table,
            so this saves nothing that is not already saved — it is the way
            out once the writing is done. */}
        <button
          type="button"
          onClick={onClose}
          data-expense-detail-done
          className="mt-3 h-11 w-full rounded-md bg-black text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
