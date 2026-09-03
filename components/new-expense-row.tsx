"use client";

import { useState } from "react";
import {
  EXPENSE_GRID,
  expenseFieldClass,
} from "@/components/expense-row";
import { parseCents } from "@/lib/money";
import type { ExpenseInput } from "@/lib/repository";

interface Props {
  onAdd: (input: ExpenseInput) => Promise<unknown>;
}

/**
 * The add row, sharing the table's columns so a new line is typed where it
 * will end up rather than in a separate form above or below the list.
 *
 * Only the description and the amount are required. Provider, the paid tick
 * and notes can be left for later, or never filled in at all.
 *
 * The two required fields carry aria-required rather than the HTML required
 * attribute: that attribute stops the submit before this component can say
 * what is wrong, in a browser tooltip worded by the browser, and it would
 * still wave through a description of nothing but spaces.
 */
export function NewExpenseRow({ onAdd }: Props) {
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (description.trim() === "") {
      setError("Give the expense a description.");
      return;
    }
    const cents = parseCents(amount);
    if (cents === null || cents < 0) {
      setError("Enter an amount of zero or more, for example 250.00.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onAdd({
        description,
        amountCents: cents,
        provider,
        paid,
        notes,
      });
      // Cleared for the next line, which is usually typed straight after.
      setDescription("");
      setProvider("");
      setAmount("");
      setPaid(false);
      setNotes("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} data-new-expense>
      <div className={EXPENSE_GRID}>
        <input
          type="text"
          value={description}
          disabled={saving}
          aria-required="true"
          placeholder="Venue hire"
          aria-label="New expense description"
          name="description"
          onChange={(changed) => setDescription(changed.target.value)}
          className={expenseFieldClass}
        />

        <input
          type="text"
          value={provider}
          disabled={saving}
          placeholder="Optional"
          aria-label="New expense provider"
          name="provider"
          onChange={(changed) => setProvider(changed.target.value)}
          className={expenseFieldClass}
        />

        <input
          type="text"
          inputMode="decimal"
          value={amount}
          disabled={saving}
          aria-required="true"
          placeholder="0.00"
          aria-label="New expense amount"
          name="amount"
          onChange={(changed) => setAmount(changed.target.value)}
          className={`${expenseFieldClass} text-right`}
        />

        <input
          type="checkbox"
          checked={paid}
          disabled={saving}
          aria-label="New expense is already paid"
          name="paid"
          onChange={(changed) => setPaid(changed.target.checked)}
          className="h-4 w-4 justify-self-center accent-black dark:accent-zinc-300"
        />

        <input
          type="text"
          value={notes}
          disabled={saving}
          placeholder="Optional"
          aria-label="New expense notes"
          name="notes"
          onChange={(changed) => setNotes(changed.target.value)}
          className={expenseFieldClass}
        />

        <button
          type="submit"
          disabled={saving}
          data-add-expense
          className="h-9 rounded-md bg-black text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {saving ? "…" : "Add"}
        </button>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
