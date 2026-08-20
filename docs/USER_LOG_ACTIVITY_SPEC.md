# User Log Activity — Implementation Spec

Portable specification for a **user activity / transaction log** subsystem: an append-only audit stream of everything users do (navigation, CRUD, imports/exports, auth, errors) plus an admin console at `/admin/user-log-activity` to search, filter, inspect and export it.

Written so it can be implemented **from scratch in any Next.js (App Router) + Postgres/Supabase project**, or packaged as an agent skill (see [§13](#13-packaging-this-spec-as-a-skill)). The JKKN COE implementation is the reference; every file path below points at working code.

| | |
|---|---|
| **Route** | `/admin/user-log-activity` |
| **Table** | `transaction_logs` |
| **Permission** | `page.admin.user_log_activity.view` (roles: `admin`, `super_admin`) |
| **Stack assumed** | Next.js 15 App Router, TypeScript, Supabase (service role on server), Shadcn UI, Tailwind |
| **Related spec** | Search & favorites registration — `.claude/skills/search-and-favorites/SKILL.md` |

---

## 1. Scope

### In scope

1. **Capture** — server-side helper for API routes, client-side batched service for UI events, React hook wrapper.
2. **Storage** — one wide append-only table with before/after JSON snapshots.
3. **Read API** — paginated + filtered list, aggregate stats.
4. **Console** — admin page: 4 scorecards, filter bar, table, detail sheet, Excel export.
5. **Registration** — nav entry, page permission seed, Ctrl+K search + favorites availability.

### Out of scope (deliberately)

- **Domain audit trails with legal/regulatory weight.** Mark changes, result declaration approvals and similar go to their own domain tables with DB triggers (see the `exam-audit-trail` skill). `transaction_logs` is an *operational* log: best-effort, lossy under failure, never blocks a write.
- **Log shipping / SIEM export**, alerting, anomaly detection.
- **Real-time tailing.** The console is poll-on-demand (Refresh button).

### Non-negotiable invariants

| # | Invariant | Why |
|---|---|---|
| I1 | Logging **never throws** into the caller. All writes are try/catch swallowed. | A failed log must never fail a user's save. |
| I2 | `user_id` / `session_id` are resolved **server-side from the session token**, never taken from the request body. | Client-supplied identity is forgeable. |
| I3 | The table is **append-only**. No UPDATE, no user-facing DELETE. Purge only by scheduled retention job. | An editable audit log is not an audit log. |
| I4 | The read API is **admin-only**. | Rows contain IPs, emails and full record snapshots. |
| I5 | `old_values` / `new_values` must be **scrubbed of secrets** before insert. | Snapshots otherwise capture tokens, password hashes, API keys. |

---

## 2. Architecture

```
CAPTURE
  lib/logging/server-transaction-log.ts       ← API routes: logTransaction() / fetchOldValues()
  services/logging/transaction-log-service.ts ← browser singleton: queue + batch + typed loggers
  hooks/use-transaction-log.ts                ← React wrapper (+ automatic page-view tracking)
  components/layout/nav-main.tsx              ← calls useNavigationLog() on every menu click

TRANSPORT
  app/api/transaction-logs/route.ts           ← POST (single write) + GET (admin read)
  app/api/transaction-logs/batch/route.ts     ← POST (≤50 entries, fire-and-forget)
  app/api/transaction-logs/stats/route.ts     ← GET (scorecard aggregates)

STORE
  transaction_logs  ← append-only; joins to users + sessions by id

VIEW
  app/(coe)/admin/user-log-activity/page.tsx  ← console (scorecards, filters, table, sheet, export)

REGISTRATION
  lib/navigation-data.ts                          ← nav entry → sidebar + Ctrl+K search + favorites
  supabase/migrations/*_seed_page_permissions.sql ← page.admin.user_log_activity.view
```

**Two independent write paths, one read path.** The server path (`logTransaction`) reads the session from the **cookie**; the client path (`transactionLogService`) sends the token in the **body**, because it cannot reliably attach an httpOnly cookie to its own fetch across environments. Both converge on the same server-side session lookup.

---

## 3. Data model

### 3.1 DDL

> The live COE table predates this repo's migration folder. This DDL is the normative definition — reproduce it exactly in a new project.

```sql
CREATE TABLE IF NOT EXISTS transaction_logs (
	id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id       UUID,                    -- resolved server-side; NULL for anonymous/expired session
	session_id    UUID,                    -- sessions.id
	action        TEXT NOT NULL,           -- see §5.5 vocabulary
	resource_type TEXT,                    -- 'course' | 'page' | 'session' | 'ui_element' | ...
	resource_id   TEXT,                    -- page path for UI events, business key for CRUD
	old_values    JSONB,                   -- pre-change snapshot (UPDATE/DELETE only)
	new_values    JSONB,                   -- post-change snapshot (CREATE/UPDATE only)
	ip_address    TEXT,
	user_agent    TEXT,
	status        TEXT NOT NULL DEFAULT 'success'
	              CHECK (status IN ('success','error','pending')),
	error_message TEXT,
	metadata      JSONB DEFAULT '{}'::jsonb,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The console always sorts newest-first and filters on created_at:
CREATE INDEX IF NOT EXISTS idx_txlog_created_at   ON transaction_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txlog_user_created ON transaction_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txlog_action       ON transaction_logs (action);
CREATE INDEX IF NOT EXISTS idx_txlog_resource     ON transaction_logs (resource_type, resource_id);
-- Partial index: error triage is the hottest non-default filter
CREATE INDEX IF NOT EXISTS idx_txlog_errors       ON transaction_logs (created_at DESC)
	WHERE status = 'error';

ALTER TABLE transaction_logs ENABLE ROW LEVEL SECURITY;
-- No permissive policies: all access goes through the service-role server client (§7.5).
```

**No foreign keys on `user_id` / `session_id`.** Deliberate — logs must survive user and session deletion, and in a parent/child-app setup the id may belong to the parent tenant. Names are resolved at read time instead (§6.3).

### 3.2 Column contract

| Column | Set by | Rule |
|---|---|---|
| `user_id`, `session_id` | server only | From the session-token lookup. Never from the body. NULL is valid and must render as `-`. |
| `action` | caller | Lower snake_case verb. Required — reject with `400` if missing. |
| `resource_type` | caller | Singular noun, snake_case. NULL allowed for global actions. |
| `resource_id` | caller | **Convention: the page path** (`/master/courses`) for console readability; the record UUID goes in `metadata.record_id`. |
| `old_values` | caller | Must be fetched **before** the mutation, else it is lost. |
| `new_values` | caller | The row as written, not the request body (defaults and triggers matter). |
| `ip_address` | server | Header priority: `cf-connecting-ip` → `true-client-ip` → first of `x-forwarded-for` → `x-real-ip` → NULL. |
| `user_agent` | server | Raw UA header. |
| `status` | caller | `success` \| `error` \| `pending`. Default `success`. |
| `error_message` | caller | Set together with `status='error'`. Message only, never a full stack. |
| `metadata` | both | The caller object **merged with** `{ user_email }` server-side. |

### 3.3 Retention

Unbounded growth is this table's default failure mode — navigation events alone produce tens of rows per user-session.

```sql
CREATE OR REPLACE FUNCTION purge_transaction_logs() RETURNS void AS $$
BEGIN
	-- High-volume, low-value telemetry: 90 days
	DELETE FROM transaction_logs
	WHERE created_at < NOW() - INTERVAL '90 days'
	  AND action IN ('navigation','page_view','click','search');

	-- Everything else (CRUD, auth, errors, file ops): 2 years
	DELETE FROM transaction_logs
	WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;
```

Schedule daily (pg_cron, a Supabase scheduled function, or an `/api/cron/*` route). **Decide the retention window before go-live** — it is a data-protection commitment, not a tuning knob.

---

## 4. Session resolution (shared by every write path)

Both write paths run the identical lookup. Reproduce it verbatim — each clause fixes a real bug:

```ts
const { data: sessions } = await supabase
	.from('sessions')
	.select('id, user_id')
	.eq('session_token', accessToken)   // access_token IS the session_token
	.eq('is_active', true)
	.gt('expires_at', new Date().toISOString())
	.order('created_at', { ascending: false })
	.limit(1)                            // NOT .single()
```

| Clause | Bug it prevents |
|---|---|
| `.limit(1)` + `.order(created_at desc)` | Duplicate active sessions per user do occur; `.single()` throws and silently kills logging. |
| `.gt('expires_at', now)` | Zombie rows attribute new activity to a stale user. |
| `.eq('is_active', true)` | Logged-out sessions keep collecting events. |

Failure returns `{ userId: null, sessionId: null }` and the log is **still written** (anonymous). Never drop the row.

Reference: [server-transaction-log.ts:26-51](../lib/logging/server-transaction-log.ts#L26-L51), [transaction-logs/route.ts:5-31](../app/api/transaction-logs/route.ts#L5-L31).

---

## 5. Capture layer

### 5.1 Server helper — `lib/logging/server-transaction-log.ts`

```ts
export async function logTransaction(params: {
	action: 'create' | 'read' | 'update' | 'delete'
	resource_type: string
	resource_id?: string
	old_values?: Record<string, unknown> | null
	new_values?: Record<string, unknown> | null
	status?: 'success' | 'error'
	error_message?: string | null
	metadata?: Record<string, unknown>
}): Promise<void>

export async function fetchOldValues(
	table: string, id: string, idColumn = 'id'
): Promise<Record<string, unknown> | null>
```

- Reads the `access_token` **cookie** via `next/headers`, then runs the §4 lookup.
- The whole body is wrapped in try/catch; on failure it logs to console and returns (I1).
- `Promise.all` the session lookup and the header read — they are independent.

**Usage in an API route (the canonical CRUD triad):**

```ts
// CREATE
await logTransaction({
	action: 'create', resource_type: 'course', resource_id: '/master/courses',
	new_values: data, metadata: { record_id: data.id },
})

// UPDATE — old values MUST be fetched before the write
const oldRecord = await fetchOldValues('courses', id)
// ...perform update...
await logTransaction({
	action: 'update', resource_type: 'course', resource_id: '/master/courses',
	old_values: oldRecord, new_values: updated, metadata: { record_id: id },
})

// FAILURE
await logTransaction({
	action: 'update', resource_type: 'course', resource_id: '/master/courses',
	status: 'error', error_message: error.message, metadata: { record_id: id },
})
```

Reference adopters: [master/courses/[id]/route.ts](<../app/api/master/courses/[id]/route.ts>), [role-management/assign/route.ts](../app/api/admin/role-management/assign/route.ts).

### 5.2 Client service — `services/logging/transaction-log-service.ts`

Browser singleton with two write modes:

| Method | Mode | Use for |
|---|---|---|
| `log(entry)` | awaited `POST /api/transaction-logs` | CRUD confirmations, file operations, errors — anything whose loss matters |
| `queueLog(entry)` | batched `POST /api/transaction-logs/batch` | navigation, page views, clicks, searches |

**Batching:** `MAX_BATCH_SIZE = 10`, `BATCH_DELAY = 100ms`. The queue flushes on whichever comes first, then drains recursively while non-empty. An `isProcessing` flag guards re-entrancy.

**Identity:** `access_token` from the `access_token` cookie (js-cookie), `user_email` from `localStorage.user_data`. Both are *hints* — the server re-derives the real identity (I2). The email is stored in `metadata.user_email` as a human-readable fallback for rows where `user_id` is NULL.

**Typed loggers** (each builds the correct action/resource shape so callers never hand-write action strings): `logNavigation`, `logPageView`, `logCreate`, `logUpdate`, `logDelete`, `logClick`, `logSearch`, `logFileOperation`, `logError`, `logAuth`.

> `logFileOperation` sets `status: 'error'` automatically when `error_count > 0`, so partial imports surface in the error scorecard.

### 5.3 React hook — `hooks/use-transaction-log.ts`

`useTransactionLog({ trackPageViews })` returns all typed loggers plus `log` / `queueLog` / `user`. With `trackPageViews: true` it watches `usePathname()` and emits `page_view` on first render and `navigation` (carrying `from_path`) thereafter, deduped through a `lastPathRef`.

`useNavigationLog()` is the minimal variant used by the sidebar.

### 5.4 Wiring points

| Event | Where | Call |
|---|---|---|
| Sidebar menu click | `components/layout/nav-main.tsx` | `logNavigation({ to_path, menu_title, menu_section })` |
| Login / logout / refresh / expiry | auth context + session-timeout hook | `logAuth('login' \| 'logout' \| 'session_refresh' \| 'session_expired')` |
| Any CRUD API route | route handler | `logTransaction(...)` (§5.1) |
| Excel import/export | import/export handler | `logFileOperation({ operation, records_count, error_count })` |

### 5.5 Action vocabulary

Keep this closed — the console's Action filter is populated from distinct values, so free-form strings fragment it.

| Action | `resource_type` | Written by |
|---|---|---|
| `create` / `read` / `update` / `delete` | domain entity | server helper |
| `navigation` | `page` | client (batched) |
| `page_view` | `page` | client (batched) |
| `click` | `ui_element` | client (batched) |
| `search` | domain entity | client (batched) |
| `file_import` / `file_export` / `file_upload` / `file_download` | domain entity | client (awaited) |
| `auth_login` / `auth_logout` / `auth_session_refresh` / `auth_session_expired` | `session` | client (batched) |

---

## 6. API contracts

### 6.1 `POST /api/transaction-logs` — single write

**Body:** `action` (required), `resource_type?`, `resource_id?`, `old_values?`, `new_values?`, `metadata?`, `status?` (default `success`), `error_message?`, `access_token?`, `user_email?`

**Responses:** `200 { success: true, id }` · `400 { error: 'Action is required' }` · `500 { error }`

The server overwrites `user_id`, `session_id`, `ip_address`, `user_agent` and merges `user_email` into `metadata`.

### 6.2 `POST /api/transaction-logs/batch` — bulk write

**Body:** `{ entries: TransactionLogEntry[], access_token?, user_email? }`

**Rules:** non-empty array required (`400`); **max 50 entries** (`400 'Maximum 50 entries per batch'`); one session lookup and one `insert()` for the whole batch.

**Response:** `200 { success: true, count }`

### 6.3 `GET /api/transaction-logs` — admin read

| Query param | Type | Behaviour |
|---|---|---|
| `page` | int, default `1` | offset = `(page-1) * limit` |
| `limit` | int, default `50` | **cap at 500** in new implementations (§9 G3) |
| `user_id`, `action`, `resource_type`, `status` | exact match | omitted → no filter |
| `from_date`, `to_date` | ISO | `gte` / `lte` on `created_at` |

Ordered `created_at DESC`, ranged, with `count: 'exact'`.

**User enrichment — no FK join.** Collect the distinct non-null `user_id`s on the page, issue one `users.select('id,email,full_name').in('id', ids)`, and merge the result onto each row as a `users` object (`null` when unresolved).

**Response:**
```json
{ "data": [{ "...log": "", "users": { "id": "", "email": "", "full_name": "" } }],
  "pagination": { "page": 1, "limit": 50, "total": 0, "total_pages": 0 } }
```

### 6.4 `GET /api/transaction-logs/stats` — scorecards

Four parallel queries over **today** (`created_at >= start of day`):

| Field | Source |
|---|---|
| `today_total` | `count(*)` head query |
| `success_rate` | `success / total * 100`, rounded to 1 dp; **`100` when total is 0** |
| `today_errors` | `count(*)` where `status='error'` |
| `unique_users_today` | distinct non-null `user_id` — `select('user_id').range(0, 9999)` then `Set` |

> The reference implementation uses `setUTCHours(0,0,0,0)`. For an IST-operating institution this shifts "today" by 5h30m — see §9 G5.

---

## 7. Admin console — `/admin/user-log-activity`

A single client component (`'use client'`) built from Shadcn primitives, following the project's SaaS page pattern (`saas-ui-patterns` skill).

### 7.1 Regions, top to bottom

1. **Breadcrumb** — Dashboard › Admin › User Log Activity.
2. **Scorecards** — 4 cards, `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, each with a left accent border and a muted icon:

| Card | Value | Accent | Icon |
|---|---|---|---|
| Today's Logs | `today_total` | blue | `Activity` |
| Success Rate | `success_rate%` | emerald | `CheckCircle2` |
| Errors Today | `today_errors` | rose | `AlertCircle` |
| Users Today | `unique_users_today` | purple | `Users` |

Loading shows `...`, not a spinner swap.

3. **Filter bar** — Action select · Resource select · Status select (`All / Success / Error / Pending`) · From date · To date · Search input (`Search user, email, action...`) · Refresh · Export · Clear (rendered only when `hasActiveFilters`).
4. **Table** — sticky header, columns:

| Column | Content |
|---|---|
| Date & Time (140px) | `dd MMM yyyy` over `hh:mm:ss a`, locale `en-IN` |
| User | `full_name` over muted `email` (fallback `metadata.user_email`, then `-`) |
| Action | outline badge, `formatAction()` turns `snake_case` into `Title Case` |
| Resource | `resource_type` over muted `resource_id` |
| Status (100px) | emerald / red / amber badge |
| IP Address | monospace, `-` when null |
| Details (60px, centered) | eye button → opens the detail sheet |

Loading and empty states occupy a `colSpan={7}` row of height `h-32`.

5. **Pagination footer** — page-size select `[10, 25, 50, 100]` (default 25), `Page X of Y`, prev/next.
6. **Detail sheet** — right side, `sm:max-w-[720px]`, sections in order: **General Information** (2-col: date/time, status, user + email, IP, action, resource + id) → **Error Message** (red panel, conditional) → **Previous Values** → **New Values** → **Metadata** (each a pretty-printed `<pre>`, `max-h-[200px]`, scrollable, rendered only when non-empty) → **User Agent** → **Internal IDs** (log / session / user, monospace).

### 7.2 Fetch behaviour

- Filters and pagination are **server-side**; changing any filter resets `currentPage` to 1.
- The free-text search box filters **only the current page** client-side (name, email, action, resource_type, `metadata.user_email`). Label it accordingly or promote it to a server filter (§9 G4).
- Filter dropdown options are derived on mount from a `limit=1000` sample — a stopgap; see §9 G2.

### 7.3 Export

Refetches with the **current filters** at `limit=5000`, maps to a flat sheet (Date, Time, User, Email, Action, Resource Type, Resource ID, Status, IP Address, Error) and writes `user-log-activity-YYYY-MM-DD.xlsx`. Rows beyond 5000 are dropped silently — surface a toast when `total > 5000`.

### 7.4 States

| State | Rendering |
|---|---|
| Stats loading | `...` in each card |
| Table loading | spinner row, `colSpan=7` |
| Empty (no logs) | `ScrollText` icon + "No logs found" |
| Empty (filters active) | same, plus a Clear Filters affordance |
| Row with null user | `-` and muted `metadata.user_email` |

### 7.5 Access control

- Nav entry in `lib/navigation-data.ts` under **Administration** with `permission: 'page.admin.user_log_activity.view'`, icon `ScrollText`.
- Permission row seeded in `supabase/migrations/*_seed_page_permissions.sql` for `['admin','super_admin']`.
- Sidebar visibility keys off that permission. **That alone is not access control** — see §9 G1.

---

## 8. Search & favorites registration

Adding the nav entry to `lib/navigation-data.ts` is what makes the page reachable from **all three** surfaces — do not register it anywhere else:

1. **Sidebar** — role/permission filtered.
2. **Ctrl+K command menu** — `getFlatNavItems()` flattens `navMain`, skipping `url === '#'` placeholders.
3. **Favorites** — the page becomes star-able and appears in the Favorites sidebar group and the `/favorites` manager.

```ts
{ title: 'User Log Activity', url: '/admin/user-log-activity', icon: ScrollText,
  permission: 'page.admin.user_log_activity.view' }
```

Optional in-page star toggle:

```tsx
const { isFavorite, toggleFavorite } = useFavorites()

<button onClick={() => toggleFavorite('/admin/user-log-activity', 'User Log Activity', 'Administration')}>
	<Star className={isFavorite('/admin/user-log-activity') ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
</button>
```

Full favorites/search mechanics, cache-safety rules and known failure modes: `.claude/skills/search-and-favorites/SKILL.md`.

---

## 9. Known gaps — fix these when porting

Ordered by severity. G1 and G2 are **required** before a new deployment.

| # | Gap | Impact | Fix |
|---|---|---|---|
| **G1** | `GET /api/transaction-logs` and `/stats` perform **no auth or role check**, run on the service-role client, and `/api/transaction-logs` is **CSRF-exempt** (`lib/security/csrf.ts:63`). The repo has no `middleware.ts`, so the page guard is sidebar visibility only. | Anyone who can reach the origin can page through every user's IP, email and record snapshots. | Resolve the session inside the GET handlers (§4), assert `admin`/`super_admin`, return `403` otherwise. Keep the CSRF exemption on **POST-only** paths. |
| **G2** | Filter options come from a `limit=1000` sample of the newest logs. | Actions and resources absent from the last 1000 rows are unfilterable. | Add `GET /api/transaction-logs/filters` backed by `SELECT DISTINCT action` / `SELECT DISTINCT resource_type` (or a small materialized view refreshed hourly). |
| **G3** | `limit` is unbounded — `?limit=999999` is accepted. | Trivial memory/DoS vector; also lets one request pull the whole table. | `const limit = Math.min(parseInt(...) || 50, 500)`. |
| **G4** | Free-text search filters only the loaded page. | Searching for a user shows nothing unless they acted within the current 25 rows. | Add a `q` param doing `or(...ilike...)` server-side, or filter by `user_id` from a user picker. |
| **G5** | Stats use a **UTC** day boundary. | "Today" starts at 05:30 IST; early-morning activity lands in the wrong bucket. | Compute the boundary in the institution's timezone (`Asia/Kolkata`) or read an app-timezone config. |
| **G6** | `old_values` / `new_values` store the **whole** row. | Password hashes, tokens and API keys can land in the log and then in an Excel export. | Pass every snapshot through a field denylist before insert (I5). |
| **G7** | Export caps at 5000 rows silently. | Users believe they exported everything. | Warn when `pagination.total > 5000`, or stream a server-side export. |
| **G8** | `app/api/pdf-settings/route.ts:392` defines a **second, incompatible** `logTransaction(supabase, {...})`. | Drift — schema changes must be made twice. | Delete it and import the shared helper. |
| **G9** | `resolveSession()` console-logs the access token's head and tail. | Token fragments end up in server log aggregators. | Remove those `console.log`s or gate them behind `NODE_ENV !== 'production'`. |
| **G10** | No retention job in the reference deployment. | The table grows without bound and the console's `count: 'exact'` degrades with it. | Ship §3.3 alongside the first migration. |

---

## 10. Acceptance criteria

**Capture**
- [ ] A create/update/delete through any instrumented API route produces exactly one row with the correct `action`, `resource_type`, `resource_id`, and a non-null `user_id` for a logged-in user.
- [ ] An update row carries **both** `old_values` and `new_values`, and they differ.
- [ ] A forced API failure produces `status='error'` with `error_message` set and `new_values` null.
- [ ] Breaking the log table mid-request still returns **200** from the business endpoint (I1).
- [ ] Navigating 15 menu items produces 15 rows via **at most 2** batch requests.
- [ ] A request with a forged `user_id` in the body is stored with the **session-derived** id (I2).
- [ ] An expired or inactive session writes the row with `user_id = NULL` rather than dropping it.

**API**
- [ ] `POST` without `action` → `400`.
- [ ] Batch of 51 entries → `400`.
- [ ] `GET` filters compose (action + status + date range) and `total_pages` equals `ceil(total/limit)`.
- [ ] Rows whose user was deleted still return, with `users: null`.
- [ ] `stats` returns `success_rate: 100` on a day with zero logs (no divide-by-zero).
- [ ] A non-admin session gets `403` from both read endpoints *(after G1)*.

**Console**
- [ ] Scorecards match SQL run directly against the table for the same day.
- [ ] Changing any filter resets to page 1.
- [ ] Clear Filters restores the unfiltered first page and hides itself.
- [ ] The detail sheet omits the Previous / New / Metadata sections when those objects are empty.
- [ ] Export respects active filters and the filename carries today's date.
- [ ] The empty state renders when filters match nothing.

**Registration**
- [ ] The page appears in the sidebar for `admin` / `super_admin` and is absent for other roles.
- [ ] The page is findable via Ctrl+K and can be starred into Favorites.

---

## 11. Verification queries

```sql
-- Volume by action, last 7 days (sizes the retention policy)
SELECT action, COUNT(*), MIN(created_at), MAX(created_at)
FROM transaction_logs WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action ORDER BY 2 DESC;

-- Orphan rate: logs that failed session resolution
SELECT COUNT(*) FILTER (WHERE user_id IS NULL) * 100.0 / NULLIF(COUNT(*),0) AS pct_anonymous
FROM transaction_logs WHERE created_at > NOW() - INTERVAL '1 day';
-- Sustained >20% means the session lookup is broken (§4), not that users are anonymous.

-- Today's error triage
SELECT created_at, action, resource_type, resource_id, error_message
FROM transaction_logs WHERE status = 'error' AND created_at >= CURRENT_DATE
ORDER BY created_at DESC LIMIT 50;

-- Did any secret leak into a snapshot? (run after implementing G6)
SELECT id, resource_type FROM transaction_logs
WHERE new_values::text ~* '(password|token|secret|api_key)' LIMIT 20;

-- Table footprint
SELECT pg_size_pretty(pg_total_relation_size('transaction_logs')), COUNT(*) FROM transaction_logs;
```

---

## 12. Porting checklist

1. Create the table, indexes and retention job (§3).
2. Confirm the host project's session model. This spec assumes a `sessions` table with `session_token`, `is_active`, `expires_at`, `user_id`. **With Supabase Auth instead**, replace §4 with `supabase.auth.getUser()` and drop `session_id` (or store `sub` / `session_id` from the JWT).
3. Implement `logTransaction` + `fetchOldValues`, then instrument routes **in this order**: auth → destructive (delete/bulk) → update → create → read.
4. Implement the client service and hook; wire navigation logging into the nav component.
5. Build the four API routes, including the G1/G3 hardening from day one.
6. Build the console page.
7. Register the nav entry and permission seed; verify sidebar, Ctrl+K and favorites (§8).
8. Run the §10 acceptance criteria and the §11 queries against real traffic for one day.

**Adjust per project:** table and route names, permission key and role names, locale (`en-IN`) and timezone, page-size options, export cap, retention windows, and the action vocabulary in §5.5.

---

## 13. Packaging this spec as a skill

Layout (per `.codex/skills/skill-creator/SKILL.md` — SKILL.md body stays under ~500 lines, detail moves into `references/`, no README/CHANGELOG files):

```
user-log-activity/
├── SKILL.md                      ← §2 architecture, §5 capture, §9 gaps, navigation to references
└── references/
    ├── data-model.md             ← §3 DDL, column contract, retention
    ├── api-contracts.md          ← §4 session resolution, §6 endpoints
    ├── console-ui.md             ← §7 UI spec, §8 registration
    └── verification.md           ← §10 acceptance criteria, §11 SQL
```

Frontmatter (`name` + `description` only; the description is the sole trigger surface, so it must carry the "when"):

```yaml
---
name: user-log-activity
description: User activity / transaction logging subsystem — append-only transaction_logs table, server + batched client capture, and the admin console at /admin/user-log-activity with filters, detail sheet and Excel export. Use when implementing, debugging or extending activity logging, audit-style transaction logs, "who changed what" tracking, the user log activity page, or navigation/page-view telemetry. Triggers on "activity log", "transaction log", "user log activity", "audit log page", "who did what", "log user actions", "logTransaction", "navigation logging", "logs show null user".
---
```
