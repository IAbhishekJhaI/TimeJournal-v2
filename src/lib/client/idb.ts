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
  // The slot's last server-known value when the user first edited it, preserved
  // across local re-edits. Used to drop no-op writes: if a slot is changed and
  // then reverted to this value, there's nothing to upload.
  baseCategoryId: string | null;
  baseNote: string | null;
  // The server updatedAt this slot had when the user first edited it offline —
  // the baseline for conflict detection. Preserved across local re-edits.
  clientUpdatedAt: string | null;
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

/**
 * What to do with a slot's stored pending write once `sent` has been uploaded.
 * `stored` may have been re-edited while the upload was in flight:
 *  - gone, or holding the value that was sent → the server has it; delete.
 *  - holding a different value → keep it, rebased onto the sent value (the
 *    server's value now). clientUpdatedAt is cleared: the server's new
 *    updatedAt is our own write, so the old baseline would flag a false conflict.
 */
export function settleWrite(
  stored: PendingWrite | undefined,
  sent: PendingWrite,
): { action: "delete" } | { action: "keep"; write: PendingWrite } {
  if (!stored || (stored.categoryId === sent.categoryId && stored.note === sent.note)) {
    return { action: "delete" };
  }
  return {
    action: "keep",
    write: {
      ...stored,
      baseCategoryId: sent.categoryId,
      baseNote: sent.note,
      clientUpdatedAt: null,
    },
  };
}

/**
 * After an upload succeeds, settle each sent write against what's stored now
 * (see `settleWrite`) in one transaction. Returns the keys that were kept.
 */
export async function settlePending(sent: PendingWrite[]): Promise<string[]> {
  if (!available() || sent.length === 0) return [];
  const db = await openDb();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const kept: string[] = [];
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const w of sent) {
        const req = store.get(w.key);
        req.onsuccess = () => {
          const result = settleWrite(req.result as PendingWrite | undefined, w);
          if (result.action === "delete") {
            store.delete(w.key);
          } else {
            store.put(result.write);
            kept.push(w.key);
          }
        };
      }
      tx.oncomplete = () => resolve(kept);
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
