"use client";

import { useState } from "react";
import { useEventContext, useMoney } from "@/components/event-provider";
import {
  EXPENSE_CONTAINER,
  EXPENSE_GRID,
  EXPENSE_OVERFLOW,
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
    /* The whole screen measures itself, not just the list: the header has to
       know whether it is narrow too, so the summary can shorten and Add can
       become a +. One container answers for both, and it is the width the
       columns are compared against either way. */
    <section className={EXPENSE_CONTAINER}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Expenses
        </h1>
        {/* Narrow, the header is the only place a total appears — the row
            at the foot of the list goes with the columns — so it carries the
            total and what is still to pay and nothing else. Wide, it is the
            whole reckoning, and the foot row repeats the total under the
            figures it adds up. */}
        <p
          data-expense-summary
          className="text-xs text-zinc-600 @min-[40rem]/lines:hidden dark:text-zinc-400"
        >
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Total {money(summary.allCents)}
          </span>
          {summary.outstandingCents > 0
            ? ` · ${money(summary.outstandingCents)} outstanding`
            : ""}
        </p>
        <p
          data-expense-summary-full
          className="hidden text-xs text-zinc-600 @min-[40rem]/lines:block dark:text-zinc-400"
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
            aria-label="Add an expense line"
            className="h-9 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-40 @max-[40rem]/lines:w-10 @max-[40rem]/lines:px-0 @max-[40rem]/lines:text-base @max-[40rem]/lines:leading-none dark:bg-zinc-50 dark:text-black"
          >
            <span aria-hidden="true" className="@min-[40rem]/lines:hidden">
              +
            </span>
            <span className="@max-[40rem]/lines:sr-only">Add</span>
          </button>
        </div>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* The lines measure themselves against this list, not against the
          window. Six columns need 624px, and the list has the screen less the
          event rail and the page padding — so a tablet that `sm:` called wide
          gave them 416 to 544px and hid the last of them behind a sideways
          scroll. Wide enough gets columns; narrower gets a vertical group of
          labelled fields per line. */}
      <div className="mt-3">
        {/* The rows Enter walks down: every expense line, and then the blank
            one when it is open. They are marked from here rather than from
            the <ul>, because the blank line is that list's last row and sits
            outside it — the two have to be one list for Enter on the last
            expense to step into the blank rather than open a second one. */}
        <div data-list className={EXPENSE_OVERFLOW}>
          {/* Only where there is something under them to label. With no
              lines and nothing being added they were six words above an
              empty space. */}
          {/* Gone wherever the lines are stacked as well, since every field
              on every line carries its own name there. */}
          {(event.expenses.length > 0 || adding) && (
            <div
              className={`${EXPENSE_GRID} hidden px-1 pb-1 text-xs text-zinc-500 dark:text-zinc-500`}
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

          {/* Cards need air between them; rows in the grid do not. */}
          {/* The compact list gets a heading of its own, in the widths its
              lines use, so each word stands over its column. One row for the
              whole list rather than a label above every field, which is the
              room the compact line exists to save. */}
          {(event.expenses.length > 0 || adding) && (
            <div
              aria-hidden="true"
              data-line-headings
              className="flex items-center gap-1.5 px-1 pb-1 text-xs text-zinc-500 @min-[40rem]/lines:hidden dark:text-zinc-500"
            >
              <span className="min-w-0 flex-1">Description</span>
              <span data-heading-amount className="w-[4.75rem] shrink-0 text-right">
                Amount
              </span>
              <span className="w-5 shrink-0 text-center">✓</span>
              <span className="w-10 shrink-0" />
              <span className="w-10 shrink-0" />
            </div>
          )}

          {event.expenses.length > 0 && (
            <ul className="flex flex-col gap-1.5 @min-[40rem]/lines:gap-0.5">
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
              it adds up. On a phone there is no amount column to sit in, so
              the three figures spread across one line of their own — and the
              blanks that hold the empty columns apart go, since a flex row
              would space itself around them. */}
          {event.expenses.length > 0 && (
            <div
              className={`${EXPENSE_GRID} hidden border-t border-zinc-200 pt-1.5 dark:border-zinc-800`}
            >
              <div className="@min-[40rem]/lines:contents">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  Total
                </span>
                <span className="hidden @min-[40rem]/lines:block" />
                <span
                  data-expense-total
                  className="text-sm font-semibold text-black @min-[40rem]/lines:text-right dark:text-zinc-50"
                >
                  {money(summary.allCents)}
                </span>
                <span className="hidden @min-[40rem]/lines:block" />
                <span
                  data-expense-outstanding
                  className="text-xs text-zinc-600 dark:text-zinc-400"
                >
                  {summary.outstandingCents === 0
                    ? "all paid"
                    : `${money(summary.outstandingCents)} outstanding`}
                </span>
                <span className="hidden @min-[40rem]/lines:block" />
              </div>
            </div>
          )}

          {adding && (
            <div
              data-list-row
              className="mt-3 rounded-md border border-zinc-200 @min-[40rem]/lines:rounded-none @min-[40rem]/lines:border-0 dark:border-zinc-800"
            >
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
        <p className="mt-3 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          No expense lines yet. Whatever you add here is copied into your next
          event as a starting point.
        </p>
      )}

    </section>
  );
}
