import { afterAll, describe, expect, it } from "vitest";

/**
 * Integration coverage for the batch upsert + outbox enqueue path. These hit a
 * real Postgres, so they only run when a disposable test database is
 * configured. To run locally against a throwaway Supabase branch:
 *
 *   DATABASE_URL=... TEST_USER_ID=<uuid> TEST_CATEGORY_ID=<uuid> npm run test:run
 *
 * TEST_USER_ID / TEST_CATEGORY_ID must be a seeded user and one of that user's
 * categories. When unset, the whole suite is skipped (kept green in CI until a
 * test DB is wired up — IMPLEMENTATION_PLAN.md §2.5).
 */
const canRun = Boolean(
  process.env.DATABASE_URL && process.env.TEST_USER_ID && process.env.TEST_CATEGORY_ID,
);

const userId = process.env.TEST_USER_ID ?? "";
const categoryId = process.env.TEST_CATEGORY_ID ?? "";
const day = "1990-01-01"; // sentinel day, cleaned up after each run

describe.skipIf(!canRun)("upsertEntries (integration)", () => {
  afterAll(async () => {
    const { db } = await import("@/db");
    const { timeEntries, sheetOutbox } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.day, day)));
    await db
      .delete(sheetOutbox)
      .where(and(eq(sheetOutbox.userId, userId), eq(sheetOutbox.day, day)));
  });

  it("upserts slots, clears with null, and enqueues one outbox row per day", async () => {
    const { upsertEntries, getEntries } = await import("@/lib/api/entries");
    const { db } = await import("@/db");
    const { sheetOutbox } = await import("@/db/schema");
    const { and, eq, isNull } = await import("drizzle-orm");

    await upsertEntries(userId, [
      { day, slot: 0, categoryId, note: null },
      { day, slot: 1, categoryId, note: "hello" },
    ]);

    let rows = await getEntries(userId, day, day);
    expect(rows.map((r) => r.slot).sort()).toEqual([0, 1]);

    await upsertEntries(userId, [{ day, slot: 0, categoryId: null }]);
    rows = await getEntries(userId, day, day);
    expect(rows.map((r) => r.slot)).toEqual([1]);

    const pending = await db
      .select()
      .from(sheetOutbox)
      .where(
        and(
          eq(sheetOutbox.userId, userId),
          eq(sheetOutbox.day, day),
          isNull(sheetOutbox.exportedAt),
        ),
      );
    expect(pending.length).toBe(1); // deduped despite multiple writes
  });
});
