import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sheetOutbox, timeEntries } from "@/db/schema";
import type { entriesBatchSchema } from "./schemas";
import type { z } from "zod";

export async function getEntries(userId: string, from: string, to: string) {
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.day, from),
        lte(timeEntries.day, to),
      ),
    )
    .orderBy(timeEntries.day, timeEntries.slot);
}

type EntryUpsert = z.infer<typeof entriesBatchSchema>[number];

export interface UpsertConflict {
  day: string;
  slot: number;
  serverCategoryId: string | null;
  serverUpdatedAt: string;
}

/**
 * Batch upsert/clear of slots in one transaction. categoryId: null clears
 * the slot. Every touched day is (re)queued for sheet export. Returns any
 * slots whose server value was updated more recently than the client's
 * `clientUpdatedAt` — the write still wins (last-write-wins per
 * ARCHITECTURE.md §6), this is only a signal for the UI to flag it.
 */
export async function upsertEntries(userId: string, items: EntryUpsert[]) {
  const days = [...new Set(items.map((i) => i.day))];

  return db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), inArray(timeEntries.day, days)));

    const existingByKey = new Map(
      existingRows.map((row) => [`${row.day}:${row.slot}`, row]),
    );

    const conflicts: UpsertConflict[] = [];
    for (const item of items) {
      const existing = existingByKey.get(`${item.day}:${item.slot}`);
      if (existing && item.clientUpdatedAt) {
        const clientTime = new Date(item.clientUpdatedAt).getTime();
        const serverTime = new Date(existing.updatedAt).getTime();
        if (serverTime > clientTime) {
          conflicts.push({
            day: item.day,
            slot: item.slot,
            serverCategoryId: existing.categoryId,
            serverUpdatedAt: existing.updatedAt as unknown as string,
          });
        }
      }
    }

    const toDelete = items.filter((i) => i.categoryId === null);
    const toUpsert = items.filter((i) => i.categoryId !== null);

    for (const item of toDelete) {
      await tx
        .delete(timeEntries)
        .where(
          and(
            eq(timeEntries.userId, userId),
            eq(timeEntries.day, item.day),
            eq(timeEntries.slot, item.slot),
          ),
        );
    }

    for (const item of toUpsert) {
      await tx
        .insert(timeEntries)
        .values({
          userId,
          day: item.day,
          slot: item.slot,
          categoryId: item.categoryId!,
          note: item.note ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [timeEntries.userId, timeEntries.day, timeEntries.slot],
          set: {
            categoryId: item.categoryId!,
            note: item.note ?? null,
            updatedAt: new Date(),
          },
        });
    }

    for (const day of days) {
      await tx
        .insert(sheetOutbox)
        .values({ userId, day })
        .onConflictDoNothing({
          target: [sheetOutbox.userId, sheetOutbox.day],
          where: sql`${sheetOutbox.exportedAt} is null`,
        });
    }

    return { conflicts };
  });
}
