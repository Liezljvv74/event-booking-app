/**
 * IndexedDB plumbing. Hand-rolled rather than pulling in a wrapper library,
 * per the spec's rule to keep dependencies minimal.
 *
 * Nothing here touches indexedDB at module scope. The app is prerendered at
 * build time in Node, where no browser globals exist, so the connection is
 * opened lazily on first use inside the browser.
 */

const DATABASE_NAME = "event-booking-manager";
const DATABASE_VERSION = 3;

export const STORE_EVENTS = "events";
export const STORE_EXPENSE_TEMPLATES = "expenseTemplates";
export const STORE_SETTINGS = "settings";

/** Index on Event.status, used to count active events and sweep closed ones. */
/**
 * Part of the stored schema. Nothing queries it now that events are filtered
 * in memory, but dropping it would leave databases created before and after
 * the change with different shapes for no gain.
 */
export const INDEX_EVENTS_BY_STATUS = "by_status";

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let connection: Promise<IDBDatabase> | null = null;

/** Wrap an IDBRequest as a promise. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fill in fields that events stored by an older version do not have:
 * startTime and endTime, added in version 2, and ticketPrices, added in
 * version 3.
 *
 * Runs inside the versionchange transaction, so the fields exist before any
 * application code reads a record. Without this, an older event would come
 * back with undefined where the types promise string | null and an array.
 *
 * One pass fills whichever are missing rather than one pass per version.
 * That keeps a single cursor over the store — two walking it at once in the
 * same transaction is asking for trouble — and it means a database skipping
 * straight from version 1 to 3 is brought fully up to date, which upgrading
 * one version at a time would have to be careful to do.
 */
function backfillEventFields(transaction: IDBTransaction): void {
  const request = transaction.objectStore(STORE_EVENTS).openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;

    const record = cursor.value as Record<string, unknown>;
    if (
      record.startTime === undefined ||
      record.endTime === undefined ||
      record.ticketPrices === undefined
    ) {
      cursor.update({
        ...record,
        startTime: record.startTime ?? null,
        endTime: record.endTime ?? null,
        // An event from before prices existed was sold at whatever its
        // bookings say; there is nothing to invent a list from.
        ticketPrices: record.ticketPrices ?? [],
      });
    }
    cursor.continue();
  };
}

function createSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_EVENTS)) {
    const events = database.createObjectStore(STORE_EVENTS, { keyPath: "id" });
    events.createIndex(INDEX_EVENTS_BY_STATUS, "status", { unique: false });
  }

  if (!database.objectStoreNames.contains(STORE_EXPENSE_TEMPLATES)) {
    database.createObjectStore(STORE_EXPENSE_TEMPLATES, { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
    database.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
  }
}

/**
 * Open the database, reusing the connection across calls.
 *
 * A failed open discards the cached promise so a later call can retry;
 * caching a rejection would make one transient failure permanent for the
 * lifetime of the page.
 */
export function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(
      new Error("IndexedDB is unavailable: this must run in the browser."),
    );
  }

  if (connection) return connection;

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (upgrade) => {
      createSchema(request.result);

      // Stores are created above, so an existing database only needs its
      // records brought forward.
      const transaction = request.transaction;
      if (
        upgrade.oldVersion >= 1 &&
        upgrade.oldVersion < DATABASE_VERSION &&
        transaction
      ) {
        backfillEventFields(transaction);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      // Another tab requesting a version change would otherwise be blocked
      // by this connection holding the old version open.
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Database upgrade blocked by another open tab."));
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });

  return connection;
}

/**
 * Run work inside one transaction and resolve only once it has committed.
 *
 * The callback must await nothing but the request promises above. Awaiting an
 * unrelated promise yields to the event loop, at which point IndexedDB
 * auto-commits the transaction and every later request in it throws.
 */
export async function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, mode);

  const committed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted."));
  });

  // When the callback below throws, the transaction is aborted deliberately
  // and this promise rejects with it — but that path throws the callback's
  // own error and never awaits this one, so the rejection would be reported
  // as unhandled and drown the real message. Marking it handled here costs
  // nothing: `await committed` still rejects for callers that reach it.
  committed.catch(() => {});

  let result: T;
  try {
    result = await work(transaction);
  } catch (error) {
    // A write that failed mid-transaction must not leave a partial commit.
    if (mode !== "readonly") {
      try {
        transaction.abort();
      } catch {
        // Already aborted or committed; the original error is what matters.
      }
    }
    throw error;
  }

  await committed;
  return result;
}

export function getAll<T>(
  transaction: IDBTransaction,
  storeName: string,
): Promise<T[]> {
  return promisifyRequest(
    transaction.objectStore(storeName).getAll() as IDBRequest<T[]>,
  );
}

export async function getOne<T>(
  transaction: IDBTransaction,
  storeName: string,
  key: IDBValidKey,
): Promise<T | null> {
  const value = await promisifyRequest(
    transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>,
  );
  return value ?? null;
}

export async function put(
  transaction: IDBTransaction,
  storeName: string,
  value: unknown,
): Promise<void> {
  await promisifyRequest(transaction.objectStore(storeName).put(value));
}

export async function remove(
  transaction: IDBTransaction,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  await promisifyRequest(transaction.objectStore(storeName).delete(key));
}


/** Generate an id without a dependency, falling back where crypto is absent. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


