"use client";

import { useState } from "react";
import type { Booking } from "@/lib/types";

interface Props {
  booking: Booking;
  onSave: (details: { partyName: string; telephone: string }) => Promise<unknown>;
  onCancel: () => void;
}

const fieldClass =
  "h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-xs text-zinc-600 dark:text-zinc-400";

/**
 * Edits the party's own details. Guest names, tables, statuses and prices are
 * edited per guest in the rows below, so they are deliberately absent here.
 */
export function PartyDetailsForm({ booking, onSave, onCancel }: Props) {
  const [partyName, setPartyName] = useState(booking.partyName);
  const [telephone, setTelephone] = useState(booking.telephone);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ partyName, telephone });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      data-party-form={booking.id}
      className="mt-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className={labelClass}>Party name</span>
          <input
            type="text"
            value={partyName}
            disabled={saving}
            data-party-name-input={booking.id}
            onChange={(changed) => setPartyName(changed.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className={labelClass}>Telephone</span>
          <input
            type="tel"
            value={telephone}
            disabled={saving}
            data-party-phone-input={booking.id}
            onChange={(changed) => setTelephone(changed.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            data-party-save={booking.id}
            className="h-9 rounded-md bg-black px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
