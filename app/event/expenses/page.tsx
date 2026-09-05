"use client";

import { useState } from "react";
import { useEventContext } from "@/components/event-provider";
import {
  EXPENSE_GRID,
  EXPENSE_MIN_WIDTH,
  ExpenseRow,
} from "@/components/expense-row";
import { NewExpenseRow } from "@/components/new-expense-row";
import { formatAmount, sumCents } from "@/lib/money";
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
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Expenses
        </h1>
        <p
          data-expense-summary
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {event.expenses.length} line
          {event.expenses.length === 1 ? "" : "s"} ·{" "}
          {formatAmount(summary.allCents)} total
          {summary.paidCount > 0
            ? ` · ${formatAmount(summary.paidCents)} paid · ${formatAmount(summary.outstandingCents)} outstanding`
            : ""}
        </p>

        {event.expenses.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {confirmingClearAll ? (
              <>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  Clear all {event.expenses.length} lines?
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={busy}
                  data-confirm-clear-all
                  className="h-9 rounded-md bg-red-600 px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClearAll(false)}
                  disabled={busy}
                  className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClearAll(true)}
                data-clear-all
                className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
              >
                Clear all lines
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-1.5 max-w-prose text-xs text-zinc-600 dark:text-zinc-400">
        A line needs a description and an amount. Provider, the paid tick and
        notes can be filled in whenever you know them. Each Description offers
        the lines you have cleared before, minus any already in the list, so a
        cost that recurs need not be retyped.
      </p>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Six columns are wider than a phone, so they scroll sideways here
          rather than wrapping each line onto several rows. */}
      <div className="mt-3 overflow-x-auto">
        <div className={EXPENSE_MIN_WIDTH}>
          <div
            className={`${EXPENSE_GRID} px-1 pb-1 text-xs text-zinc-500 dark:text-zinc-500`}
            aria-hidden="true"
          >
            <span>Description</span>
            <span>Provider</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Paid</span>
            <span>Notes</span>
            <span />
          </div>

          {event.expenses.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {event.expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  templates={available}
                  onPatch={(patch) => editExpense(event.id, expense.id, patch)}
                  onClear={() => clearExpenseLine(event.id, expense.id)}
                />
              ))}
            </ul>
          )}

          {/* The running total sits in the amount column, under the figures
              it adds up. */}
          {event.expenses.length > 0 && (
            <div
              className={`${EXPENSE_GRID} border-t border-zinc-200 pt-1.5 dark:border-zinc-800`}
            >
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Total
              </span>
              <span />
              <span
                data-expense-total
                className="text-right text-sm font-semibold text-black dark:text-zinc-50"
              >
                {formatAmount(summary.allCents)}
              </span>
              <span />
              <span
                data-expense-outstanding
                className="text-xs text-zinc-600 dark:text-zinc-400"
              >
                {summary.outstandingCents === 0
                  ? "all paid"
                  : `${formatAmount(summary.outstandingCents)} outstanding`}
              </span>
              <span />
            </div>
          )}

          <div className="mt-3">
            <NewExpenseRow
              templates={available}
              onAdd={(input) => addExpenseLine(event.id, input)}
            />
          </div>
        </div>
      </div>

      {event.expenses.length === 0 && (
        <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          No expense lines yet. Whatever you add here is copied into your next
          event as a starting point.
        </p>
      )}

    </section>
  );
}
