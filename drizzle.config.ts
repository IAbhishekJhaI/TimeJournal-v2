import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit is a standalone CLI, so unlike `next` it doesn't auto-load
// .env.local. Load it explicitly (falling back to .env) so db:migrate /
// db:generate / db:studio use the same DATABASE_URL as the app.
config({ path: [".env.local", ".env"] });

// Migrations must NOT run over Supabase's transaction pooler (port 6543):
// drizzle-kit's migrator uses session-level advisory locks, which transaction
// pooling doesn't hold across statements, so DDL can silently fail to apply.
// Use the session pooler (5432) or the direct connection here. Set
// MIGRATE_DATABASE_URL to that; the app keeps using DATABASE_URL (6543).
// `|| ` (not `??`) so an empty MIGRATE_DATABASE_URL falls back to DATABASE_URL.
const migrateUrl =
  process.env.MIGRATE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!migrateUrl) {
  throw new Error(
    "MIGRATE_DATABASE_URL or DATABASE_URL must be set (see .env.example)",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrateUrl,
  },
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
