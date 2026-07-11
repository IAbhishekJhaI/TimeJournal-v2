import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// One connection pool per server instance. `prepare: false` is required for
// Supabase's transaction pooler (port 6543), which doesn't support
// server-side prepared statements across pooled connections.
const client = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
