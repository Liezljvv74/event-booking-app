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
import {
  MAX_CURRENCY_SYMBOL,
  MAX_RETENTION_DAYS,
  MAX_SEAT_COUNT,
  MIN_RETENTION_DAYS,
} from "@/lib/types";
import { formatAmount } from "@/lib/money";
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
  const { allEvents, settings, saveSetting, deleteAllData } =
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
  const [seats, setSeats] = useState(String(settings.defaultSeatCount));
  const [symbol, setSymbol] = useState(settings.currencySymbol);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [wiped, setWiped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  // The stored value wins when it changes underneath, so a refused save never
  // leaves the field showing a number that was never written.
  const [lastSaved, setLastSaved] = useState(settings);
  if (lastSaved !== settings) {
    setLastSaved(settings);
    setDays(String(settings.retentionDays));
    setSeats(String(settings.defaultSeatCount));
    setSymbol(settings.currencySymbol);
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

  /**
   * Save one field, and say so. Each card has its own button rather than one
   * Save for the screen: they are unrelated settings, and a person changing
   * the seat count should not have to wonder what else went with it.
   */
  async function save(patch: Partial<typeof settings>, said: string) {
    setSaving(true);
    setError("");
    setSaved("");
    setWiped("");
    try {
      await saveSetting(patch);
      setSaved(said);
    } catch (caught) {
      setError(describeError(caught));
      setDays(String(settings.retentionDays));
      setSeats(String(settings.defaultSeatCount));
      setSymbol(settings.currencySymbol);
    } finally {
      setSaving(false);
    }
  }

  async function wipe() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const gone = await deleteAllData();
      setConfirmingWipe(false);
      setWiped(
        `${gone.events} event${gone.events === 1 ? "" : "s"} and ${gone.expenseLines} saved expense line${gone.expenseLines === 1 ? "" : "s"} deleted. Your settings are as they were.`,
      );
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  const folder = settings.exportDirectory;

  const wantedSeats = seats.trim() === "" ? Number.NaN : Number(seats);
  const seatsChanged =
    Number.isInteger(wantedSeats) && wantedSeats !== settings.defaultSeatCount;
  const symbolChanged = symbol.trim() !== settings.currencySymbol;

  /** What Delete everything would take, so it can be named before it runs. */
  const held = {
    events: allEvents.length,
    bookings: allEvents.reduce((sum, event) => sum + event.bookings.length, 0),
    guests: allEvents.reduce(
      (sum, event) =>
        sum +
        event.bookings.reduce(
          (people, booking) => people + booking.attendees.length,
          0,
        ),
      0,
    ),
  };

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
            onClick={() =>
              void save(
                { retentionDays: wanted },
                `Closed events are kept ${wanted} day${wanted === 1 ? "" : "s"}.`,
              )
            }
            disabled={saving || !changed}
            data-save-retention
            className={buttonClass}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ new tables */}

      <div className={`mt-3 flex flex-col gap-2 ${cardClass}`}>
        <div className={headingClass}>New tables</div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-black dark:text-zinc-50">
          A table starts with
          <input
            type="number"
            min={1}
            max={MAX_SEAT_COUNT}
            step={1}
            inputMode="numeric"
            value={seats}
            disabled={saving}
            aria-label="Seats a new table starts with"
            data-default-seats
            onChange={(changedField) => {
              setSeats(changedField.target.value);
              setError("");
              setSaved("");
            }}
            className="h-9 w-20 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          seats.
        </label>

        <p className={FIELD_LABEL_CLASS}>
          What the tables block on Manage events fills in for you. Any table
          can still be given a different number of seats.
        </p>

        <div>
          <button
            type="button"
            onClick={() =>
              void save(
                { defaultSeatCount: wantedSeats },
                `New tables start with ${wantedSeats} seats.`,
              )
            }
            disabled={saving || !seatsChanged}
            data-save-seats
            className={buttonClass}
          >
            Save
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------- currency */}

      <div className={`mt-3 flex flex-col gap-2 ${cardClass}`}>
        <div className={headingClass}>Currency</div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-black dark:text-zinc-50">
          Amounts read
          <input
            type="text"
            maxLength={MAX_CURRENCY_SYMBOL}
            value={symbol}
            disabled={saving}
            placeholder="none"
            aria-label="Symbol shown before an amount"
            data-currency-symbol
            onChange={(changedField) => {
              setSymbol(changedField.target.value);
              setError("");
              setSaved("");
            }}
            className="h-9 w-16 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span data-currency-example className="tabular-nums">
            {formatAmount(125050, symbol.trim())}
          </span>
        </label>

        <p className={FIELD_LABEL_CLASS}>
          On screen only. Exports keep writing bare numbers, because a symbol
          in a spreadsheet cell makes it text and a spreadsheet cannot add up
          text. Leave it empty for no symbol at all.
        </p>

        <div>
          <button
            type="button"
            onClick={() =>
              void save(
                { currencySymbol: symbol },
                symbol.trim() === ""
                  ? "Amounts are shown without a symbol."
                  : `Amounts are shown as ${formatAmount(125050, symbol.trim())}.`,
              )
            }
            disabled={saving || !symbolChanged}
            data-save-currency
            className={buttonClass}
          >
            Save
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
                onClick={() => void saveSetting({ exportDirectory: null })}
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
      {/* ------------------------------------------------------------ wipe */}

      {/* Last on the screen and ruled off in red, because it is the one thing
          here that cannot be undone and should not be reachable by a stray
          press on the way to something else. */}
      <div className="mt-6 flex flex-col gap-2 rounded-lg border border-red-300 p-3 dark:border-red-900">
        <div className="text-xs font-semibold text-red-700 dark:text-red-400">
          Delete everything
        </div>

        <p className={FIELD_LABEL_CLASS}>
          Every event and every saved expense line, gone from this browser.
          There is no undo and nothing is kept anywhere else — take a backup on{" "}
          <Link href={DATA_PATH} className="underline">
            Export/Import
          </Link>{" "}
          first if there is any doubt. Your settings stay as they are.
        </p>

        {wiped !== "" && (
          <p
            data-wiped
            className="text-sm text-emerald-700 dark:text-emerald-500"
          >
            {wiped}
          </p>
        )}

        {confirmingWipe ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Names what goes, because none of it comes back. */}
            <span className="text-sm text-red-700 dark:text-red-400">
              Delete {held.events} event{held.events === 1 ? "" : "s"},{" "}
              {held.bookings} booking{held.bookings === 1 ? "" : "s"} and{" "}
              {held.guests} guest{held.guests === 1 ? "" : "s"}?
            </span>
            <button
              type="button"
              onClick={() => void wipe()}
              disabled={saving}
              data-confirm-wipe
              className="h-9 rounded-md bg-red-600 px-4 text-xs font-medium text-white disabled:opacity-40"
            >
              {saving ? "Deleting…" : "Delete everything"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingWipe(false)}
              disabled={saving}
              className={quietButtonClass}
            >
              Keep it
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                setConfirmingWipe(true);
                setWiped("");
              }}
              disabled={saving || allEvents.length === 0}
              data-wipe
              className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
            >
              {allEvents.length === 0
                ? "Nothing stored to delete"
                : "Delete everything"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
