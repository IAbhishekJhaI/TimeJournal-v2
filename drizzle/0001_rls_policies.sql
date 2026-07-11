-- Row-Level Security: belt-and-suspenders alongside the API-layer checks
-- (ARCHITECTURE.md §6). Every table scoped to a user is locked to
-- auth.uid() = user_id (or the equivalent join for categories/time_entries).
-- Hand-written (not drizzle-kit generated) because Drizzle doesn't manage
-- RLS policies; re-run manually if the schema changes in a way that affects
-- these.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sheet_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invited_emails" ENABLE ROW LEVEL SECURITY;

-- users: a user can read/update only their own profile row. Inserts happen
-- server-side (service role, on signup) so no INSERT policy for regular users.
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- categories: full CRUD scoped to the owning user.
CREATE POLICY "categories_all_own" ON "categories"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- time_entries: full CRUD scoped to the owning user.
CREATE POLICY "time_entries_all_own" ON "time_entries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- saved_queries: full CRUD scoped to the owning user.
CREATE POLICY "saved_queries_all_own" ON "saved_queries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- sheet_outbox: users may read their own pending export rows (e.g. to show
-- "export pending" in the UI later); only the server (service role, which
-- bypasses RLS) drains and writes it, so no user-facing write policies.
CREATE POLICY "sheet_outbox_select_own" ON "sheet_outbox"
  FOR SELECT USING (auth.uid() = user_id);

-- invited_emails: not user-readable at all; checked/written server-side
-- with the service role during the invite and signup flows.
