"use client";

import { useState } from "react";
import { formatCents, parseCents } from "@/lib/money";
import type { ExpensePatch } from "@/lib/repository";
import type { Expense } from "@/lib/types";

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
  "h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

interface Props {
  expense: Expense;
  onPatch: (patch: ExpensePatch) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}

export function ExpenseRow({ expense, onPatch, onClear }: Props) {
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
      setError(caught instanceof Error ? caught.message : String(caught));
      revert();
    } finally {
      setBusy(false);
    }
  }

  function commitText(
    field: "description" | "provider" | "notes",
    typed: string,
    reset: (value: string) => void,
  ) {
    if (typed.trim() === expense[field]) return;
    void apply({ [field]: typed }, () => reset(expense[field]));
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

  /** Commit on blur and on Enter, the way every other row in the app does. */
  function keyCommit(commit: () => void) {
    return (pressed: React.KeyboardEvent) => {
      if (pressed.key !== "Enter") return;
      pressed.preventDefault();
      commit();
    };
  }

  return (
    <li data-expense={expense.id} className={paid ? "opacity-70" : ""}>
      <div className={EXPENSE_GRID}>
        <input
          type="text"
          value={description}
          disabled={busy}
          aria-label={`Description of ${expense.description}`}
          data-expense-description={expense.id}
          onChange={(changed) => setDescription(changed.target.value)}
          onBlur={() => commitText("description", description, setDescription)}
          onKeyDown={keyCommit(() =>
            commitText("description", description, setDescription),
          )}
          className={expenseFieldClass}
        />

        <input
          type="text"
          value={provider}
          disabled={busy}
          placeholder="—"
          aria-label={`Provider for ${expense.description}`}
          data-expense-provider={expense.id}
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
          onChange={(changed) => {
            const wanted = changed.target.checked;
            setPaid(wanted);
            void apply({ paid: wanted }, () => setPaid(expense.paid));
          }}
          className="h-4 w-4 justify-self-center accent-black dark:accent-zinc-300"
        />

        <input
          type="text"
          value={notes}
          disabled={busy}
          placeholder="—"
          aria-label={`Notes on ${expense.description}`}
          data-expense-notes={expense.id}
          onChange={(changed) => setNotes(changed.target.value)}
          onBlur={() => commitText("notes", notes, setNotes)}
          onKeyDown={keyCommit(() => commitText("notes", notes, setNotes))}
          className={expenseFieldClass}
        />

        <button
          type="button"
          onClick={() => void onClear()}
          disabled={busy}
          aria-label={`Clear ${expense.description}`}
          data-expense-clear={expense.id}
          className="h-9 rounded-md border border-zinc-300 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          Clear
        </button>
      </div>

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
