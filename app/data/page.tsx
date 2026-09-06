"use client";

/**
 * Export and import: the whole store out to a file, and a file back in.
 *
 * Two columns, the same shape Manage events has — what goes out on the left,
 * what comes in on the right — because they are two halves of one job and
 * neither is a step in the other.
 *
 * Export writes one of three things. JSON is the backup and the only thing
 * import reads; CSV is three spreadsheets of everything, to open and look at;
 * the tables-and-guests list is what the door works from on the night, one
 * file per event, as an Excel workbook, as a web page, or as plain CSV.
 *
 * Where they are written is remembered between exports, and asked about
 * before every one, so a backup never quietly lands somewhere it was not
 * meant to.
 */

import { useState } from "react";
import { useEventContext } from "@/components/event-provider";
import {
  exportFiles,
  parseBackup,
  type Backup,
  type ExportFormat,
} from "@/lib/data-transfer";
import {
  canRememberFolder,
  downloadFiles,
  ensureWritable,
  pickFolder,
  writeToFolder,
} from "@/lib/file-access";
import { formatEventDate } from "@/lib/event-time";
import type { ImportMode } from "@/lib/repository";
import type { Event } from "@/lib/types";
import { describeError } from "@/lib/errors";

type Scope = "current" | "all" | "choose";
/** What the three radios offer. The door list then asks how it is written. */
type Kind = "json" | "csv" | "door";
/** How the door list is written. Each is the same rows in a different file. */
type DoorAs = "excel" | "csv" | "html";

const DOOR_FORMATS: readonly { as: DoorAs; label: string; note: string }[] = [
  { as: "excel", label: "Excel (.xls)", note: "tick and type in Excel" },
  { as: "html", label: "Web page (.html)", note: "tick and type in a browser" },
  { as: "csv", label: "CSV", note: "plain, for anything else" },
];

const cardClass =
  "rounded-lg border border-line-soft p-3";
const legendClass =
  "text-xs font-semibold text-ink-soft";
const choiceClass =
  "flex items-center gap-2 text-sm text-ink";
const buttonClass =
  "h-9 rounded-md bg-primary hover:bg-primary-hover transition-colors px-4 text-xs font-medium text-primary-ink disabled:opacity-40";
const quietButtonClass =
  "h-9 rounded-md border border-line px-3 text-xs font-medium text-ink disabled:opacity-40";

/** Newest first: a list of events to pick from is read from the top. */
function byDateDescending(a: Event, b: Event): number {
  return b.eventDate.localeCompare(a.eventDate) || a.name.localeCompare(b.name);
}

/** One event with a box beside it, for the lists on both sides of the screen. */
function EventChoice({
  event,
  checked,
  onChange,
  note,
}: {
  event: Event;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Said after the date, where one is worth saying. */
  note?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(changed) => onChange(changed.target.checked)}
        data-pick-event={event.id}
        aria-label={`${event.name}, ${formatEventDate(event.eventDate)}`}
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {event.name}
      </span>
      <span className="shrink-0 text-xs text-ink-muted tabular-nums">
        {formatEventDate(event.eventDate)}
        {note === undefined ? "" : ` · ${note}`}
      </span>
    </li>
  );
}

export default function DataScreen() {
  const {
    allEvents,
    expenseTemplates,
    settings,
    saveSetting,
    importData,
  } = useEventContext();

  /* ----------------------------------------------------------- exporting */

  const [scope, setScope] = useState<Scope>("current");
  const [kind, setKind] = useState<Kind>("json");
  /** Only asked about once the door list is the thing being exported. */
  const [doorAs, setDoorAs] = useState<DoorAs>("excel");

  const format: ExportFormat = kind === "door" ? `door-${doorAs}` : kind;
  /** Which events are ticked while the scope is "choose". */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  /**
   * Set when Export is pressed and a folder is already remembered: the
   * question about that folder is the step between pressing and writing.
   */
  const [askingFolder, setAskingFolder] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exported, setExported] = useState("");

  const sorted = [...allEvents].sort(byDateDescending);
  // "Current and future" in the app's own terms: an event stays active until
  // 48 hours after its date, so the active ones are exactly the ones not yet
  // behind us. Everything else is closed and only "all" reaches it.
  const current = sorted.filter((event) => event.status === "active");

  const chosen =
    scope === "all"
      ? sorted
      : scope === "current"
        ? current
        : sorted.filter((event) => picked.has(event.id));

  const folder = settings.exportDirectory;
  const canRemember = canRememberFolder();

  // Said before the button is pressed, because "3 files" and "1 file" are
  // different enough to want to know which is about to land in the folder.
  const fileCount =
    kind === "csv" ? 3 : kind === "door" ? chosen.length : 1;

  function clearExportResult() {
    setExportError("");
    setExported("");
  }

  /** Write the files, wherever this browser can write them. */
  async function write(target: FileSystemDirectoryHandle | null) {
    const files = exportFiles(format, chosen, expenseTemplates);
    setExporting(true);
    clearExportResult();

    try {
      if (target === null) {
        downloadFiles(files);
        setExported(
          `${files.length === 1 ? files[0].name : `${files.length} files`} saved by your browser.`,
        );
      } else {
        if (!(await ensureWritable(target))) {
          setExportError(
            "That folder cannot be written to until you allow it. Try again, or choose another folder.",
          );
          return;
        }
        await writeToFolder(target, files);
        setExported(
          `${files.length === 1 ? files[0].name : `${files.length} files`} written to ${target.name}.`,
        );
      }
    } catch (caught) {
      setExportError(describeError(caught));
    } finally {
      setExporting(false);
      setAskingFolder(false);
    }
  }

  /**
   * Pressing Export. With a folder already remembered this only raises the
   * question about it; the writing waits for the answer.
   */
  async function startExport() {
    clearExportResult();

    if (!canRemember) {
      await write(null);
      return;
    }
    if (folder !== null) {
      setAskingFolder(true);
      return;
    }
    await chooseFolderAndWrite();
  }

  /** Pick a folder, remember it, and write into it. */
  async function chooseFolderAndWrite() {
    clearExportResult();

    try {
      const picked = await pickFolder();
      // Closing the picker is a change of mind, not an error: the question
      // about the old folder simply stays open.
      if (picked === null) return;

      await saveSetting({ exportDirectory: picked });
      await write(picked);
    } catch (caught) {
      setExportError(describeError(caught));
      setAskingFolder(false);
    }
  }

  /* ----------------------------------------------------------- importing */

  const [incoming, setIncoming] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState("");
  const [bringing, setBringing] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<ImportMode>("add");
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [imported, setImported] = useState("");

  function forgetFile() {
    setIncoming(null);
    setFileName("");
    setBringing(new Set());
    setMode("add");
    setConfirmingReplace(false);
  }

  async function readFile(chosenFile: File | undefined) {
    setImportError("");
    setImported("");
    setConfirmingReplace(false);

    if (chosenFile === undefined) {
      forgetFile();
      return;
    }

    const read = parseBackup(await chosenFile.text());
    if ("error" in read) {
      forgetFile();
      setImportError(read.error);
      return;
    }

    setIncoming(read.backup);
    setFileName(chosenFile.name);
    // Everything ticked to begin with: bringing in the whole file is the
    // common case, and unticking is easier than hunting for what to tick.
    setBringing(new Set(read.backup.events.map((event) => event.id)));
  }

  const toImport =
    incoming === null
      ? []
      : incoming.events.filter((event) => bringing.has(event.id));

  const held = new Set(allEvents.map((event) => event.id));

  async function runImport() {
    if (incoming === null) return;

    if (mode === "replace" && !confirmingReplace) {
      setConfirmingReplace(true);
      return;
    }

    setImporting(true);
    setImportError("");
    setImported("");

    try {
      const outcome = await importData(
        toImport,
        incoming.expenseTemplates,
        mode,
      );

      const said = [
        `${outcome.added} event${outcome.added === 1 ? "" : "s"} imported`,
        outcome.removed > 0
          ? `${outcome.removed} replaced`
          : outcome.skipped > 0
            ? `${outcome.skipped} already here and left alone`
            : "",
        outcome.expenseLinesAdded > 0
          ? `${outcome.expenseLinesAdded} saved expense line${outcome.expenseLinesAdded === 1 ? "" : "s"} added`
          : "",
        outcome.pastRetention > 0
          ? `${outcome.pastRetention} past the retention window and due to be deleted when the app next loads`
          : "",
      ].filter((part) => part !== "");

      setImported(`${said.join(" · ")}.`);
      forgetFile();
    } catch (caught) {
      setImportError(describeError(caught));
    } finally {
      setImporting(false);
    }
  }

  /* --------------------------------------------------------------- screen */

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section data-column="export" className="@container">
        <h2 className="text-xl font-semibold text-ink">
          Export
        </h2>

        <div className={`mt-3 flex flex-col gap-3 ${cardClass}`}>
          <fieldset>
            <legend className={legendClass}>What to export</legend>
            <div className="mt-1.5 flex flex-col gap-1">
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "current"}
                  onChange={() => setScope("current")}
                  data-scope="current"
                  className="h-4 w-4"
                />
                Current and future events ({current.length})
              </label>
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  data-scope="all"
                  className="h-4 w-4"
                />
                All events ({sorted.length})
              </label>
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "choose"}
                  onChange={() => setScope("choose")}
                  data-scope="choose"
                  className="h-4 w-4"
                />
                Choose ({picked.size})
              </label>
            </div>

            {scope === "choose" && (
              <ul className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-line-soft p-2">
                {sorted.map((event) => (
                  <EventChoice
                    key={event.id}
                    event={event}
                    checked={picked.has(event.id)}
                    note={event.status === "closed" ? "closed" : undefined}
                    onChange={(on) =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (on) next.add(event.id);
                        else next.delete(event.id);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>Format</legend>
            <div className="mt-1.5 flex flex-col gap-1">
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="format"
                  checked={kind === "json"}
                  onChange={() => setKind("json")}
                  data-format="json"
                  className="h-4 w-4"
                />
                JSON
                <span className="text-xs text-ink-muted">
                  one file · imports back
                </span>
              </label>
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="format"
                  checked={kind === "csv"}
                  onChange={() => setKind("csv")}
                  data-format="csv"
                  className="h-4 w-4"
                />
                CSV
                <span className="text-xs text-ink-muted">
                  guests, tables, expenses · for a spreadsheet
                </span>
              </label>
              <label className={choiceClass}>
                <input
                  type="radio"
                  name="format"
                  checked={kind === "door"}
                  onChange={() => setKind("door")}
                  data-format="door"
                  className="h-4 w-4"
                />
                Tables and guests
                <span className="text-xs text-ink-muted">
                  one file per event · tick guests in at the door
                </span>
              </label>
            </div>

            {/* How the door list is written, asked only once it is what is
                being written. Indented under the choice it belongs to rather
                than sitting as a fourth thing of its own. */}
            {kind === "door" && (
              <div className="mt-1.5 ml-6 flex flex-col gap-1">
                {DOOR_FORMATS.map((option) => (
                  <label key={option.as} className={choiceClass}>
                    <input
                      type="radio"
                      name="doorAs"
                      checked={doorAs === option.as}
                      onChange={() => setDoorAs(option.as)}
                      data-door-format={option.as}
                      className="h-4 w-4"
                    />
                    {option.label}
                    <span className="text-xs text-ink-muted">
                      {option.note}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {/* The folder, and the question about it. It only appears where the
              browser can hold on to one: everywhere else the file goes to
              downloads and there is nothing to ask. */}
          {canRemember && folder !== null && !askingFolder && (
            <p
              data-export-folder
              className="text-xs text-ink-muted"
            >
              Saving to <span className="font-medium">{folder.name}</span>
            </p>
          )}

          {askingFolder ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">
                Still saving to{" "}
                <span className="font-semibold">{folder?.name}</span>?
              </span>
              <button
                type="button"
                onClick={() => void write(folder)}
                disabled={exporting}
                data-export-here
                className={buttonClass}
              >
                {exporting ? "Saving…" : "Save here"}
              </button>
              <button
                type="button"
                onClick={() => void chooseFolderAndWrite()}
                disabled={exporting}
                data-export-elsewhere
                className={quietButtonClass}
              >
                Choose another folder
              </button>
              <button
                type="button"
                onClick={() => setAskingFolder(false)}
                disabled={exporting}
                className={quietButtonClass}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void startExport()}
                disabled={exporting || chosen.length === 0}
                data-export
                className={buttonClass}
              >
                {exporting ? "Exporting…" : "Export"}
              </button>
              <span className="text-xs text-ink-muted">
                {chosen.length} event{chosen.length === 1 ? "" : "s"} ·{" "}
                {fileCount} file{fileCount === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {exportError !== "" && (
            <p role="alert" className="text-sm text-danger">
              {exportError}
            </p>
          )}
          {exported !== "" && (
            <p
              data-export-done
              className="text-sm text-positive"
            >
              {exported}
            </p>
          )}
        </div>
      </section>

      <section data-column="import" className="@container">
        <h2 className="text-xl font-semibold text-ink">
          Import
        </h2>

        <div className={`mt-3 flex flex-col gap-3 ${cardClass}`}>
          <label className="flex flex-col gap-1">
            <span className={legendClass}>Backup file</span>
            <input
              type="file"
              accept=".json,application/json"
              data-import-file
              onChange={(changed) => void readFile(changed.target.files?.[0])}
              className="text-sm text-ink file:mr-3 file:h-9 file:rounded-md file:border file:border-line file:bg-transparent file:px-3 file:text-xs file:font-medium dark:file:border-line dark:file:text-ink"
            />
          </label>

          {incoming !== null && (
            <>
              <p className="text-xs text-ink-muted">
                <span className="font-medium">{fileName}</span> ·{" "}
                {incoming.exportedAt === 0
                  ? "no date in the file"
                  : `written ${new Date(incoming.exportedAt).toLocaleString()}`}{" "}
                · {incoming.events.length} event
                {incoming.events.length === 1 ? "" : "s"}
              </p>

              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-line-soft p-2">
                {[...incoming.events].sort(byDateDescending).map((event) => (
                  <EventChoice
                    key={event.id}
                    event={event}
                    checked={bringing.has(event.id)}
                    note={held.has(event.id) ? "already here" : undefined}
                    onChange={(on) =>
                      setBringing((current) => {
                        const next = new Set(current);
                        if (on) next.add(event.id);
                        else next.delete(event.id);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>

              <fieldset>
                <legend className={legendClass}>
                  What to do with what is already here
                </legend>
                <div className="mt-1.5 flex flex-col gap-1">
                  <label className={choiceClass}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "add"}
                      onChange={() => {
                        setMode("add");
                        setConfirmingReplace(false);
                      }}
                      data-import-mode="add"
                      className="h-4 w-4"
                    />
                    Add what is missing
                    <span className="text-xs text-ink-muted">
                      events already here are left alone
                    </span>
                  </label>
                  <label className={choiceClass}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "replace"}
                      onChange={() => setMode("replace")}
                      data-import-mode="replace"
                      className="h-4 w-4"
                    />
                    Replace everything
                    <span className="text-xs text-ink-muted">
                      every event here is deleted first
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                {confirmingReplace && (
                  /* Names what goes, because none of it comes back. */
                  <span className="text-sm text-danger">
                    Delete all {allEvents.length} event
                    {allEvents.length === 1 ? "" : "s"} here and put back{" "}
                    {toImport.length} from the file?
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void runImport()}
                  disabled={importing || toImport.length === 0}
                  data-import
                  className={
                    confirmingReplace
                      ? "h-9 rounded-md bg-danger hover:bg-danger-hover transition-colors px-4 text-xs font-medium text-danger-ink disabled:opacity-40"
                      : buttonClass
                  }
                >
                  {importing
                    ? "Importing…"
                    : confirmingReplace
                      ? "Replace"
                      : `Import ${toImport.length} event${toImport.length === 1 ? "" : "s"}`}
                </button>
                <button
                  type="button"
                  onClick={forgetFile}
                  disabled={importing}
                  className={quietButtonClass}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {importError !== "" && (
            <p role="alert" className="text-sm text-danger">
              {importError}
            </p>
          )}
          {imported !== "" && (
            <p
              data-import-done
              className="text-sm text-positive"
            >
              {imported}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
