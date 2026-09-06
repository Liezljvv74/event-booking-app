"use client";

import { useId, useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import type { ExpensePatch } from "@/lib/repository";
import type { Expense, ExpenseTemplate } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { enterMovesDown } from "@/components/list-keys";
import { useMoney } from "@/components/event-provider";

/**
 * One grid template shared by the header, every line and the add row, so the
 * columns line up without a real table element. Notes and description get
 * the flexible width; the amount, the tick and the button are fixed.
 */
export const EXPENSE_GRID =
  "grid grid-cols-[minmax(8rem,1.3fr)_minmax(7rem,1fr)_6rem_3rem_minmax(8rem,1.3fr)_4.5rem] items-center gap-2";

/** Wider than a phone, so the columns scroll sideways instead of wrapping. */
export const EXPENSE_MIN_WIDTH = "min-w-[42rem]";

export const expenseFieldClass =
  "h-9 w-full min-w-0 rounded-md border border-line bg-field px-2 text-sm text-ink disabled:opacity-50";

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
    <li
      data-expense={expense.id}
      data-list-row
      // Enter moves down the column; every field in the row bubbles to here.
      onKeyDown={enterMovesDown(onEnter)}
      className={paid ? "opacity-70" : ""}
    >
      <div className={EXPENSE_GRID}>
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
          className={expenseFieldClass}
        />

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
          className={expenseFieldClass}
        />

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
          className={`${expenseFieldClass} text-right`}
        />

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
          className="h-4 w-4 justify-self-center accent-primary"
        />

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
          className={expenseFieldClass}
        />

        {/* Square, so it reads as a cross rather than as a word. What it
            does is in its name and its tooltip, which is where the word went:
            a line's own button does not need to spell itself out in a column
            it shares with nineteen others saying the same thing. */}
        <button
          type="button"
          onClick={() => void onClear()}
          disabled={busy}
          aria-label={`Clear ${expense.description}`}
          title="Clear this line, keeping it in the saved lines"
          data-expense-clear={expense.id}
          className="h-9 w-9 justify-self-center rounded-md border border-line text-base leading-none text-ink-soft hover:bg-muted disabled:opacity-50"
        >
          <span aria-hidden="true">×</span>
        </button>
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
          className="mt-1 mb-1 text-xs text-danger"
        >
          {error}
        </p>
      )}
    </li>
  );
}
