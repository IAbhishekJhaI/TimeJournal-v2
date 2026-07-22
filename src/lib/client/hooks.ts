"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { api } from "./api";
import type { EntryUpsert, TimeEntry } from "@/lib/api/types";

export function useProfile() {
  return useQuery({ queryKey: ["me"], queryFn: api.getProfile });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: () => api.getCategories(includeArchived),
  });
}

const entriesKey = (day: string) => ["entries", day] as const;

export function useEntries(day: string) {
  return useQuery({
    queryKey: entriesKey(day),
    queryFn: () => api.getEntries(day, day),
  });
}

type PaintItem = Pick<EntryUpsert, "slot" | "categoryId"> & { note?: string | null };

/**
 * Optimistic paint/clear of slots on a single day. Updates the cache
 * immediately (zero-latency feel — FRONTEND_PLAN.md §1), rolls back on error,
 * and returns the server `conflicts` so the UI can flag slots changed
 * elsewhere. The PK (user, day, slot) makes replays idempotent.
 */
export function useUpsertEntries(
  day: string,
): UseMutationResult<
  { conflicts: unknown[] },
  Error,
  PaintItem[],
  { previous: TimeEntry[] | undefined }
> {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (items: PaintItem[]) => {
      const res = await api.putEntries(items.map((i) => ({ ...i, day })));
      return { conflicts: res.conflicts };
    },
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: entriesKey(day) });
      const previous = qc.getQueryData<TimeEntry[]>(entriesKey(day));

      const bySlot = new Map<number, TimeEntry>((previous ?? []).map((e) => [e.slot, e]));
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
            note: item.note ?? existing?.note ?? null,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      qc.setQueryData<TimeEntry[]>(
        entriesKey(day),
        [...bySlot.values()].sort((a, b) => a.slot - b.slot),
      );

      return { previous };
    },
    onError: (_err, _items, ctx) => {
      if (ctx?.previous) qc.setQueryData(entriesKey(day), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: entriesKey(day) });
    },
  });
}
