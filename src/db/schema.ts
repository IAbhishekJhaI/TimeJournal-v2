import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Supabase manages this table; we only reference it for FKs, never migrate it.
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/** App-level profile, one row per Supabase auth user. */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  sheetSpreadsheetId: text("sheet_spreadsheet_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Invite-only allowlist (ARCHITECTURE.md §10.3). An email must have a row
 * here before Supabase Auth signup is allowed to redeem it.
 */
export const invitedEmails = pgTable("invited_emails", {
  email: text("email").primaryKey(),
  invitedBy: uuid("invited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});

/** 2+ level category tree, per user, referenced by id (never by code). */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "categories_parent_id_fkey",
    }).onDelete("restrict"),
    // Code is unique per user only among non-archived rows, so a retired
    // code can be reused without renaming history-bearing archived rows.
    uniqueIndex("categories_user_code_active_idx")
      .on(table.userId, table.code)
      .where(sql`${table.archived} = false`),
    index("categories_user_id_idx").on(table.userId),
    index("categories_parent_id_idx").on(table.parentId),
    check("categories_color_hex_chk", sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/** One row per logged 15-minute slot. Composite PK mirrors the sheet grid. */
export const timeEntries = pgTable(
  "time_entries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    slot: smallint("slot").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.day, table.slot] }),
    index("time_entries_user_day_idx").on(table.userId, table.day),
    index("time_entries_category_id_idx").on(table.categoryId),
    check("time_entries_slot_range_chk", sql`${table.slot} >= 0 AND ${table.slot} <= 95`),
  ],
);

/** User-defined rollups over a set of categories, e.g. "Outdoors time". */
export const savedQueries = pgTable(
  "saved_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categoryIds: uuid("category_ids").array().notNull(),
  },
  (table) => [index("saved_queries_user_id_idx").on(table.userId)],
);

/** Queue of (user, day) pairs whose sheet row is stale and needs re-export. */
export const sheetOutbox = pgTable(
  "sheet_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
  },
  (table) => [
    // One pending row per (user, day); draining/enqueue upserts on conflict.
    uniqueIndex("sheet_outbox_pending_user_day_idx")
      .on(table.userId, table.day)
      .where(sql`${table.exportedAt} is null`),
    index("sheet_outbox_pending_idx")
      .on(table.exportedAt)
      .where(sql`${table.exportedAt} is null`),
  ],
);
