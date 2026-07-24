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

  const refreshCount = useCallback(async () => {
    setPendingCount(await countPending());
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    flushing.current = true;
    setSyncing(true);
    try {
      const pending = await allPending();
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
          await deletePending(writes.map((w) => w.key));
          if (res.conflicts.length > 0) {
            // Merge by (day, slot) so a slot never shows two stale flags.
            setConflicts((prev) => {
              const byKey = new Map(prev.map((c) => [conflictKey(c.day, c.slot), c]));
              for (const c of res.conflicts) byKey.set(conflictKey(c.day, c.slot), c);
              return [...byKey.values()];
            });
          }
          // Reconcile the cache with the server's truth for this day.
          qc.invalidateQueries({ queryKey: entriesKey(day) });
        } catch {
          // Network or server error — leave this day's writes queued and
          // stop; they'll retry on the next flush (reconnect / next paint).
          break;
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [qc, refreshCount]);

  const enqueue = useCallback(
    async (day: string, items: PaintInput[]) => {
      applyOptimistic(qc, day, items);
      const now = Date.now();

      // Preserve the conflict baseline across offline re-edits: if this slot is
      // already queued, keep the updatedAt captured on the FIRST edit rather
      // than the optimistic timestamp from an intermediate local change.
      const existing = await allPending();
      const baselineBySlot = new Map<number, string | null>();
      for (const w of existing) if (w.day === day) baselineBySlot.set(w.slot, w.clientUpdatedAt);

      await putPending(
        items.map((i) => ({
          key: pendingKey(day, i.slot),
          day,
          slot: i.slot,
          categoryId: i.categoryId,
          note: i.note ?? null,
          clientUpdatedAt: baselineBySlot.has(i.slot)
            ? (baselineBySlot.get(i.slot) ?? null)
            : (i.clientUpdatedAt ?? null),
          queuedAt: now,
        })),
      );
      await refreshCount();
      // Note: we intentionally do NOT flush here. Paints accumulate in the
      // durable IndexedDB queue and are sent to the DB in one batched pass only
      // when the user presses "Upload" (or automatically on reconnect / next
      // app load — see the effect below — as safety nets so nothing is lost).
    },
    [qc, refreshCount],
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
