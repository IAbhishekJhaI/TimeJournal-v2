# TimeJournal

Log your life in 15-minute blocks. TimeJournal is a mobile-first web app for
fine-grained time tracking — a rolling 24-hour grid of 96 quarter-hour slots you
paint with a personal, two-level category taxonomy, plus dashboards to see where
your time actually goes.

**Live demo:** [time-journal-xi.vercel.app](https://time-journal-xi.vercel.app)

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E?logo=supabase&logoColor=white" />
  <img alt="Drizzle" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" />
</p>

---

## Why

Time was originally logged in a Google Sheet — one row per day, 96 columns of
category codes, `COUNTIF` formulas for totals. It worked, but a spreadsheet has
no integrity (a typo silently becomes a new category), no history, clunky input,
and — in the old app — a service-account key sitting in the browser.

TimeJournal keeps the familiar 15-minute-slot mental model but moves the source
of truth to a real database, adds a fast touch-first input UI and proper
analytics, and keeps the old Google Sheet working as a one-way, read-only
mirror so nothing is lost.

## Features

**Logging**
- Rolling **last-24-hours** grid ending at the current hour (spans midnight), or pin any past day.
- **Tap or drag** to paint slots; a remembered "brush" (last-used category) makes repeat logging one tap.
- **Cascading category picker** — main categories → subcategories — from a center-bottom button on mobile, or a persistent side palette on desktop.
- **Keyboard entry** on desktop: arrow-key cursor, type a code + Enter to fill, shift-select ranges.
- **Per-slot notes**, **undo/redo** (multi-level, `Cmd/Ctrl+Z` / `Shift+Z`), and an **eraser**.

**Analysis**
- **Insights dashboard** — day / week / month / year, grouped by category, parent, or colour; donut + ranked breakdown + "% of period logged."
- **Calendar** with a per-day density indicator to jump around your history.

**Data & sync**
- **Offline-first**: writes queue in IndexedDB, update the UI optimistically, and replay idempotently on reconnect — logging never blocks on the network.
- **Last-write-wins** across devices, with conflicting slots flagged (never silently lost).
- **One-way Google Sheets mirror** via an outbox table drained by a scheduled worker.
- **CSV export** of your data; **one-time importer** for the legacy sheet.

**Accounts**
- **Invite-only** magic-link sign-in; timezone detected automatically.
- **Category editor** for a 2-level taxonomy: add, rename, recolour, reorder, re-parent, archive (never hard-delete history).

## Screenshots

> Add images to `docs/screenshots/` (journal, insights, category editor) — or try the [live demo](https://time-journal-xi.vercel.app).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Data layer | TanStack Query + a durable IndexedDB write queue |
| Backend | Next.js Route Handlers (`/api/*`) — a modular monolith |
| Database | Postgres on Supabase, [Drizzle ORM](https://orm.drizzle.team) |
| Auth | Supabase Auth (email magic link) + a DB-level invite allowlist trigger |
| Sheets export | Outbox table + GitHub Actions cron → Google Sheets API |
| Testing / CI | Vitest + GitHub Actions (typecheck · lint · test) |

## Architecture

```mermaid
flowchart LR
    UI["Next.js UI<br/>rolling grid · insights"] -->|session cookie| API["Route Handlers<br/>/api/*"]
    UI -->|magic link| AUTH["Supabase Auth"]
    API --> PG[("Postgres<br/>via Drizzle")]
    API -->|write entry + outbox row| PG
    CRON["GitHub Actions<br/>every 15 min"] -->|drain outbox| PG
    CRON -->|Sheets API, server-side| SHEET[("Google Sheet<br/>read-only mirror")]
```

Key decisions:
- **Slot rows, not time ranges** — `time_entries` is keyed on `(user_id, day, slot 0–95)`, mirroring the grid, making writes idempotent upserts and analytics a `GROUP BY`.
- **API-only data access** — the browser uses Supabase purely for auth; every query is scoped to the authenticated user in the API layer, with Postgres Row-Level Security as a defense-in-depth backstop.
- **Eventually-consistent export** — each write enqueues a `(user, day)` outbox row; a cron worker rewrites just that sheet row server-side, so the sheet lags reality by at most the cron interval.

## Getting started

Requires Node 20+ (22+ recommended) and a free Supabase project.

**1. Install**

```bash
npm install
```

**2. Configure** — copy `.env.example` to `.env.local` and fill in:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server-only secret key) |
| `DATABASE_URL` | Connect → **Transaction pooler** (port 6543); the app connects with `prepare: false` |
| `MIGRATE_DATABASE_URL` | Connect → **Session pooler** (port 5432); used only by `db:migrate` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Cloud service-account JSON (Sheets scope), one line — optional, only for sheet export |
| `CRON_SECRET` | any random string, e.g. `openssl rand -hex 32` |

> The transaction pooler (6543) is right for the serverless app but can't run
> migrations reliably (session-level advisory locks); point `MIGRATE_DATABASE_URL`
> at the session pooler (5432). Verify connectivity any time with `npm run db:check`.

**3. Migrate** — creates tables, RLS policies, and the invite-only signup trigger:

```bash
npm run db:migrate
```

**4. Invite yourself** (the signup trigger rejects any email not on the allowlist) in the Supabase SQL editor:

```sql
insert into invited_emails (email) values ('you@example.com');
```

**5. Run**

```bash
npm run dev
```

Open the app, sign in with the magic link, and add a few categories (or import an
existing sheet, below).

## Importing an existing sheet

```bash
npm run import:xlsx -- "/path/to/exported.xlsx" <your-user-id>
```

Reads the `Categories` and `Days` tabs, builds the category tree, imports every
logged slot, and validates each code's count against the sheet's own totals. It
refuses to write if a code is reused across two categories, and lists (never
silently invents) codes present in `Days` but missing from `Categories`.

## Sheets export

`PUT /api/entries` enqueues a `sheet_outbox` row per touched day.
`POST /api/export/drain` (guarded by `CRON_SECRET`, called every 15 min by
[`.github/workflows/export-drain.yml`](.github/workflows/export-drain.yml)) drains
all pending rows server-side; `POST /api/export/sheet` does the same for just the
calling user (the "Export now" button). Set repo secrets `APP_URL` and
`CRON_SECRET` to enable the workflow.

## Development

```bash
npm run dev          # dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test:run     # vitest (once) — what CI runs
npm run db:check     # verify DATABASE_URL connects
npm run db:studio    # browse the DB in Drizzle Studio
```

CI runs typecheck + lint + tests on every push/PR. The unit suite covers the pure
logic (quick-log parser, date ranges, timezone, sheet formatting,
category-cycle detection, rate limiter); DB integration tests self-skip unless a
test database is configured.

## Security

- Service keys (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`) are server-only and never reach the browser; `.env*` is gitignored.
- Sign-in is **invite-only**, enforced by a DB trigger — not just app code.
- Row-Level Security is enabled on every user table as a backstop; the API layer scopes every query to the authenticated user.
- Invitee emails are never exposed to clients (the invites endpoint returns counts only).

## Roadmap

- [ ] Quick-log free-text UI (the parser API already exists)
- [ ] Saved-query tiles and streaks on Insights
- [ ] PWA install / service worker
- [ ] Comparative dashboards between users (opt-in)

## License

No license yet — all rights reserved. Add a `LICENSE` file (e.g. MIT) to
open-source it.
