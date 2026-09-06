"use client";

import { useState } from "react";
import { useEventContext, useMoney } from "@/components/event-provider";
import {
  EXPENSE_GRID,
  EXPENSE_MIN_WIDTH,
  ExpenseRow,
} from "@/components/expense-row";
import { NewExpenseRow } from "@/components/new-expense-row";
import { sumCents } from "@/lib/money";
import { unusedExpenseTemplates } from "@/lib/repository";
import type { Expense } from "@/lib/types";
import { useEventId } from "@/lib/event-routes";
import { describeError } from "@/lib/errors";

/** The three figures the paid tick makes worth having on this screen. */
function totals(expenses: readonly Expense[]) {
  const paid = expenses.filter((expense) => expense.paid);
  const paidCents = sumCents(paid.map((expense) => expense.amountCents));
  const allCents = sumCents(expenses.map((expense) => expense.amountCents));

  return {
    allCents,
    paidCents,
    outstandingCents: allCents - paidCents,
    paidCount: paid.length,
  };
}

export default function ExpensesScreen() {
  const money = useMoney();
  const {
    activeEvents,
    addExpenseLine,
    editExpense,
    clearExpenseLine,
    clearAllExpenses,
    expenseTemplates,
  } = useEventContext();
  const eventId = useEventId();
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  /**
   * Whether the blank line is on screen. It used to be there always, an empty
   * row on every visit whether or not anything was being added; now Add puts
   * it there and saving or cancelling takes it away.
   */
  const [adding, setAdding] = useState(false);
  /**
   * Bumped every time the cursor is sent to the blank line. Opening the row
   * focuses it by itself, but Enter pressed on a line further up while the
   * row is already open changes nothing about the row — so this is what tells
   * it to take the cursor anyway.
   */
  const [sendCursorToBlank, setSendCursorToBlank] = useState(0);

  /**
   * A blank line, ready to type into: what the Add button does, and what
   * Enter on any line does. Typing a list of expenses is then one press per
   * line rather than a trip back to the button between each of them.
   */
  function openBlankLine() {
    setAdding(true);
    setSendCursorToBlank((sent) => sent + 1);
  }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const event = activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  const summary = totals(event.expenses);
  // One list for every Description dropdown on the screen: a saved line is
  // offered while no line holds its description, and nowhere once one does.
  const available = unusedExpenseTemplates(expenseTemplates, event.expenses);

  async function clearAll() {
    setBusy(true);
    setError("");
    try {
      await clearAllExpenses(event!.id);
      setConfirmingClearAll(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold text-ink">
          Expenses
        </h1>
        <p
          data-expense-summary
          className="text-xs text-ink-muted"
        >
          {event.expenses.length} line
          {event.expenses.length === 1 ? "" : "s"} ·{" "}
          {money(summary.allCents)} total
          {summary.paidCount > 0
            ? ` · ${money(summary.paidCents)} paid · ${money(summary.outstandingCents)} outstanding`
            : ""}
        </p>

        <div className="ml-auto flex items-center gap-2">
          {event.expenses.length > 0 &&
            (confirmingClearAll ? (
              <>
                <span className="text-xs text-ink-muted">
                  Clear all {event.expenses.length} lines?
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={busy}
                  data-confirm-clear-all
                  className="h-9 rounded-md bg-danger hover:bg-danger-hover transition-colors px-3 text-xs font-medium text-danger-ink disabled:opacity-50"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClearAll(false)}
                  disabled={busy}
                  className="h-9 rounded-md border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClearAll(true)}
                data-clear-all
                className="h-9 rounded-md border border-line px-3 text-xs font-medium text-ink"
              >
                Clear all lines
              </button>
            ))}

          {/* Furthest right, where the thing you came to do lives. Disabled
              rather than hidden while a blank line is already open: two of
              them would be two half-written expenses and no way to tell which
              Save belonged to which. */}
          <button
            type="button"
            onClick={openBlankLine}
            disabled={adding}
            data-add-line
            className="h-9 rounded-md bg-primary hover:bg-primary-hover transition-colors px-4 text-xs font-medium text-primary-ink disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      <p className="mt-1.5 max-w-prose text-xs text-ink-muted">
        A line needs a description and an amount. Provider, the paid tick and
        notes can be filled in whenever you know them. Each Description offers
        the lines you have cleared before, minus any already in the list, so a
        cost that recurs need not be retyped.
      </p>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Six columns are wider than a phone, so they scroll sideways here
          rather than wrapping each line onto several rows. */}
      <div className="mt-3 overflow-x-auto">
        {/* The rows Enter walks down: every expense line, and then the blank
            one when it is open. They are marked from here rather than from
            the <ul>, because the blank line is that list's last row and sits
            outside it — the two have to be one list for Enter on the last
            expense to step into the blank rather than open a second one. */}
        <div data-list className={EXPENSE_MIN_WIDTH}>
          {/* Only where there is something under them to label. With no
              lines and nothing being added they were six words above an
              empty space. */}
          {(event.expenses.length > 0 || adding) && (
            <div
              className={`${EXPENSE_GRID} px-1 pb-1 text-xs text-ink-faint`}
              aria-hidden="true"
            >
              <span>Description</span>
              <span>Provider</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Paid</span>
              <span>Notes</span>
              <span />
            </div>
          )}

          {event.expenses.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {event.expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  templates={available}
                  onPatch={(patch) => editExpense(event.id, expense.id, patch)}
                  onClear={() => clearExpenseLine(event.id, expense.id)}
                  onEnter={openBlankLine}
                />
              ))}
            </ul>
          )}

          {/* The running total sits in the amount column, under the figures
              it adds up. */}
          {event.expenses.length > 0 && (
            <div
              className={`${EXPENSE_GRID} border-t border-line-soft pt-1.5`}
            >
              <span className="text-xs text-ink-muted">
                Total
              </span>
              <span />
              <span
                data-expense-total
                className="text-right text-sm font-semibold text-ink"
              >
                {money(summary.allCents)}
              </span>
              <span />
              <span
                data-expense-outstanding
                className="text-xs text-ink-muted"
              >
                {summary.outstandingCents === 0
                  ? "all paid"
                  : `${money(summary.outstandingCents)} outstanding`}
              </span>
              <span />
            </div>
          )}

          {adding && (
            <div data-list-row className="mt-3">
              <NewExpenseRow
                templates={available}
                onAdd={(input) => addExpenseLine(event.id, input)}
                onDone={() => setAdding(false)}
                onCancel={() => setAdding(false)}
                focusToken={sendCursorToBlank}
              />
            </div>
          )}
        </div>
      </div>

      {event.expenses.length === 0 && (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">
          No expense lines yet. Whatever you add here is copied into your next
          event as a starting point.
        </p>
      )}

    </section>
  );
}
