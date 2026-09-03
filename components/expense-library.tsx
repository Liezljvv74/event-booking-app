"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/money";
import type { ExpenseTemplate } from "@/lib/types";

interface Props {
  templates: readonly ExpenseTemplate[];
  /** Descriptions on this event, so an entry in use can be marked as such. */
  usedDescriptions: readonly string[];
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
 * The library of cleared expense lines.
 *
 * Picking one happens in the Description dropdown of each expense line, not
 * here — this is where the library is looked over and pruned. The spec keeps
 * a cleared line rather than destroying it, and asks separately for a way to
 * be rid of one for good; that deletion sits behind a Manage list and a
 * confirm, because nothing brings it back.
 */
export function ExpenseLibrary({
  templates,
  usedDescriptions,
  onForget,
}: Props) {
  const [managing, setManaging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nothing has been cleared yet, so there is nothing to look over. The
  // screen already explains that clearing a line saves it.
  if (templates.length === 0) return null;

  const used = new Set(
    usedDescriptions.map((description) => description.trim().toLowerCase()),
  );
  const inUse = templates.filter((template) =>
    used.has(template.description.trim().toLowerCase()),
  ).length;

  async function forget(templateId: string) {
    setBusy(true);
    setError("");
    try {
      await onForget(templateId);
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
        <p
          data-library-summary
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {templates.length} cleared line{templates.length === 1 ? "" : "s"}{" "}
          kept for reuse
          {inUse > 0 ? ` · ${inUse} in use on this event` : ""}
        </p>

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

      <p className="mt-1.5 max-w-prose text-xs text-zinc-600 dark:text-zinc-400">
        Pick one from the dropdown on any line&apos;s Description. A saved line
        already in use here is not offered again until that line is cleared.
      </p>

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
            {templates.map((template) => {
              const held = used.has(template.description.trim().toLowerCase());
              return (
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
                  {held && (
                    <span
                      data-library-held={template.id}
                      className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      in use here
                    </span>
                  )}
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
                          onClick={() => void forget(template.id)}
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
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
