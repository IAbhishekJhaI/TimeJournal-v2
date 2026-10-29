"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  allPending,
  countPending,
  deletePending,
  pendingKey,
  putPending,
  settlePending,
  type PendingWrite,
} from "./idb";
import type { TimeEntry, UpsertConflict } from "@/lib/api/types";

export interface PaintInput {
  slot: number;
  categoryId: string | null;
  note?: string | null;
  /** Server updatedAt the client last saw for this slot (conflict baseline). */
  clientUpdatedAt?: string | null;
}

const conflictKey = (day: string, slot: number) => `${day}:${slot}`;

interface SyncContextValue {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  conflicts: UpsertConflict[];
  /** Optimistically paint slots on a day and durably queue them for sync. */
  enqueue: (day: string, items: PaintInput[]) => Promise<void>;
  flush: () => Promise<void>;
  clearConflicts: () => void;
  clearConflict: (day: string, slot: number) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const entriesKey = (day: string) => ["entries", day] as const;

/** Apply a set of slot writes to the cached entries for a day (optimistic). */
function applyOptimistic(qc: QueryClient, day: string, items: PaintInput[]) {
  const prev = qc.getQueryData<TimeEntry[]>(entriesKey(day)) ?? [];
  const bySlot = new Map<number, TimeEntry>(prev.map((e) => [e.slot, e]));
  for (const item of items) {
    if (item.categoryId === null) {
      bySlot.delete(item.slot);
    } else {
      const existing = bySlot.get(item.slot);
      bySlot.set(item.slot, {
        userId: existing?.userId ?? "",
        day,
        slot: item.slot,
        categoryId: item.categoryId,
        // Match the server upsert: note is replaced by whatever the write
        // provides (null if omitted). Paints omit note; the SlotSheet sends it.
        note: item.note ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  qc.setQueryData<TimeEntry[]>(
    entriesKey(day),
    [...bySlot.values()].sort((a, b) => a.slot - b.slot),
  );
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<UpsertConflict[]>([]);
  const flushing = useRef(false);
  // Keys of pending writes snapshotted by the running flush. While a slot is in
  // flight its queued write must not be dropped as a no-op: the server is about
  // to receive the in-flight value, not the baseline.
  const inFlight = useRef(new Set<string>());
  // Serialises the queue's read-modify-write sections (enqueue, the flush
  // snapshot, post-upload settling) so they never interleave across awaits.
  const queueLock = useRef<Promise<unknown>>(Promise.resolve());
  const withQueueLock = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueLock.current.then(fn);
    queueLock.current = run.catch(() => {});
    return run;
  }, []);

  const refreshCount = useCallback(async () => {
    setPendingCount(await countPending());
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    flushing.current = true;
    setSyncing(true);
    let pending: PendingWrite[] = [];
    try {
      pending = await withQueueLock(async () => {
        const snapshot = await allPending();
        for (const w of snapshot) inFlight.current.add(w.key);
        return snapshot;
      });
      if (pending.length === 0) return;

      const byDay = new Map<string, PendingWrite[]>();
      for (const w of pending) {
        if (!byDay.has(w.day)) byDay.set(w.day, []);
        byDay.get(w.day)!.push(w);
      }

      for (const [day, writes] of byDay) {
        try {
          const res = await api.putEntries(
            writes.map((w) => ({
              day: w.day,
              slot: w.slot,
              categoryId: w.categoryId,
              note: w.note,
              clientUpdatedAt: w.clientUpdatedAt,
            })),
          );
          // Not a blind delete: a slot re-edited during the request keeps its
          // newer write (rebased onto what was just sent) for the next upload.
          const dayStillQueued = await withQueueLock(async () => {
            await settlePending(writes);
            return (await allPending()).some((w) => w.day === day);
          });
          for (const w of writes) inFlight.current.delete(w.key);
          if (res.conflicts.length > 0) {
            // Merge by (day, slot) so a slot never shows two stale flags.
            setConflicts((prev) => {
              const byKey = new Map(prev.map((c) => [conflictKey(c.day, c.slot), c]));
              for (const c of res.conflicts) byKey.set(conflictKey(c.day, c.slot), c);
              return [...byKey.values()];
            });
          }
          // Reconcile the cache with the server's truth for this day — unless
          // writes for it are still queued (kept mid-flight re-edits, or slots
          // painted after the snapshot): a refetch would paint over them with
          // the older server value until the next upload.
          if (!dayStillQueued) qc.invalidateQueries({ queryKey: entriesKey(day) });
        } catch {
          // Network or server error — leave this day's writes queued and
          // stop; they'll retry on the next flush (reconnect / next paint).
          break;
        }
      }
    } finally {
      for (const w of pending) inFlight.current.delete(w.key);
      flushing.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [qc, refreshCount, withQueueLock]);

  const enqueue = useCallback(
    async (day: string, items: PaintInput[]) => {
      // Snapshot the pre-optimistic cache: for a slot's FIRST edit this is the
      // server-known value, i.e. the baseline a later revert is compared against.
      const cached = qc.getQueryData<TimeEntry[]>(entriesKey(day)) ?? [];
      const cachedBySlot = new Map(cached.map((e) => [e.slot, e]));

      applyOptimistic(qc, day, items);
      const now = Date.now();

      await withQueueLock(async () => {
        // Existing queued writes for this day carry the original baseline forward
        // across re-edits (both the conflict updatedAt and the value baseline).
        const existing = await allPending();
        const pendingBySlot = new Map<number, PendingWrite>();
        for (const w of existing) if (w.day === day) pendingBySlot.set(w.slot, w);

        const toPut: PendingWrite[] = [];
        const toDelete: string[] = [];

        for (const i of items) {
          const key = pendingKey(day, i.slot);
          const prev = pendingBySlot.get(i.slot);
          const cachedEntry = cachedBySlot.get(i.slot);

          const baseCategoryId = prev ? prev.baseCategoryId : (cachedEntry?.categoryId ?? null);
          const baseNote = prev ? prev.baseNote : (cachedEntry?.note ?? null);
          const clientUpdatedAt = prev ? prev.clientUpdatedAt : (i.clientUpdatedAt ?? null);

          const nextCategoryId = i.categoryId;
          const nextNote = i.note ?? null;

          // Net no-op: the slot is back to its server-known value. Drop any queued
          // write so it neither counts as pending nor gets uploaded. Not while the
          // slot is in flight, though — the server is about to get the in-flight
          // value, so the revert must still be uploaded (flush rebases it).
          if (
            nextCategoryId === baseCategoryId &&
            nextNote === baseNote &&
            !inFlight.current.has(key)
          ) {
            if (prev) toDelete.push(key);
            continue;
          }

          toPut.push({
            key,
            day,
            slot: i.slot,
            categoryId: nextCategoryId,
            note: nextNote,
            baseCategoryId,
            baseNote,
            clientUpdatedAt,
            queuedAt: now,
          });
        }

        if (toDelete.length > 0) await deletePending(toDelete);
        if (toPut.length > 0) await putPending(toPut);
      });
      await refreshCount();
      // Note: we intentionally do NOT flush here. Paints accumulate in the
      // durable IndexedDB queue and are sent to the DB in one batched pass only
      // when the user presses "Upload" (or automatically on reconnect / next
      // app load — see the effect below — as safety nets so nothing is lost).
    },
    [qc, refreshCount, withQueueLock],
  );

  // Init: read connectivity, drain any queue persisted from a previous
  // session, and wire up reconnect handling.
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    void refreshCount();
    void flush();

    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flush, refreshCount]);

  const clearConflicts = useCallback(() => setConflicts([]), []);
  const clearConflict = useCallback((day: string, slot: number) => {
    setConflicts((prev) => prev.filter((c) => !(c.day === day && c.slot === slot)));
  }, []);

  return (
    <SyncContext.Provider
      value={{ online, pendingCount, syncing, conflicts, enqueue, flush, clearConflicts, clearConflict }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within <SyncProvider>");
  return ctx;
}
