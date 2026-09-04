"use client";

import { useState } from "react";
import { formatAmount, formatCents, parseCents } from "@/lib/money";
import type { NewBookingInput } from "@/lib/use-events";
import type { TicketPrice } from "@/lib/types";

interface Props {
  /**
   * What the event is sold at, offered as choices so a price does not have
   * to be remembered and typed. Empty on an event with no prices set, and
   * then the amount is typed as it always was.
   */
  ticketPrices: readonly TicketPrice[];
  onCreate: (input: NewBookingInput) => Promise<unknown>;
  onCancel: () => void;
}

/** The option value standing for "not one of the event's prices". */
const CUSTOM = "custom";

/** "500.00 — Dinner, drinks, table wine", or just the amount if it says nothing. */
function describePrice(price: TicketPrice): string {
  const amount = formatAmount(price.amountCents);
  return price.includes === "" ? amount : `${amount} — ${price.includes}`;
}

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewBookingForm({
  ticketPrices,
  onCreate,
  onCancel,
}: Props) {
  const [partyName, setPartyName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [guestCount, setGuestCount] = useState("2");
  /**
   * Which of the event's prices this party is on, or CUSTOM for an amount
   * typed by hand. The event's first price is the common case, so it starts
   * selected; with no prices to choose from there is nothing but CUSTOM.
   */
  const [choice, setChoice] = useState(ticketPrices.length === 0 ? CUSTOM : "0");
  const chosen = ticketPrices[Number(choice)];
  // Typing over a chosen price starts from it rather than from zero.
  const [ticketPrice, setTicketPrice] = useState(
    ticketPrices.length === 0 ? "0.00" : formatCents(ticketPrices[0].amountCents),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const guests = Number(guestCount);
    if (!Number.isInteger(guests) || guests < 1) {
      setError("Enter a whole number of guests, at least 1.");
      return;
    }
    let cents: number;
    if (choice === CUSTOM) {
      const typed = parseCents(ticketPrice);
      if (typed === null || typed < 0) {
        setError("Enter a ticket price of zero or more.");
        return;
      }
      cents = typed;
    } else if (chosen === undefined) {
      // The event's prices changed in another tab while this was open.
      setError("That ticket price is no longer one of the event's. Pick again.");
      return;
    } else {
      cents = chosen.amountCents;
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
          {ticketPrices.length === 0 ? (
            <input
              type="text"
              name="ticketPrice"
              inputMode="decimal"
              value={ticketPrice}
              onChange={(changed) => setTicketPrice(changed.target.value)}
              className={fieldClass}
            />
          ) : (
            <select
              name="ticketPriceChoice"
              value={choice}
              onChange={(changed) => {
                const picked = changed.target.value;
                setChoice(picked);
                // Carry the picked amount into the box, so switching to a
                // typed amount starts from the nearest thing to it.
                const price = ticketPrices[Number(picked)];
                if (price !== undefined) {
                  setTicketPrice(formatCents(price.amountCents));
                }
              }}
              className={fieldClass}
            >
              {ticketPrices.map((price, index) => (
                <option key={price.id} value={String(index)}>
                  {describePrice(price)}
                </option>
              ))}
              <option value={CUSTOM}>Another amount…</option>
            </select>
          )}
        </label>

        {/* Only once "Another amount" is chosen, so the usual path is one
            field rather than two. */}
        {ticketPrices.length > 0 && choice === CUSTOM && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Amount each</span>
            <input
              type="text"
              name="ticketPrice"
              inputMode="decimal"
              value={ticketPrice}
              autoFocus
              onChange={(changed) => setTicketPrice(changed.target.value)}
              className={fieldClass}
            />
          </label>
        )}
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
