import { db } from "@/db";
import { categories, timeEntries } from "@/db/schema";
import { parseWorkbook, validateAgainstSheetTotals, type ValidationMismatch } from "./xlsx";

export interface ImportResult {
  categoriesCreated: number;
  entriesCreated: number;
  unknownCodes: string[];
  caseCorrections: Array<{ from: string; to: string }>;
  validationMismatches: ValidationMismatch[];
}

/** Thrown before any DB write when the sheet itself has data that can't be safely imported. */
export class ImportValidationError extends Error {}

// The source sheet encodes colour via cell fill, which the (free) xlsx
// reader can't recover reliably — assign a deterministic placeholder
// palette per top-level category instead. Recolour via PATCH /api/categories
// after import; this never blocks the import itself.
const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
];

/**
 * One-time/occasional import of the exported Google Sheet xlsx (§11 Phase 2).
 * Creates the category tree and every logged slot for `userId` in a single
 * transaction, then validates each code's imported slot count against the
 * sheet's own Σ (h/4) column so import bugs surface immediately rather than
 * silently corrupting history.
 */
export async function importWorkbook(userId: string, buffer: Buffer): Promise<ImportResult> {
  const parsed = parseWorkbook(buffer);

  if (parsed.duplicateCodes.size > 0) {
    const detail = [...parsed.duplicateCodes.entries()]
      .map(([code, names]) => `'${code}' used by: ${names.join(", ")}`)
      .join("; ");
    throw new ImportValidationError(
      `the sheet reuses the same code for more than one category — rename one of ` +
        `each pair in the Categories tab and re-export before importing (${detail})`,
    );
  }

  const validationMismatches = validateAgainstSheetTotals(parsed.categories, parsed.entries);

  const result = await db.transaction(async (tx) => {
    const codeToId = new Map<string, string>();
    const codeToColor = new Map<string, string>();
    let sortOrder = 0;

    const topLevel = parsed.categories.filter((c) => c.parentCode === null);
    const children = parsed.categories.filter((c) => c.parentCode !== null);

    for (const cat of topLevel) {
      const color = PALETTE[sortOrder % PALETTE.length];
      codeToColor.set(cat.code, color);
      const [row] = await tx
        .insert(categories)
        .values({
          userId,
          parentId: null,
          code: cat.code,
          name: cat.name,
          description: cat.description,
          color,
          sortOrder: sortOrder++,
        })
        .returning();
      codeToId.set(cat.code, row.id);
    }

    for (const cat of children) {
      const parentId = cat.parentCode ? (codeToId.get(cat.parentCode) ?? null) : null;
      const color = (cat.parentCode && codeToColor.get(cat.parentCode)) || PALETTE[0];
      const [row] = await tx
        .insert(categories)
        .values({
          userId,
          parentId,
          code: cat.code,
          name: cat.name,
          description: cat.description,
          color,
          sortOrder: sortOrder++,
        })
        .returning();
      codeToId.set(cat.code, row.id);
    }

    const entryValues = parsed.entries
      .map((e) => ({ userId, day: e.day, slot: e.slot, categoryId: codeToId.get(e.code) }))
      .filter((v): v is { userId: string; day: string; slot: number; categoryId: string } =>
        Boolean(v.categoryId),
      );

    const CHUNK = 1000;
    for (let i = 0; i < entryValues.length; i += CHUNK) {
      await tx
        .insert(timeEntries)
        .values(entryValues.slice(i, i + CHUNK))
        .onConflictDoNothing();
    }

    return { categoriesCreated: codeToId.size, entriesCreated: entryValues.length };
  });

  return {
    ...result,
    unknownCodes: [...parsed.unknownCodes],
    caseCorrections: [...parsed.caseCorrections.entries()].map(([from, to]) => ({ from, to })),
    validationMismatches,
  };
}
