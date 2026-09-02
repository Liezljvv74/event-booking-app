"use client";

/**
 * Shares one loaded copy of the events with every screen under /events.
 *
 * The provider lives in the route's layout, and Next.js preserves layout
 * state across navigation, so moving between Dashboard, Tables and Bookings
 * reuses this data instead of re-reading IndexedDB and re-running the sweep.
 */

import { createContext, useContext } from "react";
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
