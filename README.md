# TimeJournal v2

Implementation of the [system HLD](./ARCHITECTURE.md) for TimeJournal:
Next.js (App Router) on Vercel, Postgres + Auth on Supabase, Drizzle ORM,
one-way eventually-consistent export to the legacy Google Sheet.

The API layer is complete (Phase 1–2.5). The **mobile-first frontend** is now
in progress (Phase 3): magic-link login, the authenticated app shell, and the
journal timeline (tap/drag to paint 15-min slots) are in. Dashboards, category
editor, quick-log, and PWA/offline are Phase 4 (see
[FRONTEND_PLAN.md](./FRONTEND_PLAN.md) and
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)).

The old Vite app in [`../TimeJournal`](../TimeJournal) keeps working
throughout — nothing here touches it.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, TypeScript, headless (`--api` template, no pages) |
| Database | Postgres on Supabase (free tier) |
| ORM | Drizzle |
| Auth | Supabase Auth (magic link) + DB-level invite allowlist trigger |
| Sheets export | Outbox table + GitHub Actions cron (every 15 min) → Sheets API |

## One-time setup

1. **Create a Supabase project** (free tier) at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API.
   - `DATABASE_URL` — Project Settings → Database → Connection string → **Transaction pooler** (port 6543). Drizzle connects with `prepare: false` specifically for this pooler.
   - `GOOGLE_SERVICE_ACCOUNT_KEY` — a Google Cloud service account JSON (Sheets API scope only), collapsed to one line. Share the target spreadsheet with the service account's `client_email` as an Editor. **Do not reuse the old `credentials.json`** from the legacy repo — see [Security](#security) below.
   - `CRON_SECRET` — any random string, e.g. `openssl rand -hex 32`.
3. Run migrations against the new project:
   ```bash
   npm run db:migrate
   ```
   This applies, in order: the base schema (`0000_*`), RLS policies (`0001_rls_policies.sql`), and the invite-only signup trigger (`0002_signup_trigger.sql`). The RLS and trigger migrations are hand-written SQL — Drizzle doesn't manage policies/triggers, but `drizzle-kit migrate` runs them fine since they're registered in `drizzle/meta/_journal.json`.
4. **Invite yourself** before signing up — the signup trigger rejects any email not in `invited_emails`:
   ```sql
   insert into invited_emails (email) values ('you@example.com');
   ```
   Run in the Supabase SQL editor, or via `psql "$DATABASE_URL"`.
5. Sign up through Supabase Auth (magic link) with that email once a frontend or the Supabase client exists to drive it. This creates your `public.users` row automatically via the trigger.
6. Set `users.sheet_spreadsheet_id` for yourself (SQL editor, or a future settings UI) to the Google Sheet ID the export worker should write to.

## Importing existing sheet data

```bash
npm run import:xlsx -- "/path/to/exported.xlsx" <your-user-id>
```

Reads the `Categories` and `Days` tabs (same layout as the existing Google
Sheet export), creates the category tree, imports every logged slot, and
validates each code's imported count against the sheet's own **Σ (h/4)**
column (which is a COUNTIF rollup — a top-level code's total already
includes its children's slots; the validator accounts for this).

The importer refuses to write anything if the sheet reuses a code across
two different categories (Postgres will reject the second one via the
per-user unique-code constraint anyway) — fix the duplicate in the sheet
and re-export. Codes referenced in `Days` but absent from `Categories` are
skipped and listed, never silently turned into new categories. Sheet cell
colours aren't recoverable via the (free) `xlsx` reader, so imported
categories get a placeholder palette — recolour via `PATCH
/api/categories/:id` afterward.

Run against Divya's 2026 export while building this: 85 categories, ~14.4k
entries imported; the sheet itself had 3 genuine typo'd codes in `Days`
(`Swimming`, `Pa`, `Mm` — not present in `Categories`) and one duplicate
code (`E` used by both "Eating" and a "Restaurant" child row) that needs
fixing at the source before that particular file can be imported cleanly.

## Sheets export

`PUT /api/entries` enqueues a `sheet_outbox` row per touched day.
`POST /api/export/drain` (guarded by `CRON_SECRET`, called every 15 min by
[`.github/workflows/export-drain.yml`](.github/workflows/export-drain.yml))
drains every user's pending rows. `POST /api/export/sheet` does the same
for just the calling user (an "export now" button).

To wire up the GitHub Actions workflow, set two repo secrets:
- `APP_URL` — the deployed app's base URL.
- `CRON_SECRET` — same value as in `.env.local` / Vercel env vars.

## Development

```bash
npm run dev            # start the dev server
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm run test            # vitest (watch)
npm run test:run        # vitest (once) — what CI runs
npm run db:generate     # after changing src/db/schema.ts, generate a new migration
npm run db:migrate      # apply pending migrations
npm run db:studio       # browse the DB with Drizzle Studio
```

CI (`.github/workflows/ci.yml`) runs typecheck + lint + tests on every PR. The
unit suite covers the pure logic (quick-log parser, date ranges, timezone,
sheet formatting, category-cycle detection, rate limiter); DB integration tests
in `tests/integration` self-skip unless `DATABASE_URL` + `TEST_USER_ID` +
`TEST_CATEGORY_ID` are set. The API contract is documented in
[`docs/API.md`](./docs/API.md) with types in `src/lib/api/types.ts`; the
data-access decision is [ADR 0001](./docs/adr/0001-api-only-data-access.md).

Requires Node 20+; Node 22+ is recommended (`@supabase/supabase-js` warns
on 20 at build time — harmless for now, worth upgrading before it becomes
a hard requirement).

## Security

- `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_SERVICE_ACCOUNT_KEY` are
  server-only env vars, never sent to the browser, never committed
  (`.env*` is gitignored except `.env.example`).
- RLS is enabled on every user-scoped table as defense-in-depth against
  any *direct* Supabase client access (Studio, PostgREST, a future
  browser-side Supabase usage). The app's own Postgres connection
  (`DATABASE_URL`, via Drizzle) uses Supabase's pooler role, which bypasses
  RLS like most direct-connection setups — the API layer is what actually
  scopes every query by `auth.uid()` for that path today.
- Signup is invite-only, enforced by a DB trigger (`0002_signup_trigger.sql`), not just app code.
- See [`../TimeJournal/ARCHITECTURE.md` §10](../TimeJournal/ARCHITECTURE.md#10-security-notes--act-now-independent-of-the-rebuild) — the legacy repo has an uncommitted-but-present `credentials.json` on disk; revoke that service account key and delete the file before the old repo is ever pushed/shared, independent of this rewrite.

## Frontend (Phase 3, in progress)

Mobile-first web app under `src/app` — a route group `(app)` guarded by
`requireUserOrRedirect()`, with a bottom-tab shell (`src/components/AppShell.tsx`).

- `/login` — magic-link sign-in (`src/app/login`); completes via the existing `/auth/callback`.
- `/` — the journal: a vertical day timeline where you tap or drag to paint
  15-min slots, a brush bar with recent categories, and a category bottom sheet
  (`src/components/journal/*`). Writes are optimistic via TanStack Query
  (`src/lib/client/hooks.ts`) against `PUT /api/entries`.
- `/settings` — profile + sign-out (functional); `/insights`, `/categories` are Phase 4 placeholders.

After pulling these changes, install the new deps before running:

```bash
npm install            # adds react, react-dom, @tanstack/react-query, lucide-react
npm run dev
```

### Offline write queue

Paints are durable: `enqueue()` (`src/lib/client/sync.tsx`) writes each slot to an
IndexedDB store (`src/lib/client/idb.ts`, keyed by `day:slot` for dedup) and
optimistically updates the cache, then flushes to `PUT /api/entries`. Flushes
run on paint, on `online`, and on mount — so queued writes survive going offline
*and* a refresh, and replay idempotently (server PK `(user, day, slot)`). The
journal header shows an offline / "N pending" / syncing indicator.

## What's not here yet

- Dashboards, quick-log UI — Phase 4.
- Conflict flag UI (`sync` captures server `conflicts`; the journal doesn't surface them yet) — next Phase 3 item.
Conflict flag: writes carry the `clientUpdatedAt` the client last saw for a slot
(baseline preserved across offline re-edits). `PUT /api/entries` returns any slot
the server changed more recently; `sync.tsx` merges those by `day:slot`. The
journal shows a warning corner on affected slots, a dismissable banner, and an
`aria-live` announcement. Last-write-wins still applies — this only flags. A
slot's flag clears when you repaint it.

Desktop grid (≥1024px): the tall mobile timeline is swapped for a dense 24×4
grid (`src/components/journal/DesktopGrid.tsx`) with keyboard entry — arrow keys
move a cursor, shift+arrows select a range, type a category code + Enter to fill,
Backspace clears, Escape deselects, double-click opens the note sheet. Mouse
click/drag paints with the brush. Switched via `useMediaQuery`.

Category selection (brush model): the app remembers a "brush" — the last-used
category — persisted in `localStorage`. Tapping a slot paints with the brush
(tap again with the same category to clear); drag fills a range.

- Mobile: a circular button floats at center-bottom (above the nav) showing the
  current brush. Tap it → floating cascade picker (`CategoryPicker.tsx`): main
  categories → tap one → adjacent subcategory column (parent shown as "general")
  → select → picker closes and that becomes the brush. Includes an Eraser and a
  Recent group.
- Desktop (≥1024px): a persistent category list sits to the right of the grid
  (`DesktopPalette.tsx`); click to set the brush. Keyboard code-entry still
  direct-fills; Backspace clears.

The old bottom brush bar / bottom sheet and the nav's center button were removed.

Rolling 24h view: by default the journal shows the last 24 hours ending at the
top of the current hour (so the current hour is the bottom row), spanning across
midnight. Cells are `(day, slot)` pairs (`src/lib/journalWindow.ts`); the grid
fetches both days it touches via two per-day queries (so the per-day optimistic
cache/invalidation still applies). The calendar pins a specific past day
(00:00–24:00); a "Live" button returns to the rolling window.

Calendar: the journal header (date + calendar icon) opens a month picker
(`src/components/journal/CalendarSheet.tsx`) with a per-day density dot; picking
today returns to Live, picking any other day pins it.

Undo/redo: every journal edit (paint, drag-fill, note, clear) goes through a
single `commit()` that records the affected slots' state before (for undo) and
the writes it applied after (for redo) onto per-day stacks; both replay through
the same queue. Undo = header button or Cmd/Ctrl+Z; redo = header button,
Cmd/Ctrl+Shift+Z, or Ctrl+Y. A new edit clears the redo branch; both stacks reset
when you switch days.

Per-slot notes: long-press a slot on the timeline to open a sheet with the slot's
time, category, an optional note field, clear-slot, and copy-previous-slot. Notes
show as a small dot on the slot. (Repainting a slot replaces its row, so it
clears the note — matching the server's upsert semantics.)
- A wired test database for the integration suite (self-skips until then).
- `saved_queries` import from the sheet (this export only has `Days` + `Categories` tabs; no `Queries` tab was present to import from).
- Materialized daily-totals view (§9: revisit only past ~1M rows; not needed at this scale).
