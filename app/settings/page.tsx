"use client";

/**
 * Settings: the few things that are true of the app rather than of an event.
 *
 * There are two, and both were already stored and already read — the
 * retention period by the sweep that runs on every app start, the export
 * folder by the Export screen. Neither could be changed from anywhere until
 * now, which is what this screen is for. It is not a place to collect
 * preferences nobody asked for.
 *
 * The folder is shown rather than picked here. Choosing one has to happen
 * inside the click that exports, or the browser refuses it, so Export owns
 * that and this owns only the forgetting.
 */

import { useState } from "react";
import { useEventContext } from "@/components/event-provider";
import { FIELD_LABEL_CLASS } from "@/components/form-styles";
import { canRememberFolder } from "@/lib/file-access";
import { formatEventDate } from "@/lib/event-time";
import { describeError } from "@/lib/errors";
import { purgeAt } from "@/lib/repository";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/lib/types";
import { DATA_PATH } from "@/lib/event-routes";
import Link from "next/link";

const cardClass = "rounded-lg border border-zinc-200 p-3 dark:border-zinc-800";
const headingClass =
  "text-xs font-semibold text-zinc-700 dark:text-zinc-300";
const buttonClass =
  "h-9 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-black";
const quietButtonClass =
  "h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50";

export default function SettingsScreen() {
  const { allEvents, settings, saveRetentionDays, saveExportFolder } =
    useEventContext();

  const [days, setDays] = useState(String(settings.retentionDays));
  /**
   * The clock, read once when the screen opens.
   *
   * Which closed events are past a deadline is worked out during render, and
   * a render must give the same answer every time it runs — `Date.now()`
   * called there would not, and would have the warning below counting a
   * different number of events each time React happened to re-render.
   */
  const [now] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  // The stored value wins when it changes underneath, so a refused save never
  // leaves the field showing a number that was never written.
  const [lastSaved, setLastSaved] = useState(settings.retentionDays);
  if (lastSaved !== settings.retentionDays) {
    setLastSaved(settings.retentionDays);
    setDays(String(settings.retentionDays));
  }

  const closed = allEvents.filter((event) => event.status === "closed");
  /**
   * What is in the box, or NaN when it is not a number.
   *
   * The empty string is spelled out rather than left to `Number`, which reads
   * it as 0 — and 0 is a real setting now, the one that deletes a closed event
   * the moment it closes. A cleared field would otherwise arm the most
   * destructive value on the screen and light up Save to go with it.
   */
  const typed = days.trim();
  const wanted = typed === "" ? Number.NaN : Number(typed);
  const changed =
    Number.isInteger(wanted) && wanted !== settings.retentionDays;

  /**
   * Closed events the new period would put past their deadline.
   *
   * Shortening the period is the one change on this screen that destroys
   * anything, and it destroys it silently — the sweep runs on the next app
   * start, not on Save, so the events would simply not be there the next time
   * the app was opened. Counting them first is the difference between a
   * setting and a trapdoor.
   */
  const nowDue = Number.isInteger(wanted)
    ? closed.filter((event) => {
        const deadline = purgeAt(event, wanted);
        return deadline !== null && now >= deadline;
      })
    : [];

  async function save() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      await saveRetentionDays(wanted);
      setSaved(
        `Closed events are kept ${wanted} day${wanted === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      setError(describeError(caught));
      setDays(String(settings.retentionDays));
    } finally {
      setSaving(false);
    }
  }

  const folder = settings.exportDirectory;

  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        Settings
      </h1>

      {/* ------------------------------------------------------ retention */}

      <div className={`mt-3 flex flex-col gap-2 ${cardClass}`}>
        <div className={headingClass}>Closed events</div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-black dark:text-zinc-50">
          Kept for
          <input
            type="number"
            min={MIN_RETENTION_DAYS}
            max={MAX_RETENTION_DAYS}
            step={1}
            inputMode="numeric"
            value={days}
            disabled={saving}
            aria-label="Days a closed event is kept"
            data-retention-days
            onChange={(changedField) => {
              setDays(changedField.target.value);
              setError("");
              setSaved("");
            }}
            className="h-9 w-20 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          days after they close, then deleted.
        </label>

        {/* Zero is allowed and does not read as a duration, so it says what
            it does instead of leaving "kept for 0 days" to be worked out. */}
        {wanted === 0 && (
          <p
            data-retention-zero
            className="text-sm text-amber-700 dark:text-amber-500"
          >
            At zero a closed event is deleted by the same sweep that closes
            it, and never appears under Closed at all.
          </p>
        )}

        <p className={FIELD_LABEL_CLASS}>
          An event closes 48 hours after its date. {closed.length} closed event
          {closed.length === 1 ? "" : "s"} kept
          {closed.length > 0
            ? `, oldest ${formatEventDate(
                closed
                  .map((event) => event.eventDate)
                  .sort((a, b) => a.localeCompare(b))[0],
              )}`
            : ""}
          .
        </p>

        {/* The one thing on this screen that can destroy anything, said
            before it is done rather than discovered afterwards. */}
        {changed && nowDue.length > 0 && (
          <p
            data-retention-warning
            className="text-sm text-amber-700 dark:text-amber-500"
          >
            {nowDue.length} closed event{nowDue.length === 1 ? "" : "s"} would
            already be past {wanted} days, and would be deleted when the app
            next starts: {nowDue.map((event) => event.name).join(", ")}. Export
            {" "}
            <Link href={DATA_PATH} className="underline">
              a backup
            </Link>{" "}
            first if you want to keep them.
          </p>
        )}

        {error !== "" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {saved !== "" && (
          <p
            data-retention-saved
            className="text-sm text-emerald-700 dark:text-emerald-500"
          >
            {saved}
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !changed}
            data-save-retention
            className={buttonClass}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- export folder */}

      {canRememberFolder() && (
        <div className={`mt-3 flex flex-col gap-2 ${cardClass}`}>
          <div className={headingClass}>Export folder</div>

          {folder === null ? (
            <p className={FIELD_LABEL_CLASS}>
              None remembered. The first export asks for one.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-black dark:text-zinc-50">
                {folder.name}
              </span>
              <button
                type="button"
                onClick={() => void saveExportFolder(null)}
                data-forget-folder
                className={quietButtonClass}
              >
                Forget this folder
              </button>
            </div>
          )}

          <p className={FIELD_LABEL_CLASS}>
            Chosen on{" "}
            <Link href={DATA_PATH} className="underline">
              Export/Import
            </Link>
            , where the picker has to open inside the press that exports.
          </p>
        </div>
      )}
    </section>
  );
}
