"use client";

/**
 * Shares one loaded copy of the events with every screen under /events.
 *
 * The provider lives in the route's layout, and Next.js preserves layout
 * state across navigation, so moving between Dashboard, Tables and Bookings
 * reuses this data instead of re-reading IndexedDB and re-running the sweep.
 */

import { createContext, useCallback, useContext } from "react";
import { formatAmount } from "@/lib/money";
import { useEvents, type UseEventsResult } from "@/lib/use-events";

const EventContext = createContext<UseEventsResult | null>(null);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const value = useEvents();
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEventContext(): UseEventsResult {
  const value = useContext(EventContext);
  if (value === null) {
    throw new Error("useEventContext must be used inside an EventProvider.");
  }
  return value;
}

/**
 * Format an amount the way this app has been told to: the figure, behind
 * whatever symbol the settings name, or bare when they name none.
 *
 * A hook rather than a call to `formatAmount` at each of the dozen places
 * that show money, so that setting the symbol changes all of them and not
 * eleven of them. `formatAmount` itself stays a plain function and keeps its
 * symbol optional, because the exports call it without one on purpose.
 */
export function useMoney(): (cents: number) => string {
  const { settings } = useEventContext();
  const { currency } = settings;

  return useCallback(
    (cents: number) => formatAmount(cents, currency),
    [currency],
  );
}
