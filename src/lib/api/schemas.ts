import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
const uuid = z.string().uuid();
const slot = z.number().int().min(0).max(95);

export const entriesQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const entryUpsertSchema = z.object({
  day: isoDate,
  slot,
  categoryId: uuid.nullable(),
  note: z.string().max(500).nullable().optional(),
  // Last updatedAt the client had for this slot, if editing an existing
  // value. Lets the server flag slots that changed elsewhere in the meantime.
  clientUpdatedAt: z.string().datetime().nullable().optional(),
});

export const entriesBatchSchema = z.array(entryUpsertSchema).min(1).max(96 * 31);

export const categoryCreateSchema = z.object({
  parentId: uuid.nullable().optional(),
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  color: hexColor,
  sortOrder: z.number().int().optional(),
});

export const categoryUpdateSchema = z.object({
  parentId: uuid.nullable().optional(),
  code: z.string().min(1).max(10).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: hexColor.optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const analyticsSummaryQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  date: isoDate,
  groupBy: z.enum(["category", "parent", "color"]).default("category"),
});

export const savedQueryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  categoryIds: z.array(uuid).min(1),
});

export const savedQueryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryIds: z.array(uuid).min(1).optional(),
});

export const inviteCreateSchema = z.object({
  email: z.string().email().max(254),
});

export const quicklogParseSchema = z.object({
  text: z.string().min(1).max(200),
  // The day the free-text entry applies to; defaults to today (server-side)
  // if omitted, resolved against the user's timezone.
  day: isoDate.optional(),
});

/** A string that names a valid IANA timezone (e.g. "Asia/Kolkata"). */
const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "expected a valid IANA timezone, e.g. Asia/Kolkata" },
);

export const meUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(100).nullable().optional(),
    timezone: ianaTimezone.optional(),
    // A Google Sheets spreadsheet id (the long token from the sheet URL), or
    // null to disconnect the export target.
    sheetSpreadsheetId: z.string().min(1).max(200).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "no fields to update",
  });

/**
 * Batch reorder / re-parent of categories. Each item sets a category's
 * sort_order and optionally its parent (null = move to top level). Applied
 * in one transaction so a drag is a single request (IMPLEMENTATION_PLAN.md §2.3).
 */
export const categoryReorderSchema = z
  .array(
    z.object({
      id: uuid,
      sortOrder: z.number().int(),
      parentId: uuid.nullable().optional(),
    }),
  )
  .min(1)
  .max(500);
