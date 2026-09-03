"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/money";
import type { ExpenseTemplate } from "@/lib/types";

interface Props {
  templates: readonly ExpenseTemplate[];
  /** Descriptions already on this event, so repeats can be pointed out. */
  usedDescriptions: readonly string[];
  onReuse: (templateId: string) => Promise<unknown>;
  onForget: (templateId: string) => Promise<unknown>;
}

/** "3 Oct 2026" from a stored timestamp. */
function formatUsed(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Cleared expense lines, offered back for this event.
 *
 * The spec keeps a removed line item available for later events rather than
 * destroying it, and asks separately for a way to be rid of one for good.
 * Those are opposite intentions, so they get opposite weights here: reuse is
 * one pick from a dropdown, while forgetting sits behind a Manage list and a
 * confirm, because nothing brings it back.
 */
export function ExpenseLibrary({
  templates,
  usedDescriptions,
  onReuse,
  onForget,
}: Props) {
  const [managing, setManaging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nothing has been cleared yet, so there is nothing to offer. The screen
  // already explains that clearing a line saves it.
  if (templates.length === 0) return null;

  const used = new Set(
    usedDescriptions.map((description) => description.trim().toLowerCase()),
  );

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      setConfirming(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-expense-library
      className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Saved lines
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {templates.length} cleared line
          {templates.length === 1 ? "" : "s"} kept for reuse
        </p>

        {/* Picking is the action, so it happens on choosing rather than
            behind a second button, as everywhere else in the app. The value
            stays empty so the label returns after each pick. */}
        <label className="flex items-center gap-2">
          <span className="sr-only">Reuse a saved line</span>
          <select
            value=""
            disabled={busy}
            data-reuse-expense
            onChange={(changed) => {
              const templateId = changed.target.value;
              if (templateId === "") return;
              void run(() => onReuse(templateId));
            }}
            className="h-9 max-w-[18rem] rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Reuse a saved line…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {`${template.description} · ${formatAmount(template.amountCents)}`}
                {used.has(template.description.trim().toLowerCase())
                  ? " (already on this event)"
                  : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setManaging((was) => !was);
            setConfirming(null);
          }}
          aria-expanded={managing}
          data-manage-library
          className="ml-auto h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
        >
          {managing ? "Done" : "Manage"}
        </button>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {managing && (
        <>
          <p className="mt-2 max-w-prose text-xs text-zinc-600 dark:text-zinc-400">
            Deleting here is permanent. It removes the line from this list for
            every future event, and leaves any line already added to an event
            untouched.
          </p>

          <ul
            data-library-list
            className="mt-2 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800"
          >
            {templates.map((template) => (
              <li
                key={template.id}
                data-library-entry={template.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="text-sm text-black dark:text-zinc-50">
                  {template.description}
                </span>
                <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatAmount(template.amountCents)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  last used {formatUsed(template.lastUsedAt)}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  {confirming === template.id ? (
                    <>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        Delete for good?
                      </span>
                      <button
                        type="button"
                        onClick={() => void run(() => onForget(template.id))}
                        disabled={busy}
                        data-confirm-forget={template.id}
                        className="h-9 rounded-md bg-red-600 px-3 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy}
                        className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(template.id)}
                      disabled={busy}
                      data-forget={template.id}
                      aria-label={`Delete ${template.description} for good`}
                      className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                    >
                      Delete for good
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
