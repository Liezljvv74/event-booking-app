"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  EXPENSE_GRID,
  expenseFieldClass,
} from "@/components/expense-row";
import { formatCents, parseCents } from "@/lib/money";
import type { ExpenseInput } from "@/lib/repository";
import type { ExpenseTemplate } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { useMoney } from "@/components/event-provider";

interface Props {
  /** Saved lines not already held by a line on this event. */
  templates: readonly ExpenseTemplate[];
  onAdd: (input: ExpenseInput) => Promise<unknown>;
  /** Saved, so the row has done its job and goes. */
  onDone: () => void;
  /** Closed without saving. Whatever was typed goes with it. */
  onCancel: () => void;
  /**
   * Bumped whenever the cursor should come back here — when Enter is pressed
   * on a line further up, with this row already open. A number rather than a
   * function call because focusing is this component's own business; the
   * screen only says when.
   */
  focusToken: number;
}

/**
 * A blank line to fill in, sharing the table's columns so it is typed where
 * it will end up rather than in a separate form above or below the list.
 *
 * It used to sit at the foot of the list permanently, an empty row on every
 * visit whether or not anything was being added. Now the Add button at the
 * top of the screen brings it, on request, and saving or cancelling takes it
 * away again — so the screen is the expenses, and the blank line is only
 * there while one is being written.
 *
 * Only the description and the amount are required. Provider, the paid tick
 * and notes can be left for later, or never filled in at all.
 *
 * The two required fields carry aria-required rather than the HTML required
 * attribute: that attribute stops the submit before this component can say
 * what is wrong, in a browser tooltip worded by the browser, and it would
 * still wave through a description of nothing but spaces.
 */
export function NewExpenseRow({
  templates,
  onAdd,
  onDone,
  onCancel,
  focusToken,
}: Props) {
  const money = useMoney();
  const savedLinesId = useId();
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const descriptionField = useRef<HTMLInputElement>(null);
  /**
   * Bumped after a line is saved and the row is staying open for the next.
   *
   * The focusing cannot happen where the fields are cleared: every field is
   * disabled while the save is in flight, `setSaving(false)` has not been
   * rendered yet at that point, and focusing a disabled input does nothing at
   * all. Asking for it through state instead puts it after the render that
   * enables them again.
   */
  const [cursorWanted, setCursorWanted] = useState(0);

  // On the way in, after each saved line, and again each time the screen says
  // the cursor belongs here. All three are the same thing to this row: be
  // ready to be typed into.
  useEffect(() => {
    descriptionField.current?.focus();
  }, [focusToken, cursorWanted]);

  /**
   * Picking a saved line fills the amount in as well, but only while the
   * amount box is still empty, so a figure already typed is never replaced.
   */
  function changeDescription(value: string) {
    setDescription(value);
    if (amount.trim() !== "") return;

    const wanted = value.trim().toLowerCase();
    const saved = templates.find(
      (template) => template.description.trim().toLowerCase() === wanted,
    );
    if (saved !== undefined) setAmount(formatCents(saved.amountCents));
  }

  /**
   * Save the line, and either stand down or clear for the next one.
   *
   * `andAnother` is what Enter does and the Save button does not. Enter is
   * how a list is typed — line, Enter, line, Enter — so it leaves a blank row
   * behind with the cursor in it. The button is how one line is added, so it
   * closes the row, which is what the screen's own Add button is for undoing.
   */
  async function commit(andAnother: boolean) {
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
      if (andAnother) {
        setDescription("");
        setProvider("");
        setAmount("");
        setPaid(false);
        setNotes("");
        setCursorWanted((wanted) => wanted + 1);
      } else {
        // The line exists now, so the blank one has nothing left to be. Add
        // brings another, which is what the button above is there for.
        onDone();
      }
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Enter anywhere in the row saves it and opens the next one.
   *
   * Handled here rather than by letting the form submit, because the two
   * ways of finishing a line have to be told apart: Enter carries on, the
   * Save button stops. Buttons are left alone — Enter on the cross should
   * press the cross.
   */
  function enterCarriesOn(pressed: React.KeyboardEvent) {
    if (pressed.key !== "Enter") return;
    if (pressed.target instanceof HTMLButtonElement) return;
    pressed.preventDefault();
    void commit(true);
  }

  return (
    <form
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        void commit(false);
      }}
      onKeyDown={enterCarriesOn}
      data-new-expense
    >
      <div className={EXPENSE_GRID}>
        <input
          type="text"
          list={savedLinesId}
          value={description}
          disabled={saving}
          aria-required="true"
          aria-label="New expense description"
          name="description"
          data-list-field="description"
          ref={descriptionField}
          onChange={(changed) => changeDescription(changed.target.value)}
          className={expenseFieldClass}
        />

        <input
          type="text"
          value={provider}
          disabled={saving}
          placeholder="Optional"
          aria-label="New expense provider"
          name="provider"
          data-list-field="provider"
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
          data-list-field="amount"
          onChange={(changed) => setAmount(changed.target.value)}
          className={`${expenseFieldClass} text-right`}
        />

        <input
          type="checkbox"
          checked={paid}
          disabled={saving}
          aria-label="New expense is already paid"
          name="paid"
          data-list-field="paid"
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
          data-list-field="notes"
          onChange={(changed) => setNotes(changed.target.value)}
          className={expenseFieldClass}
        />

        {/* Save and discard share the last column, which is one button wide,
            so the cross is square and the word goes on the other one. */}
        <div className="flex items-center gap-1">
          <button
            type="submit"
            disabled={saving}
            data-add-expense
            className="h-9 flex-1 rounded-md bg-black text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Discard this new expense line"
            title="Discard this line"
            data-cancel-expense
            className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 text-base leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      <datalist id={savedLinesId} data-saved-lines="new">
        {templates.map((template) => (
          <option key={template.id} value={template.description}>
            {money(template.amountCents)}
          </option>
        ))}
      </datalist>

      {error !== "" && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
