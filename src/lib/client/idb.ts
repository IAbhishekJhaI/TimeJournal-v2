/**
 * Minimal IndexedDB store for offline pending writes (FRONTEND_PLAN.md §4,
 * IMPLEMENTATION_PLAN.md §4.6). Each record is one slot write, keyed by
 * `${day}:${slot}` so re-painting the same slot overwrites its pending entry
 * (local last-write-wins, keeps the queue small). Replays are idempotent on
 * the server because `time_entries` has PK (user, day, slot).
 */
export interface PendingWrite {
  key: string;
  day: string;
  slot: number;
  categoryId: string | null; // null = clear the slot
  note: string | null;
  queuedAt: number;
}

const DB_NAME = "timejournal";
const STORE = "pending";
const VERSION = 1;

const available = () => typeof indexedDB !== "undefined";

export const pendingKey = (day: string, slot: number) => `${day}:${slot}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | void> {
  if (!available()) return;
  const db = await openDb();
  try {
    return await new Promise<T | void>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Upsert pending writes (dedupes on the (day,slot) key). */
export async function putPending(writes: PendingWrite[]): Promise<void> {
  if (!available() || writes.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const w of writes) store.put(w);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function allPending(): Promise<PendingWrite[]> {
  const result = await withStore<PendingWrite[]>("readonly", (s) => s.getAll());
  return (result as PendingWrite[]) ?? [];
}

export async function deletePending(keys: string[]): Promise<void> {
  if (!available() || keys.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const k of keys) store.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function countPending(): Promise<number> {
  const result = await withStore<number>("readonly", (s) => s.count());
  return (result as number) ?? 0;
}
