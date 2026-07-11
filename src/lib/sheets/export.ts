import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, sheetOutbox, timeEntries, users } from "@/db/schema";
import { getSheetsClient } from "./client";
import { FIRST_SLOT_COLUMN, LAST_SLOT_COLUMN, SLOT_COLUMNS, findRowForDate } from "./format";

export interface DrainFailure {
  userId: string;
  day: string;
  error: string;
}

export interface DrainResult {
  processed: number;
  failed: DrainFailure[];
}

/**
 * Drains pending sheet_outbox rows: for each (user, day), renders the 96
 * slot codes from Postgres and rewrites that row in the user's Google
 * Sheet. One-way, idempotent (full-row overwrite), eventually consistent
 * with the app (ARCHITECTURE.md §8). Pass `userId` to drain only that
 * user's pending rows (used by the "Export now" button); omit it to drain
 * everyone (used by the cron worker).
 */
export async function drainOutbox(options?: { userId?: string }): Promise<DrainResult> {
  const pending = await db
    .select()
    .from(sheetOutbox)
    .where(
      options?.userId
        ? and(isNull(sheetOutbox.exportedAt), eq(sheetOutbox.userId, options.userId))
        : isNull(sheetOutbox.exportedAt),
    );

  if (pending.length === 0) return { processed: 0, failed: [] };

  const userIds = [...new Set(pending.map((p) => p.userId))];
  const userRows = await db
    .select({ id: users.id, sheetSpreadsheetId: users.sheetSpreadsheetId })
    .from(users)
    .where(inArray(users.id, userIds));
  const spreadsheetByUser = new Map(userRows.map((u) => [u.id, u.sheetSpreadsheetId]));

  const sheets = getSheetsClient();
  const failed: DrainFailure[] = [];
  let processed = 0;

  const byUser = new Map<string, typeof pending>();
  for (const row of pending) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  for (const [userId, rows] of byUser) {
    const spreadsheetId = spreadsheetByUser.get(userId);
    if (!spreadsheetId) {
      for (const row of rows) {
        failed.push({
          userId,
          day: row.day,
          error: "user has no sheet_spreadsheet_id configured",
        });
      }
      continue;
    }

    const categoryRows = await db
      .select({ id: categories.id, code: categories.code })
      .from(categories)
      .where(eq(categories.userId, userId));
    const codeById = new Map(categoryRows.map((c) => [c.id, c.code]));

    for (const outboxRow of rows) {
      try {
        const entries = await db
          .select({ slot: timeEntries.slot, categoryId: timeEntries.categoryId })
          .from(timeEntries)
          .where(and(eq(timeEntries.userId, userId), eq(timeEntries.day, outboxRow.day)));

        const codesBySlot = new Array<string>(SLOT_COLUMNS).fill("");
        for (const entry of entries) {
          codesBySlot[entry.slot] = codeById.get(entry.categoryId) ?? "";
        }

        const rowNumber = await findRowForDate(sheets, spreadsheetId, outboxRow.day);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Days!${FIRST_SLOT_COLUMN}${rowNumber}:${LAST_SLOT_COLUMN}${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [codesBySlot] },
        });

        await db
          .update(sheetOutbox)
          .set({ exportedAt: new Date() })
          .where(eq(sheetOutbox.id, outboxRow.id));

        processed++;
      } catch (error) {
        failed.push({
          userId,
          day: outboxRow.day,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { processed, failed };
}
