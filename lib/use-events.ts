"use client";

/**
 * Loads active events from IndexedDB.
 *
 * Selection is not tracked here: the URL owns it, so the browser's back and
 * forward buttons move between events for free and a refresh keeps its place.
 *
 * IndexedDB exists only in the browser, so the first render must not read it.
 * The hook starts in "loading" and fetches inside an effect, which keeps the
 * server-rendered markup and the first client render identical.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isBrowser } from "./db";
import {
  TooManyActiveEventsError,
  createEvent,
  listEvents,
  runRetentionSweep,
  updateEventSchedule,
} from "./repository";
import { MAX_ACTIVE_EVENTS, type Event } from "./types";

export type LoadState = "loading" | "ready" | "error";

export interface NewEventInput {
  name: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
}

export interface ScheduleInput {
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
}

export interface UseEventsResult {
  state: LoadState;
  error: string;
  /** Active events only: the spec gives tabs to active events. */
  activeEvents: Event[];
  atEventLimit: boolean;
  addEvent: (input: NewEventInput) => Promise<Event>;
  updateSchedule: (id: string, schedule: ScheduleInput) => Promise<Event>;
  reload: () => Promise<void>;
}

function describeError(error: unknown): string {
  if (error instanceof TooManyActiveEventsError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Earliest event date first, so the next event to happen leads the tabs. */
function byEventDate(a: Event, b: Event): number {
  return a.eventDate.localeCompare(b.eventDate);
}

async function readActiveEvents(): Promise<Event[]> {
  const events = await listEvents();
  return events.filter((event) => event.status === "active").sort(byEventDate);
}

export function useEvents(): UseEventsResult {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);

  const load = useCallback(async () => {
    if (!isBrowser()) {
      setState("error");
      setError("This browser has no IndexedDB, so nothing can be saved.");
      return;
    }

    try {
      // Sweeping first means a tab left open for days sees the same closures
      // and deletions a fresh load would.
      await runRetentionSweep();
      setActiveEvents(await readActiveEvents());
      setState("ready");
      setError("");
    } catch (caught) {
      setState("error");
      setError(describeError(caught));
    }
  }, []);

  // Strict Mode double-invokes effects in development. The sweep is
  // idempotent, so a second run is harmless, but skipping it avoids two
  // concurrent reads racing to set the same state.
  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void load();
  }, [load]);

  const addEvent = useCallback(async (input: NewEventInput) => {
    const created = await createEvent(input);
    setActiveEvents(await readActiveEvents());
    return created;
  }, []);

  const updateSchedule = useCallback(
    async (id: string, schedule: ScheduleInput) => {
      const updated = await updateEventSchedule(id, schedule);
      setActiveEvents(await readActiveEvents());
      return updated;
    },
    [],
  );

  return {
    state,
    error,
    activeEvents,
    atEventLimit: activeEvents.length >= MAX_ACTIVE_EVENTS,
    addEvent,
    updateSchedule,
    reload: load,
  };
}
