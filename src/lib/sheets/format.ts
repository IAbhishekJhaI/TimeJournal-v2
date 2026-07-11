import type { sheets_v4 } from "googleapis";

export const SLOT_COLUMNS = 96; // Days!C:CT, one per 15-min slot
export const FIRST_SLOT_COLUMN = "C";
export const LAST_SLOT_COLUMN = "CT";
const DATE_LOOKUP_RANGE = "Days!A2:A2000"; // ~5.5 years of daily rows

/**
 * "2026-01-01" -> "2026.1.1" — matches the date format already written into
 * column A by the existing sheet/app (time-manager.js formatDate), no
 * leading zeros.
 */
export function toSheetDateFormat(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${year}.${month}.${date}`;
}

/**
 * Finds the 1-indexed sheet row for a given day by scanning column A,
 * mirroring the lookup the current frontend does before writing a row.
 * Throws if the date isn't present (the Days tab is expected to be
 * pre-populated with every date of the year).
 */
export async function findRowForDate(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  day: string,
): Promise<number> {
  const target = toSheetDateFormat(day);
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DATE_LOOKUP_RANGE,
  });

  const rows = data.values ?? [];
  const index = rows.findIndex((row) => row[0] === target);
  if (index === -1) {
    throw new Error(`date ${day} (${target}) not found in 'Days' sheet`);
  }

  return index + 2; // +1 for 1-indexing, +1 because data starts at row 2
}
