"use client";

import { useState } from "react";
import { parseCents } from "@/lib/money";
import type { NewBookingInput } from "@/lib/use-events";

interface Props {
  onCreate: (input: NewBookingInput) => Promise<unknown>;
  onCancel: () => void;
}

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewBookingForm({ onCreate, onCancel }: Props) {
  const [partyName, setPartyName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [guestCount, setGuestCount] = useState("2");
  const [ticketPrice, setTicketPrice] = useState("0.00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const guests = Number(guestCount);
    if (!Number.isInteger(guests) || guests < 1) {
      setError("Enter a whole number of guests, at least 1.");
      return;
    }
    const cents = parseCents(ticketPrice);
    if (cents === null || cents < 0) {
      setError("Enter a ticket price of zero or more.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onCreate({
        partyName,
        telephone,
        guestCount: guests,
        ticketPriceCents: cents,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-base font-semibold text-black dark:text-zinc-50">
        New booking
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        The guest count creates that many guests, each starting unseated at
        this ticket price. Names, tables and prices are editable per guest.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Party name</span>
          <input
            type="text"
            name="partyName"
            value={partyName}
            onChange={(changed) => setPartyName(changed.target.value)}
            autoFocus
            className={fieldClass}
            placeholder="Nkosi party"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Telephone</span>
          <input
            type="tel"
            name="telephone"
            value={telephone}
            onChange={(changed) => setTelephone(changed.target.value)}
            className={fieldClass}
            placeholder="082 123 4567"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Guests</span>
          <input
            type="number"
            name="guestCount"
            min={1}
            inputMode="numeric"
            value={guestCount}
            onChange={(changed) => setGuestCount(changed.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Ticket price each</span>
          <input
            type="text"
            name="ticketPrice"
            inputMode="decimal"
            value={ticketPrice}
            onChange={(changed) => setTicketPrice(changed.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {error !== "" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="h-11 rounded-md bg-black px-4 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {saving ? "Creating…" : "Create booking"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-11 rounded-md border border-zinc-300 px-4 text-base font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
