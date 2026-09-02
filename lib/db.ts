/**
 * IndexedDB plumbing. Hand-rolled rather than pulling in a wrapper library,
 * per the spec's rule to keep dependencies minimal.
 *
 * Nothing here touches indexedDB at module scope. The app is prerendered at
 * build time in Node, where no browser globals exist, so the connection is
 * opened lazily on first use inside the browser.
 */

const DATABASE_NAME = "event-booking-manager";
const DATABASE_VERSION = 1;

export const STORE_EVENTS = "events";
export const STORE_EXPENSE_TEMPLATES = "expenseTemplates";
export const STORE_SETTINGS = "settings";

/** Index on Event.status, used to count active events and sweep closed ones. */
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

    request.onupgradeneeded = () => createSchema(request.result);

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

export function countByIndex(
  transaction: IDBTransaction,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<number> {
  return promisifyRequest(
    transaction.objectStore(storeName).index(indexName).count(key),
  );
}

/** Generate an id without a dependency, falling back where crypto is absent. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Close and forget the connection. Used by tests and the reset path. */
export async function closeDatabase(): Promise<void> {
  if (!connection) return;
  const database = await connection.catch(() => null);
  database?.close();
  connection = null;
}

/**
 * Drop the whole database. Backs the "reset app data" path, and lets a test
 * start from a known-empty store.
 */
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Database deletion blocked by another open tab."));
  });
}
