# JKKN COE Portal — Audit Report

**Date:** 10 October 2026
**Scope covered in this pass:** authentication and sessions, authorisation of the API surface, the unauthenticated (public-prefix) routes, and SQL row limits / truncated results.
**Not yet covered:** per-screen UI/UX and accessibility review, performance baselines, RLS policy review table by table, and end-to-end workflow tests. These are listed under [What remains](#what-remains).

Companion files: [route-inventory.md](route-inventory.md) — every API route with its methods and checks (`node scripts/audit-route-inventory.cjs`); [api-policy-coverage.md](api-policy-coverage.md) — which routes have a permission rule, which are still open and why (`node scripts/generate-api-policy.cjs`).

> This document describes weaknesses in a live system. Treat it as confidential until the fixes below are deployed.

---

## 1. Summary

| | |
|---|---|
| API routes inventoried | 397 (324 behind the COE session, 73 under public prefixes) |
| Routes using the service-role key (RLS bypassed) | 363 |
| Findings fixed | 33 |
| Findings open | 13 (four of them narrowed to a residual) |
| Automated tests added | 46 unit tests (`npm test`), plus four live checks |

The two most serious problems were both systemic and are both fixed in code, pending deployment:

1. **Anyone on the internet could act as any COE user, including a super admin, without a password.** The session cookie was accepted on presence alone, and `/api/auth/sync-session` would create a session for whatever email it was sent.
2. **Any read that matched more than 1,000 rows silently returned only the first 1,000.** `.range(0, 9999)` — used 147 times as "fetch everything" — never lifted the cap. On today's data that affects every large table (57,497 exam registrations, 29,451 final marks, 28,933 attendance rows).

---

## 2. Findings fixed

Severity reflects the state *before* the fix.

### Authentication and sessions

| # | Severity | Finding | Fix |
|---|---|---|---|
| A1 | Critical | **Session forgery.** `proxy.ts` let a request through if `access_token` and `coe_access` cookies merely existed. Any value worked, and ~290 routes had no further check. | `proxy.ts` now verifies the token against the `sessions` table on every protected `/api` call and reads COE access from the user's roles, not the cookie. New module `lib/auth/server-session.ts`. |
| A2 | Critical | **Account takeover.** `POST /api/auth/sync-session` is public and trusted `email` and `access_token` from the body: it wrote a session row for that email and returned the session cookies. Knowing a staff email was enough. | The route now proves the caller first: the token must already be bound to a live session, or be confirmed by the parent app (`/api/auth/validate`). A body naming a different email is refused. Sessions are also bound server-side at code exchange and at token refresh, where the token's owner is known for certain. |
| A3 | Critical | **Forgeable identity in permission checks.** `resolveCallerEmail()` read the email from the unsigned JWT payload. `requireUserPermission()` and `hasAnyCoeRole()` are built on it, so a hand-written token naming a super admin passed every permission gate. | It now resolves the caller from the verified session only. |
| A4 | High | **Dotted-path bypass.** Any path containing a `.` skipped every proxy layer (auth, CSRF, rate limit) — including API routes with a dot in a dynamic segment. | The shortcut no longer applies under `/api/`. |
| A5 | High | **Forced logout of any user.** `POST /api/auth/logout` accepted an `email` / `user_id` and revoked that person's COE sessions and their MyJKKN sign-in. | The caller is identified only by a token they hold. |
| A6 | Medium | `/api/auth/permissions/by-role?email=` returned any user's roles and permissions to anonymous callers. | Requires a session; own email only unless super admin. |
| A7 | High | **Email-code login could be brute-forced.** A 6-digit code, generated with `Math.random`, with no attempt limit; a match returns a Supabase session for that user. | A wrong guess now burns the code, a new code is limited to one per minute per email, and codes use `crypto.randomInt`. See O6 for the remaining decision. |

Supporting change: `components/common/csrf-fetch-interceptor.tsx` now recovers an expired session on a 401 (refresh once, replay the request, otherwise go to sign-in). Without it, screens that call `fetch` directly would start showing errors once sessions are actually enforced.

### Authorisation and exposed data

| # | Severity | Finding | Fix |
|---|---|---|---|
| B1 | Critical | **`/api/myjkkn/**` (17 routes) was public.** Anonymous callers could pull learner and staff profiles from MyJKKN through the server-side API key (`?fetchAll=true`), and write to or wipe the reference cache. | Removed from the public list — now session-gated. The eight server-side self-calls forward the caller's cookies (`lib/api-helpers/forward-session.ts`). |
| B2 | High | **Privilege escalation.** Writes to `/api/users/roles`, `permissions`, `role-permissions`, `user-roles` and `users-list` were open to every signed-in user: a mark-entry account could grant itself any role. | New central policy `lib/auth/api-policy.ts`, enforced in `proxy.ts`, requires the same permission that shows the screen in the sidebar. |
| B3 | High | SMTP configuration (incl. credentials) and the developer portal (API keys) were readable and writable by every signed-in user. | Covered by the same policy, reads included. |
| B4 | High | **Audit trail could be read and forged.** `/api/transaction-logs` returned all entries to any caller and attributed new entries to whatever `user_email` the body claimed. | Reads need `page.admin.user_log_activity.view`; attribution comes from the verified session. |
| B5 | High | `/api/public/examiner/status?email=` returned the whole examiner row to anonymous callers, including bank account details and signature path. | Returns only the columns the registration screens display. |
| B6 | Medium | `/api/v1/exam-settings` had no authentication (read and write, any institution). | Requires a COE session. |
| B7 | Medium | `/api/v1/bug-reporter/*` was an open relay to the bug-reporter service under the server's API key. | Requires a COE session; rejects path traversal. |
| B8 | Medium | Upstream path injection in `/api/myjkkn/batches/[id]` and `students/[id]` (`../..` reached other MyJKKN endpoints). | IDs must be UUIDs. Also fixes `students/[id]`, which answered 400 to every request (it read `params` synchronously). |
| B9 | Low | Maintenance endpoints (`/api/setup-semesters`, `/api/check-is-active-field`) open to all users; public prefixes matched with `startsWith`. | Super admin only; prefixes now match whole path segments. |

### Permissions, institution scope and API keys (second pass)

| # | Severity | Finding | Fix |
|---|---|---|---|
| D1 | High | **273 session-gated routes had no permission check.** Any signed-in user could call mark entry, result, fee and report APIs directly. | Each route is now limited to users who can open at least one screen that calls it. The rules are generated from the code (`scripts/generate-api-policy.cjs` → `lib/auth/api-policy.generated.ts`, 236 rules) using the page permissions the sidebar already enforces, and applied in `proxy.ts`. Routes no screen calls are gated by hand-written rules in `lib/auth/api-policy.ts`. 318 of 324 session-gated routes now check a permission (was 51). |
| D2 | High | **Institution isolation was asserted by the browser.** Changing `institutions_id` / `institution_code` in a URL or request body reached another college's records, and leaving it out returned every college's. | Two controls. `proxy.ts` rejects a request that names an institution other than the caller's own, in the query string or anywhere in the body. And 225 parameter reads in 171 route files (`institutions_id`, `institution_code`, `institution_id`) now go through `institutionParam()`, which defaults to the caller's own institution when the request names none. The caller's institution is the one MyJKKN reported at sign-in, falling back to the COE user row; a user linked to neither sees no institution's data. Super admins are unrestricted. |
| D3 | Medium | **API-key institution scope could be bypassed** in seven `/api/v1` handlers. | Fixed per handler: `marks/internal` and `registrations` POST require and check `institutions_id` and reject arrays; `cia-marks/sync` ties the course offering to the claimed institution; `courses` GET always applies the key's scope; `course-mapping` bulk upsert checks existing rows; `ia/question-types`, `ia/paper-templates` and `ia/course-outcomes` no longer fail open. |
| D4 | High | **20 screens had no permission.** They are not in the sidebar, so `PagePermissionGate` let any signed-in user open them by URL — including user and role administration (`/users/users-list`, `/users/user-roles`), `/pre-exam/cia-marks-entry` and `/marks-management/status-grades` — and the 65 APIs behind them had to stay open. | Each now takes the permission of the sidebar screen it belongs with (`unlistedPagePermissions` in `lib/navigation-data.ts`), so no new permission had to be created. The navigation log shows none of them opened since April 2026 except the fee-concessions screen, which keeps its own permission. |
| D5 | Medium | **Role assignments readable with the public key.** The browser listened to `user_roles` through Supabase Realtime, which required the table to be open to the anon key. | The role refresh no longer uses Realtime: roles are re-read from the server when the tab regains focus and every five minutes. `20261010_lock_server_only_tables.sql` now closes `user_roles` as well. A failed refresh no longer signs the user out. |
| D6 | High | **Records could be reached by their own id.** `/api/…/<id>`, `?id=<id>` or a reference such as `?examination_session_id=<id>` returned or changed a record whichever college it belonged to; handlers did not check. | `proxy.ts` now looks up every record a request refers to and refuses it (403, "The requested record could not be found or accessed") when the record belongs to another institution. The registry of which id refers to which table is generated from the live schema and the handlers (`scripts/generate-resource-ownership.cjs`): 71 routes addressed by record id, and 12 reference fields — examination session, course offering, course, exam registration, timetable, board, exam room, revaluation registration — found in the query string or anywhere in a body. |
| D7 | High | **The MyJKKN proxy routes filtered by institution in the browser.** `/api/myjkkn/learner-profiles`, `learners`, `students` and `staff` sent every college's rows and left the screen to hide the others. | The rows are filtered on the server before they leave (`restrictToCallerInstitution()`); a non-super-admin receives only their own institution's learners and staff. |
| D8 | High | **Routes no screen calls were open to everyone.** The generator derives a rule from the screens that call a route; for 25 routes it found none and left them open. A mark-entry account could read revaluation marks and final marks, exam applications, seat and room allocations, and every user's role assignments. | Each now has a hand-written rule using its area's permission (revaluation, exam applications, exam rooms, semester results, NAD, learner directory); role assignments need an access-admin permission for reads as well as writes. |
| D9 | Medium | **Routes that failed on every call.** Queries named columns or relations that do not exist: `revaluation_marks` / `revaluation_final_marks` / `revaluation_fee_config` / `examiner_assignments` have no `institution_code`; `users.name`, `roles.role_code` and `roles.role_name` do not exist; `course_mapping` and `courses` have no `course_title`; `pattern_program_associations` has no foreign key to `programs`. Registration Lookup, registration approvals, course and programme associations, user roles, and revaluation marks, final marks and fee config answered 500. | Each query now names real columns (aliased where the response shape depends on the old name); the revaluation inserts no longer set the missing column. All 347 institution filters were checked against the live schema. |
| D10 | — | **The signed-in path is now tested for every user.** | `tests/live-user-access-test.mjs` signed in as each of the 19 active users and called 201 GET routes as each: every route the policy allows answered, every route it denies was refused, own institution passed, another institution was refused, another institution's record was refused, and MyJKKN staff rows were own-institution only. |
| D11 | Critical | **Result Release was open to every signed-in user.** Four sidebar entries had no permission: Result Release, Fee Details, BoS Compositions and BoS TA/DA Rates. Everyone saw the first two in the menu and could open all four by URL — so a mark-entry or NAD account could make results visible to learners, or hide them (`PATCH /api/post-exam`). The log shows a NAD coordinator and an office account opening Result Release in the last 90 days. | Each entry now has a permission in `lib/navigation-data.ts`: Result Release → Semester Results (`coe`, `super_admin`); Fee Details → Final Registration Approval (`coe`, `coe_office_1`, `super_admin`, the roles that use it); the BoS screens → Board master (`super_admin`, as the sidebar already intended). The generator now warns about any sidebar entry with no permission. |
| D12 | High | **The rule generator was over-crediting screens.** Because every screen imports the navigation data, a screen with no permission inherited the permissions of all 94 others; and a short literal such as `/api/post-exam` was read as a base URL for everything beneath it. Together they left 44 routes — the whole post-exam area — open to anyone holding any screen permission. | Links only count from a screen's own code; a literal is a base URL only where the code extends it. The "shared lookup" exemption is gone. A mark-entry account now reaches 8 rule-governed routes (was 32): exactly what its five screens call. |
| D13 | Medium | **The Batch screen and the course-mapping template read a table that does not exist.** `/api/master/batches` and `/api/course-management/course-mapping/template-data` queried a local `batch` table that was never created; batches are mastered in MyJKKN. Both failed on every call. | Both now read the batches from MyJKKN in the shape the screens expect, limited to the caller's institution (`lib/api-helpers/myjkkn-batches.ts`). Creating, editing or deleting a batch from COE answers 405 with "Batches are managed in MyJKKN". The template route also filtered `courses` on a column it does not have. |
| D14 | Medium | **Revaluation examiner assignment could never save.** `/api/revaluation/assignments` used columns `examiner_assignments` does not have, and the table itself required the evaluator to be a COE user and the programme to be a local `programs` row — while the screen picks from the examiner panel and no course offering points at a local programme. The table is empty. | The route is rewritten against the real columns and keeps its response shape. Saving an assignment needs `supabase/migrations/20261010_revaluation_examiner_assignments.sql` (adds `examiner_id`, relaxes the two constraints, allows one live examiner per application); until it is run, assigning answers "not set up yet" instead of failing obscurely. The exclusion rule now keeps every regular evaluator of the course offering away from its revaluation, because regular assignments are recorded per offering, not per answer script. |

### Row limits and truncated results

| # | Severity | Finding | Fix |
|---|---|---|---|
| C1 | High | **Silent truncation at 1,000 rows** for every server-side read without real pagination — processing, reports and exports alike. | `lib/supabase-paginated-fetch.ts`, installed in `getSupabaseServer()`, detects a capped response and pages through the rest with a stable `id` tiebreaker. A failed page fails the read rather than returning a partial set. |
| C2 | High | 199 hard-coded ceilings (`.range(0, 9999)` … `.range(0, 1000000)`) across 114 files. A session's registrations (12,855) already exceed the most common one. | Removed. These reads now return every matching row. |

Verified against the live database (read-only):

| Table | Exact count | Before | After |
|---|---:|---:|---:|
| `exam_registrations` | 57,497 | 1,000 | 57,497 |
| `final_marks` | 29,451 | 1,000 | 29,451 |
| `exam_attendance` | 28,933 | 1,000 | 28,933 |
| `marks_entry` | 27,282 | 1,000 | 27,282 |
| `internal_marks` | 25,726 | 1,000 | 25,726 |
| `semester_results_detailed_view` | 3,513 | 1,000 | 3,513 |

Filtering is unchanged and still happens in the database before paging; institution filters and permission checks are applied exactly as before. Existing 1,000-row paging loops pass through untouched.

---

## 3. Open findings

| # | Severity | Finding | Recommended action |
|---|---|---|---|
| O1 | Low | **6 session-gated routes accept any signed-in user**, by design: sessions, institutions and favourites (the page shell calls them on every screen), the user's avatar, the activity-log batch write, and a health check. Three of them also accept writes (`examination-sessions`, `master/institutions`, `user-favorites`); the first two rely on the institution and record checks only. | Add a hand-written rule limiting writes on `examination-sessions` and `master/institutions` to the roles that manage them. |
| O2 | Low | **Institution isolation — what is left.** (1) Ids that are not COE records are not checked: a learner id or programme id comes from MyJKKN, so a handler keyed only by `student_id` or a register number relies on its other filters. (2) The MyJKKN reference-data routes (programmes, departments, semesters, regulations, batches) are not filtered; they carry no personal data. (3) The record check covers the id a route is addressed by and the twelve reference fields; a handler that takes a record id under another field name is not covered until the field is added to the generator. | For (1), add the institution to the query wherever marks or results are loaded by learner. For (3), add the field to `FIELD_TABLES` in the generator and re-run it. |
| O3 | Medium | **Reference tables readable with the public key.** After the migration below, 8 of the 183 tables and views exposed through the API still return rows to the anon key: `institutions`, `course_info`, `academic_years` and its four views, and `examiner_form_configs`. (363 of 397 routes use the service-role key, so RLS is not what protects the rest — the checks in `proxy.ts` are.) | Run `supabase/migrations/20261010_lock_server_only_tables.sql` to close `user_roles`, `verification_codes` and `user_favorites`. Then review the reference tables column by column; the public examiner form needs some of them. |
| O4 | Low | Remaining `/api/v1` scope gaps (a valid key is required): `registrations` POST still passes most caller fields through; `registrations` and `marks/internal` do not confirm that the referenced offering and learner belong to the institution; `course-mapping` and `ia/course-outcomes` accept a `course_code` from another institution; `ia/*` PUT handlers accept arbitrary columns. | Move each insert/update to an explicit field list and verify referenced rows. |
| O5 | Medium | Tokens are passed in the URL after sign-in (`/login?token=…&refresh_token=…`), and the access-token cookie is readable by scripts. | Set cookies server-side in `/auth/callback` and redirect without tokens; make the cookie `httpOnly` once client code no longer reads it. |
| O6 | Medium | The email-code sign-in (`/verify-email`) issues a Supabase session that the portal does not use — it lands back on `/login`. It is an attack surface with no working purpose. | Remove the flow, or add an `attempts` column and a lockout if it is to be kept. |
| O7 | Medium | Public examiner registration: the OTP is never emailed and `email_verified` is taken from the request body; `/api/public/examiner/status` still returns contact details by email. | Set `email_verified` server-side from a verified Google credential; require that credential for the status lookup. |
| O8 | Medium | Rate limiting is per server instance (in-memory) and skips `/api/v1`; examiner-portal OTP has no lockout across codes. | Move the auth/public buckets to a shared store. |
| O9 | Medium | Session tokens are stored in plain text in `sessions.session_token`. | Store a SHA-256 hash and look up by hash. |
| O10 | Medium | **Large interactive lists now return complete data, which can be large.** A full-table read of `exam_registrations` is 57k rows (5.6 s for ids alone). | Watch the server log for `[supabase] "<table>" read returned N rows` and move those screens to server-side pagination (spec §7.2). `SUPABASE_AUTO_PAGINATE=off` restores the old capped behaviour without a code change. |
| O11 | Low | Raw database / upstream error text is returned to clients in a number of handlers. | Standardise on safe messages with a reference id (spec §6). |
| O12 | Low | `EXAMINER_PORTAL_JWT_SECRET` falls back to the service-role key when unset. | Set a dedicated secret. |
| O13 | Low | Legacy sign-in routes that cannot succeed (`/api/auth/google`, `/api/auth/verify`, `/api/auth/roles/*` rely on a Supabase Auth session the portal never creates) and debug pages remain in the build. | Delete. |

---

## 4. Before deploying

1. **Run the user test against the build you are about to release:** `node -r dotenv/config tests/live-user-access-test.mjs <baseUrl>`. It passed for all 19 users on the local build. It covers GET routes only, so also sign in as one restricted user and save something on each of their screens — writes, uploads and the browser's session refresh are not covered by any automated test here.
2. **Clear the `sessions` table at deploy time** — run `supabase/migrations/20261010_deploy_clear_sessions.sql` immediately after the release is live, not before. Existing rows were created before tokens were verified and cannot be trusted. Users should not notice: their next request gets a 401, the browser refreshes the session from the refresh-token cookie and replays it. Anyone whose refresh token has lapsed is sent to sign in.
3. **Expect one behaviour change:** signing in on a second browser no longer signs the first one out. Each verified token has its own session, valid for 12 hours and extended while the tab is open.
4. **Environment (optional):** `SUPABASE_AUTO_PAGINATE=off` (rollback switch), `SUPABASE_AUTO_PAGINATE_MAX_ROWS` (ceiling for unbounded reads, default 200,000).
5. Check `[supabase]` warnings in the logs for the first few days (see O10).
6. **Check each restricted role before going live.** `node -r dotenv/config tests/live-policy-simulation.mjs` prints, per role, which rule-governed routes it would be denied. On today's assignments the `coe` role (11 users) is denied only user and role administration, SMTP, the developer portal, PDF-settings edits, logo upload, the BoS screens, by-id master-data routes, debug routes and the MyJKKN test screen. **Two accounts lose a screen they have opened recently:** a NAD coordinator and `coe_office_1` each opened Result Release twice in the last 90 days; it now needs the Semester Results permission. Grant that permission to a role if either should keep it. Note that `coe` users can no longer open the COE-local master screens (`/master/departments`, `/programs`, `/regulations`, `/semesters`), which now need the same permissions as their MyJKKN counterparts; grant those if they are still used. The five restricted accounts are denied everything outside their own screens — that is the intent, but the rules come from static analysis of the code, so sign in as one of them on a test build and walk through their daily screens.
7. **Rollback switches** (environment variables, no code change):
   - `API_POLICY_GENERATED=report` — screen-derived permission rules log "Would deny" instead of blocking (`off` ignores them). The hand-written administration rules always apply.
   - `INSTITUTION_SCOPE=report` — institution checks log instead of blocking (`off` disables them).
8. Run `supabase/migrations/20261010_lock_server_only_tables.sql` after the release is live (see O3).
9. The institution check reads request bodies inside `proxy.ts`. Handlers still received their bodies intact in local testing (JSON up to 1.5 MB, form data); confirm one upload and one bulk save on the deployed build.
10. One account (`coe_office_1`) has no institution on its COE user row and no matching MyJKKN staff record; set `users.institution_id` for it (CAS) before going live, or that user will see "Your account is not linked to an institution". The `nad_coordinator` account that had the same gap has been linked to CAS.
11. After adding a table, an id parameter or an `[id]` route, re-run `node -r dotenv/config scripts/generate-resource-ownership.cjs` as well as the policy generator.
12. Run `supabase/migrations/20261010_revaluation_examiner_assignments.sql` if revaluation applications are to be assigned to examiners from the portal. Then assign one application on a test build: this path could not be exercised here (no application is in an assignable state, and the table has never held a row).

---

## 5. Tests

| Command | What it proves |
|---|---|
| `npm test` | 46 tests. Reads past 1,000 rows are complete, unique and ordered; filters apply to the whole dataset; explicit limits are never exceeded; a failed page fails the read. The permission policy denies administration to restricted accounts, screen-derived rules admit only users of those screens, and hand-written rules take precedence. A user cannot name another institution in a URL or body; a request that names none defaults to their own; a user linked to no institution matches nothing; super admins are unrestricted. Record ids are found in the path, `?id=`, the body and reference fields, and the generated registry only points at tables that record their institution. |
| `node -r dotenv/config tests/live-row-cap-check.mjs` | Read-only: compares exact counts with what the server client returns, per table. |
| `node tests/live-auth-smoke.mjs [baseUrl]` | Sends the forged and anonymous requests described above to a running server; each must be refused. |
| `node -r dotenv/config tests/live-policy-simulation.mjs [role]` | Read-only: what the permission policy allows and denies each role, on the live role assignments. |
| `node -r dotenv/config tests/live-rls-anon-probe.mjs` | Read-only: how many rows of each table the public key can read (counts only). |
| `node -r dotenv/config tests/live-user-access-test.mjs [baseUrl]` | Signs in as every active user (temporary session rows, removed afterwards) on a running server and calls every session-gated GET route: allowed routes must not answer 401/403, denied routes must answer 403. Also checks, per user, own institution passes, another institution is refused, another institution's record is refused, and MyJKKN staff rows are own-institution only. GET requests only. |

Type-check: unchanged from baseline (60 pre-existing errors, all in `lib/utils/exam-rooms`).

---

## What remains

Against the audit specification:

| Spec section | Status |
|---|---|
| §2 Route inventory | Done for API routes (397). Pages (197) not yet inventoried against permissions. |
| §3 RBAC | Sessions, permissions (271 of 324 routes) and institution scope are enforced server-side, and every screen under the COE layout that calls an API now has a permission. Open: separation of duties and the role matrix decisions. |
| §4 Authentication and sessions | Core chain fixed. O5, O8, O9 open. |
| §5 Validation and data integrity | Not started (shared schemas, idempotency, database constraints). |
| §6 Error handling | Session and permission errors now use the standard messages. Raw errors elsewhere are open (O11). |
| §7 UI/UX, §8 Performance | Not started. Row-limit work adds one measurable item (O10). |
| §9 Audit logging | Attribution can no longer be forged (B4). Coverage review not started. |
| §10 Tests | Unit tests for pagination and the permission policy. No integration or end-to-end tests yet; there is no test database or seeded role accounts. |
| Row-limit requirement | Server-side reads are complete (C1, C2). Server-side pagination for large screens, count strategy, index review and keyset pagination are open (O10). |
| RLS review | The public key's reach is measured (O3) and a fix for the server-only tables is ready to run. Policy-by-policy review of the remaining tables is open. |
