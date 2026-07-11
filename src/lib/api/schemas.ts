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

export const quicklogParseSchema = z.object({
  text: z.string().min(1).max(200),
  // The day the free-text entry applies to; defaults to today (server-side)
  // if omitted, resolved against the user's timezone.
  day: isoDate.optional(),
});
