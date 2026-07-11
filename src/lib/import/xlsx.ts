import * as XLSX from "xlsx";

const CATEGORY_SHEET = "Categories";
const DAYS_SHEET = "Days";
const FIRST_SLOT_COL = 2; // column C, 0-indexed
const SLOT_COUNT = 96; // C:CT

export interface ParsedCategory {
  code: string;
  name: string;
  description: string | null;
  parentCode: string | null;
  /** Slot count from the sheet's own Σ (h/4) column — used to validate the import, not stored. */
  expectedSlotCount: number;
}

export interface ParsedEntry {
  day: string; // YYYY-MM-DD
  slot: number; // 0-95
  code: string;
}

export interface ParsedWorkbook {
  categories: ParsedCategory[];
  entries: ParsedEntry[];
  /** Codes referenced in Days but missing from Categories — surfaced, never silently dropped. */
  unknownCodes: Set<string>;
  /** Codes whose casing didn't match Categories exactly (sheet COUNTIF is case-insensitive) but were matched anyway. */
  caseCorrections: Map<string, string>;
  /**
   * Code -> every category name using it, for codes claimed by more than
   * one row in the Categories tab. The new schema enforces one active
   * category per code, so these must be resolved (rename in the sheet and
   * re-export) before importing — surfaced rather than guessed at.
   */
  duplicateCodes: Map<string, string[]>;
}

function excelSerialToISODate(serial: number): string {
  // Sheet dates are day-only values; XLSX.SSF renders them without a
  // timezone conversion, matching the displayed calendar date.
  return XLSX.SSF.format("yyyy-mm-dd", serial);
}

function parseCategories(sheet: XLSX.WorkSheet): ParsedCategory[] {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const categories: ParsedCategory[] = [];
  let currentTopLevel: string | null = null;

  for (let r = 1; r <= range.e.r; r++) {
    const topLevelLetter = sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
    const code = sheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
    const name = sheet[XLSX.utils.encode_cell({ r, c: 2 })]?.v;
    const description = sheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
    const slotCount = sheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;

    if (!code) continue; // blank separator row

    const isTopLevel = Boolean(topLevelLetter);
    if (isTopLevel) currentTopLevel = String(code);

    categories.push({
      code: String(code),
      name: name ? String(name) : String(code),
      description: description ? String(description) : null,
      parentCode: isTopLevel ? null : currentTopLevel,
      expectedSlotCount: typeof slotCount === "number" ? slotCount : 0,
    });
  }

  return categories;
}

function parseDays(sheet: XLSX.WorkSheet, codeByLowercase: Map<string, string>) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const entries: ParsedEntry[] = [];
  const unknownCodes = new Set<string>();
  const caseCorrections = new Map<string, string>();

  for (let r = 1; r <= range.e.r; r++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!dateCell || typeof dateCell.v !== "number") continue;
    const day = excelSerialToISODate(dateCell.v);

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: FIRST_SLOT_COL + slot })];
      const code = cell?.v;
      if (!code) continue;

      const codeStr = String(code).trim();
      if (!codeStr) continue;

      // The sheet's own COUNTIF-based totals are case-insensitive, so a
      // stray "BB" against a defined "Bb" is a real (if sloppy) match
      // there. Normalize to the canonical code, but never invent a
      // category for something that doesn't match at all.
      const canonical = codeByLowercase.get(codeStr.toLowerCase());
      if (!canonical) {
        unknownCodes.add(codeStr);
        continue;
      }
      if (canonical !== codeStr) {
        caseCorrections.set(codeStr, canonical);
      }

      entries.push({ day, slot, code: canonical });
    }
  }

  return { entries, unknownCodes, caseCorrections };
}

export function parseWorkbook(buffer: Buffer | ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const categorySheet = workbook.Sheets[CATEGORY_SHEET];
  const daysSheet = workbook.Sheets[DAYS_SHEET];
  if (!categorySheet || !daysSheet) {
    throw new Error(
      `expected '${CATEGORY_SHEET}' and '${DAYS_SHEET}' sheets, found: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const categories = parseCategories(categorySheet);

  const duplicateCodes = new Map<string, string[]>();
  const namesByCode = new Map<string, string[]>();
  for (const c of categories) {
    const names = namesByCode.get(c.code) ?? [];
    names.push(c.name);
    namesByCode.set(c.code, names);
  }
  for (const [code, names] of namesByCode) {
    if (names.length > 1) duplicateCodes.set(code, names);
  }

  const codeByLowercase = new Map(categories.map((c) => [c.code.toLowerCase(), c.code]));
  const { entries, unknownCodes, caseCorrections } = parseDays(daysSheet, codeByLowercase);

  return { categories, entries, unknownCodes, caseCorrections, duplicateCodes };
}

export interface ValidationMismatch {
  code: string;
  expected: number;
  actual: number;
}

/**
 * Compares each category's actual imported slot count against the sheet's
 * own Σ (h/4) column. On the sheet, a top-level row's total is a COUNTIF
 * over the shared first-letter prefix, so it already includes every child
 * subcategory's slots — we roll up the same way before comparing.
 */
export function validateAgainstSheetTotals(
  categoriesList: ParsedCategory[],
  entries: ParsedEntry[],
): ValidationMismatch[] {
  const counts = countSlotsByCode(entries);
  const childrenByParent = new Map<string, string[]>();
  for (const c of categoriesList) {
    if (c.parentCode) {
      if (!childrenByParent.has(c.parentCode)) childrenByParent.set(c.parentCode, []);
      childrenByParent.get(c.parentCode)!.push(c.code);
    }
  }

  return categoriesList
    .map((c) => {
      const own = counts.get(c.code) ?? 0;
      const childrenTotal = (childrenByParent.get(c.code) ?? []).reduce(
        (sum, childCode) => sum + (counts.get(childCode) ?? 0),
        0,
      );
      return { code: c.code, expected: c.expectedSlotCount, actual: own + childrenTotal };
    })
    .filter((r) => r.expected !== r.actual);
}

/** Per-code slot counts actually parsed from Days, for validating against expectedSlotCount. */
export function countSlotsByCode(entries: ParsedEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.code, (counts.get(entry.code) ?? 0) + 1);
  }
  return counts;
}
