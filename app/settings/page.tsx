"use client";

/**
 * Settings: the few things that are true of the app rather than of an event.
 *
 * Every one of them is a closed line reading its own name and what it is
 * currently set to, and opens when it is asked to. Settings are read far more
 * often than they are changed — most visits here are to check what something
 * is, not to make it something else — so the answer is on the line and the
 * controls are behind it. One opens at a time: this is a list of unrelated
 * things, and a screen of open forms is what the list is instead of.
 *
 * The export folder is shown rather than picked here. Choosing one has to
 * happen inside the click that exports, or the browser refuses it, so
 * Export/Import owns that and this owns only the forgetting.
 */

import { useState } from "react";
import Link from "next/link";
import { useEventContext } from "@/components/event-provider";
import { FIELD_LABEL_CLASS } from "@/components/form-styles";
import { CURRENCIES, currencyName } from "@/lib/currency";
import { canRememberFolder } from "@/lib/file-access";
import { formatEventDate } from "@/lib/event-time";
import { describeError } from "@/lib/errors";
import { formatAmount } from "@/lib/money";
import { purgeAt } from "@/lib/repository";
import {
  MAX_RETENTION_DAYS,
  MAX_SEAT_COUNT,
  MIN_RETENTION_DAYS,
} from "@/lib/types";
import { DATA_PATH } from "@/lib/event-routes";

type Section = "retention" | "seats" | "currency" | "folder" | "wipe";

const numberFieldClass =
  "h-9 w-20 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const buttonClass =
  "h-9 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-black";
const quietButtonClass =
  "h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50";

/** An example amount, so a currency can be seen rather than imagined. */
const EXAMPLE_CENTS = 125050;

/** Drawn rather than fetched: the dependency list stays as it is. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

/**
 * One setting: its name, what it is set to, and its controls once opened.
 *
 * The whole closed line is the button, so it is a large target and reads as
 * one thing rather than as a label with a control hiding beside it.
 */
function Setting({
  name,
  value,
  open,
  onToggle,
  danger = false,
  children,
}: {
  name: string;
  /** What it is set to, said in as few words as it can be. */
  value: string;
  open: boolean;
  onToggle: () => void;
  /** The one that deletes things, ruled off in red. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-setting={name}
      className={`rounded-lg border ${
        danger
          ? "border-red-300 dark:border-red-900"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={`shrink-0 text-sm font-semibold ${
            danger
              ? "text-red-700 dark:text-red-400"
              : "text-black dark:text-zinc-50"
          }`}
        >
          {name}
        </span>
        <span className="ml-auto truncate text-sm text-zinc-600 dark:text-zinc-400">
          {value}
        </span>
        <Caret open={open} />
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsScreen() {
  const { allEvents, settings, saveSetting, deleteAllData } = useEventContext();

  const [open, setOpen] = useState<Section | null>(null);
  const [days, setDays] = useState(String(settings.retentionDays));
  const [seats, setSeats] = useState(String(settings.defaultSeatCount));
  const [currency, setCurrency] = useState(settings.currency);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [wiped, setWiped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  /**
   * The clock, read once when the screen opens.
   *
   * Which closed events are past a deadline is worked out during render, and
   * a render must give the same answer every time it runs — `Date.now()`
   * called there would not, and would have the warning below counting a
   * different number of events each time React happened to re-render.
   */
  const [now] = useState(() => Date.now());

  // The stored values win when they change underneath, so a refused save never
  // leaves a field showing something that was never written.
  const [lastSaved, setLastSaved] = useState(settings);
  if (lastSaved !== settings) {
    setLastSaved(settings);
    setDays(String(settings.retentionDays));
    setSeats(String(settings.defaultSeatCount));
    setCurrency(settings.currency);
  }

  function show(section: Section) {
    setOpen((current) => (current === section ? null : section));
    setError("");
    setSaved("");
    setWiped("");
    setConfirmingWipe(false);
  }

  /**
   * Save one setting, and say so. Each has its own button rather than one
   * Save for the screen: they are unrelated, and changing the seat count
   * should not leave anyone wondering what else went with it.
   */
  async function save(patch: Partial<typeof settings>, said: string) {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      await saveSetting(patch);
      setSaved(said);
    } catch (caught) {
      setError(describeError(caught));
      setDays(String(settings.retentionDays));
      setSeats(String(settings.defaultSeatCount));
      setCurrency(settings.currency);
    } finally {
      setSaving(false);
    }
  }

  async function wipe() {
    setSaving(true);
    setError("");
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

  /* --------------------------------------------------------- what is set */

  const closed = allEvents.filter((event) => event.status === "closed");

  const typedDays = days.trim();
  const wantedDays = typedDays === "" ? Number.NaN : Number(typedDays);
  const daysChanged =
    Number.isInteger(wantedDays) && wantedDays !== settings.retentionDays;

  const typedSeats = seats.trim();
  const wantedSeats = typedSeats === "" ? Number.NaN : Number(typedSeats);
  const seatsChanged =
    Number.isInteger(wantedSeats) && wantedSeats !== settings.defaultSeatCount;

  const currencyChanged = currency !== settings.currency;

  /**
   * Closed events the new period would put past their deadline.
   *
   * Shortening the period is the one change on this screen that destroys
   * anything by accident, and it destroys it silently — the sweep runs on the
   * next app start, not on Save, so the events would simply not be there the
   * next time the app was opened. Counting them first is the difference
   * between a setting and a trapdoor.
   */
  const nowDue = Number.isInteger(wantedDays)
    ? closed.filter((event) => {
        const deadline = purgeAt(event, wantedDays);
        return deadline !== null && now >= deadline;
      })
    : [];

  const folder = settings.exportDirectory;

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

  /** Shown inside whichever section is open, since that is what it is about. */
  const outcome = (
    <>
      {error !== "" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {saved !== "" && (
        <p
          data-setting-saved
          className="text-sm text-emerald-700 dark:text-emerald-500"
        >
          {saved}
        </p>
      )}
    </>
  );

  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        Settings
      </h1>

      <div className="mt-3 flex flex-col gap-2">
        {/* ---------------------------------------------------- retention */}

        <Setting
          name="Closed events"
          value={`Kept ${settings.retentionDays} day${settings.retentionDays === 1 ? "" : "s"}`}
          open={open === "retention"}
          onToggle={() => show("retention")}
        >
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
              onChange={(changed) => {
                setDays(changed.target.value);
                setError("");
                setSaved("");
              }}
              className={numberFieldClass}
            />
            days after they close, then deleted.
          </label>

          <p className={FIELD_LABEL_CLASS}>
            An event closes 48 hours after its date. {closed.length} closed
            event{closed.length === 1 ? "" : "s"} kept
            {closed.length > 0
              ? `, oldest ${formatEventDate(
                  closed
                    .map((event) => event.eventDate)
                    .sort((a, b) => a.localeCompare(b))[0],
                )}`
              : ""}
            .
          </p>

          {wantedDays === 0 && (
            <p
              data-retention-zero
              className="text-sm text-amber-700 dark:text-amber-500"
            >
              At zero a closed event is deleted by the same sweep that closes
              it, and never appears under Closed at all.
            </p>
          )}

          {daysChanged && nowDue.length > 0 && (
            <p
              data-retention-warning
              className="text-sm text-amber-700 dark:text-amber-500"
            >
              {nowDue.length} closed event{nowDue.length === 1 ? "" : "s"} would
              already be past {wantedDays} days, and would be deleted when the
              app next starts: {nowDue.map((event) => event.name).join(", ")}.
              Export{" "}
              <Link href={DATA_PATH} className="underline">
                a backup
              </Link>{" "}
              first if you want to keep them.
            </p>
          )}

          {outcome}

          <div>
            <button
              type="button"
              onClick={() =>
                void save(
                  { retentionDays: wantedDays },
                  `Closed events are kept ${wantedDays} day${wantedDays === 1 ? "" : "s"}.`,
                )
              }
              disabled={saving || !daysChanged}
              data-save-retention
              className={buttonClass}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Setting>

        {/* ---------------------------------------------------- new tables */}

        <Setting
          name="New tables"
          value={`${settings.defaultSeatCount} seats`}
          open={open === "seats"}
          onToggle={() => show("seats")}
        >
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
              onChange={(changed) => {
                setSeats(changed.target.value);
                setError("");
                setSaved("");
              }}
              className={numberFieldClass}
            />
            seats.
          </label>

          <p className={FIELD_LABEL_CLASS}>
            What the tables block on Manage events fills in for you. Any table
            can still be given a different number of seats.
          </p>

          {outcome}

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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Setting>

        {/* ------------------------------------------------------ currency */}

        <Setting
          name="Currency"
          value={currencyName(settings.currency)}
          open={open === "currency"}
          onToggle={() => show("currency")}
        >
          <label className="flex flex-wrap items-center gap-2 text-sm text-black dark:text-zinc-50">
            Amounts are in
            <select
              value={currency}
              disabled={saving}
              aria-label="Currency amounts are shown in"
              data-currency
              onChange={(changed) => {
                setCurrency(changed.target.value);
                setError("");
                setSaved("");
              }}
              className="h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">None</option>
              {CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <p className={FIELD_LABEL_CLASS}>
            An amount then reads{" "}
            <span
              data-currency-example
              className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200"
            >
              {formatAmount(EXAMPLE_CENTS, currency)}
            </span>
            . On screen only — exports keep writing bare numbers, because a
            symbol in a spreadsheet cell makes it text and a spreadsheet cannot
            add up text.
          </p>

          {outcome}

          <div>
            <button
              type="button"
              onClick={() =>
                void save(
                  { currency },
                  currency === ""
                    ? "Amounts are shown without a currency."
                    : `Amounts are shown as ${formatAmount(EXAMPLE_CENTS, currency)}.`,
                )
              }
              disabled={saving || !currencyChanged}
              data-save-currency
              className={buttonClass}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Setting>

        {/* ------------------------------------------------- export folder */}

        {canRememberFolder() && (
          <Setting
            name="Export folder"
            value={folder === null ? "None remembered" : folder.name}
            open={open === "folder"}
            onToggle={() => show("folder")}
          >
            {folder === null ? (
              <p className={FIELD_LABEL_CLASS}>
                None remembered. The first export asks for one.
              </p>
            ) : (
              <div>
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
          </Setting>
        )}

        {/* ---------------------------------------------------------- wipe */}

        <Setting
          name="Delete everything"
          value={
            held.events === 0
              ? "Nothing stored"
              : `${held.events} event${held.events === 1 ? "" : "s"} stored`
          }
          open={open === "wipe"}
          onToggle={() => show("wipe")}
          danger
        >
          {/* The wording is the manager's own. Export/Import stays a link
              inside it: the sentence suggests going there, and a suggestion
              worth making is worth being one press. */}
          <p className={FIELD_LABEL_CLASS}>
            This will delete every event and all expense lines. There is no
            undo. It is suggested that you use{" "}
            <Link href={DATA_PATH} className="underline">
              Export/Import
            </Link>{" "}
            to create a backup in case you need to restore the data later.
          </p>

          {wiped !== "" && (
            <p
              data-wiped
              className="text-sm text-emerald-700 dark:text-emerald-500"
            >
              {wiped}
            </p>
          )}
          {error !== "" && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
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
                disabled={saving || held.events === 0}
                data-wipe
                className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
              >
                Delete everything
              </button>
            </div>
          )}
        </Setting>
      </div>
    </section>
  );
}
