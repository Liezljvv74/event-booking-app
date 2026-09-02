/**
 * Domain operations over the IndexedDB stores: reading and writing events,
 * the reusable expense library, settings, and the auto-close/retention sweep.
 *
 * An Event is stored as one record with its tables, bookings and expenses
 * nested inside it, mirroring the spec's data model. With at most four active
 * events, a normalised schema would buy nothing and cost every read a join.
 */

import {
  AUTO_CLOSE_AFTER_HOURS,
  DEFAULT_SEAT_COUNT,
  DEFAULT_SETTINGS,
  MAX_ACTIVE_EVENTS,
  type Event,
  type Expense,
  type ExpenseTemplate,
  type Settings,
  type Table,
} from "./types";
import {
  INDEX_EVENTS_BY_STATUS,
  STORE_EVENTS,
  STORE_EXPENSE_TEMPLATES,
  STORE_SETTINGS,
  countByIndex,
  getAll,
  getOne,
  newId,
  put,
  remove,
  runTransaction,
} from "./db";

const SETTINGS_KEY = "app";

interface SettingsRow {
  key: string;
  value: Settings;
}

/* ------------------------------------------------------------------ events */

export async function listEvents(): Promise<Event[]> {
  const events = await runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getAll<Event>(transaction, STORE_EVENTS),
  );
  return events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

export async function listActiveEvents(): Promise<Event[]> {
  const events = await listEvents();
  return events.filter((event) => event.status === "active");
}

export function getEvent(id: string): Promise<Event | null> {
  return runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    getOne<Event>(transaction, STORE_EVENTS, id),
  );
}

/** Persist an event wholesale. Callers mutate a copy, then save it. */
export function saveEvent(event: Event): Promise<void> {
  return runTransaction(STORE_EVENTS, "readwrite", (transaction) =>
    put(transaction, STORE_EVENTS, event),
  );
}

export function deleteEvent(id: string): Promise<void> {
  return runTransaction(STORE_EVENTS, "readwrite", (transaction) =>
    remove(transaction, STORE_EVENTS, id),
  );
}

export class TooManyActiveEventsError extends Error {
  constructor() {
    super(`At most ${MAX_ACTIVE_EVENTS} events may be active at once.`);
    this.name = "TooManyActiveEventsError";
  }
}

/**
 * Create an event, seeding its expenses from the most recent existing event
 * so the manager starts from the previous event's costs rather than a blank
 * list.
 *
 * The count check and the write share one transaction; splitting them would
 * let two quick clicks both pass a stale count and create a fifth event.
 */
export function createEvent(input: {
  name: string;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  seedExpensesFromEventId?: string;
}): Promise<Event> {
  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const existing = await getAll<Event>(transaction, STORE_EVENTS);
    const activeCount = existing.filter(
      (event) => event.status === "active",
    ).length;

    if (activeCount >= MAX_ACTIVE_EVENTS) {
      throw new TooManyActiveEventsError();
    }

    const source =
      input.seedExpensesFromEventId === undefined
        ? mostRecentEvent(existing)
        : (existing.find(
            (event) => event.id === input.seedExpensesFromEventId,
          ) ?? null);

    const event: Event = {
      id: newId(),
      name: input.name,
      eventDate: input.eventDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      status: "active",
      tables: [],
      bookings: [],
      expenses: copyExpenses(source?.expenses ?? []),
      createdAt: Date.now(),
      closedAt: null,
    };

    await put(transaction, STORE_EVENTS, event);
    return event;
  });
}

function mostRecentEvent(events: readonly Event[]): Event | null {
  if (events.length === 0) return null;
  return events.reduce((latest, event) =>
    event.createdAt > latest.createdAt ? event : latest,
  );
}

/** Fresh ids, so editing the new event's expenses never touches the source. */
function copyExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses.map((expense) => ({
    id: newId(),
    description: expense.description,
    amountCents: expense.amountCents,
  }));
}

/**
 * Update an event's date and clock times.
 *
 * Needed for more than fixing typos: events created before times existed
 * hold null for both, and there would otherwise be no way to fill them in.
 */
export async function updateEventSchedule(
  id: string,
  schedule: { eventDate: string; startTime: string | null; endTime: string | null },
): Promise<Event> {
  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const existing = await getOne<Event>(transaction, STORE_EVENTS, id);
    if (existing === null) throw new Error("That event no longer exists.");

    const updated: Event = { ...existing, ...schedule };
    await put(transaction, STORE_EVENTS, updated);
    return updated;
  });
}

/** A table with the spec's default seat count. */
export function makeTable(tableNumber: number): Table {
  return { id: newId(), tableNumber, seatCount: DEFAULT_SEAT_COUNT };
}

/* -------------------------------------------------------- expense library */

export async function listExpenseTemplates(): Promise<ExpenseTemplate[]> {
  const templates = await runTransaction(
    STORE_EXPENSE_TEMPLATES,
    "readonly",
    (transaction) =>
      getAll<ExpenseTemplate>(transaction, STORE_EXPENSE_TEMPLATES),
  );
  return templates.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Remember a removed line item so it can be picked from a dropdown later.
 * Matching on description keeps the library from filling with duplicates.
 */
export function rememberExpenseTemplate(
  expense: Pick<Expense, "description" | "amountCents">,
): Promise<ExpenseTemplate> {
  return runTransaction(
    STORE_EXPENSE_TEMPLATES,
    "readwrite",
    async (transaction) => {
      const existing = await getAll<ExpenseTemplate>(
        transaction,
        STORE_EXPENSE_TEMPLATES,
      );
      const match = existing.find(
        (template) =>
          template.description.trim().toLowerCase() ===
          expense.description.trim().toLowerCase(),
      );

      const template: ExpenseTemplate = {
        id: match?.id ?? newId(),
        description: expense.description,
        amountCents: expense.amountCents,
        lastUsedAt: Date.now(),
      };

      await put(transaction, STORE_EXPENSE_TEMPLATES, template);
      return template;
    },
  );
}

/** Permanent removal from the library, per the spec's explicit option. */
export function deleteExpenseTemplate(id: string): Promise<void> {
  return runTransaction(STORE_EXPENSE_TEMPLATES, "readwrite", (transaction) =>
    remove(transaction, STORE_EXPENSE_TEMPLATES, id),
  );
}

/* ---------------------------------------------------------------- settings */

export async function getSettings(): Promise<Settings> {
  const row = await runTransaction(STORE_SETTINGS, "readonly", (transaction) =>
    getOne<SettingsRow>(transaction, STORE_SETTINGS, SETTINGS_KEY),
  );
  return { ...DEFAULT_SETTINGS, ...row?.value };
}

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return runTransaction(STORE_SETTINGS, "readwrite", async (transaction) => {
    const row = await getOne<SettingsRow>(
      transaction,
      STORE_SETTINGS,
      SETTINGS_KEY,
    );
    const value: Settings = { ...DEFAULT_SETTINGS, ...row?.value, ...patch };
    await put(transaction, STORE_SETTINGS, { key: SETTINGS_KEY, value });
    return value;
  });
}

/* ------------------------------------------------- auto-close & retention */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * When an event auto-closes: 48 hours after the end of its event day.
 *
 * The date is split by hand rather than passed to `new Date(string)`, which
 * reads "YYYY-MM-DD" as UTC midnight and would shift the deadline by the
 * viewer's offset, closing a day early or late depending on the timezone.
 */
export function autoCloseAt(eventDate: string): number {
  const [year, month, day] = eventDate.split("-").map(Number);
  const endOfEventDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return endOfEventDay.getTime() + AUTO_CLOSE_AFTER_HOURS * HOUR_MS;
}

/** When a closed event's data is deleted, or null while it is still active. */
export function purgeAt(event: Event, retentionDays: number): number | null {
  if (event.closedAt === null) return null;
  return event.closedAt + retentionDays * DAY_MS;
}

export interface SweepResult {
  closedEventIds: string[];
  deletedEventIds: string[];
}

/**
 * Close events whose date has passed and delete closed events past the
 * retention window. Per the spec this deletion is silent, with no prompt.
 *
 * Call on app start and when the tab regains focus: a tab left open for days
 * would otherwise never notice either deadline passing.
 */
export async function runRetentionSweep(
  now: number = Date.now(),
): Promise<SweepResult> {
  // Read settings before opening the write transaction. Awaiting a second
  // transaction from inside this one would let the first auto-commit.
  const settings = await getSettings();

  return runTransaction(STORE_EVENTS, "readwrite", async (transaction) => {
    const events = await getAll<Event>(transaction, STORE_EVENTS);
    const result: SweepResult = { closedEventIds: [], deletedEventIds: [] };

    for (const event of events) {
      const alreadyClosed = event.status === "closed";
      const shouldClose = !alreadyClosed && now >= autoCloseAt(event.eventDate);

      if (!alreadyClosed && !shouldClose) continue;

      const closed: Event = alreadyClosed
        ? event
        : { ...event, status: "closed", closedAt: now };

      const deadline = purgeAt(closed, settings.retentionDays);
      if (deadline !== null && now >= deadline) {
        await remove(transaction, STORE_EVENTS, closed.id);
        result.deletedEventIds.push(closed.id);
        continue;
      }

      if (shouldClose) {
        await put(transaction, STORE_EVENTS, closed);
        result.closedEventIds.push(closed.id);
      }
    }

    return result;
  });
}

/** Active-event count, for disabling "New Event" at the spec's limit. */
export function countActiveEvents(): Promise<number> {
  return runTransaction(STORE_EVENTS, "readonly", (transaction) =>
    countByIndex(transaction, STORE_EVENTS, INDEX_EVENTS_BY_STATUS, "active"),
  );
}
