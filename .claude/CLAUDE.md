# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build production bundle
npm run lint         # Run ESLint
npm test             # Unit tests (node --test)
```

**Key Paths:**
- Auth: `lib/auth/`, `proxy.ts` (session + permission policy), `components/protected-route.tsx`
- API Routes: `app/api/`
- Pages: `app/(coe)/`
- Services: `services/`
- Types: `types/`
- Migrations: `supabase/migrations/`

## Database Architecture

**CRITICAL:** When debugging database issues, always check BOTH databases:

| Database | Contains | Key Tables |
|----------|----------|------------|
| **COE (Local Supabase)** | Exam data, registrations, marks, results | `exam_registrations`, `internal_marks`, `final_marks`, `course_offerings`, `institutions` |
| **MyJKKN (External API)** | Learner profiles, photos, DOB, batches | `learners_profiles` (via API), `student_photo_url`, `date_of_birth` |

**Common Mistake:** Learner photos/DOB do NOT exist in COE — always fetch from MyJKKN API.

## Project Overview

JKKN COE (Controller of Examination) — Next.js 15, TypeScript, Supabase, Shadcn UI, Tailwind CSS.

**Complete PRD:** `.claude/COE PRD.txt`

## JKKN Terminology Standards

**CRITICAL:** Always use JKKN terminology:

| Use | Never use |
|-----|-----------|
| **Learner** | Student |
| `learner_id` | `student_id` |
| `/learners` | `/students` |
| "Needs improvement" | "Failed" |
| "Learning opportunity" | "Backlog" |

## Architecture

**Auth flow:** Google OAuth → Supabase Auth → Middleware → Auth Context → Protected Routes

**Public routes:** `/login`, `/auth/callback`, `/contact-admin`, `/verify-email`, `/`

**Multi-tenant:** Users see only their institution's data unless `super_admin`.
- Hook: `useInstitutionFilter()` from `hooks/use-institution-filter.ts`
- `mustSelectInstitution` — true when super_admin views "All Institutions"
- `getInstitutionIdForCreate()` — returns institution ID for new records
- Full guide: `.claude/skills/myjkkn-coe-dev-rules/SKILL.md`

**MyJKKN field name differences:**

| MyJKKN | COE | Note |
|--------|-----|------|
| `course_name` | `course_title` | Different name |
| `program_id` | `program_code` | Is a CODE string ("BCA"), not UUID |
| `institution_id` | `institutions_id` | COE uses plural |
| `college_email` | `learner_email` | — |

**MyJKKN rules:**
1. Use `myjkkn_institution_ids` array directly — no two-step lookup
2. Server-side filtering is unreliable — always filter client-side by `institution_id`
3. Deduplicate by CODE field, not `id`
4. Always handle both shapes: `const data = response.data || response || []`

## Code Style

Tabs, single quotes, no semicolons, strict equality (`===`). Default Server Components; `'use client'` only when needed.

## Debugging

| Symptom | Check First |
|---------|-------------|
| Course missing from marksheet | `final_marks.status` = `Pending` not `Published`? |
| Learner photo not showing | `student_photo_url` null → fetch from MyJKKN API |
| Marks not in report | `is_locked` = false (amber state)? |
| Export showing wrong data | Filtering by correct `institution_id`? |

**Data status:** `Draft → Pending → Published → Locked`

## Important Notes

- **RLS Bypass:** Service role key bypasses RLS — use in server API routes only
- **Row Limits:** PostgREST caps every response at 1000 rows. `getSupabaseServer()` pages past it automatically (`lib/supabase-paginated-fetch.ts`), so a server-side query with no `.range()` returns every matching row — do NOT add `.range(0, 9999)`-style ceilings. Use `.range()` only for real pagination
- **API auth:** `proxy.ts` verifies the session on every protected `/api` route; use `getRequestUser()` (`lib/auth/server-session.ts`) for the caller, never the `access_token` JWT payload. Routes needing more than a session: add a rule to `lib/auth/api-policy.ts` or call `requireUserPermission()`. Server-side calls to our own API must pass `forwardSession(request)`
- **API permission rules are generated:** each route is limited to users who can open a screen that calls it (`lib/auth/api-policy.generated.ts`). After adding a screen, a sidebar entry, or an API call from a screen, run `node scripts/generate-api-policy.cjs` — otherwise users of the new screen get 403 from APIs it shares. Check with `node -r dotenv/config tests/live-policy-simulation.mjs`
- **Institution scope:** `proxy.ts` rejects a non-super-admin request naming another institution (`institutions_id`, `institution_code`, … in query or body). Never reuse those field names for anything but the tenant. In a handler, read the filter with `await institutionParam(searchParams, 'institutions_id' | 'institution_code')` (`lib/auth/institution-scope-request.ts`), never `searchParams.get(...)` — it defaults to the caller's own institution when the request names none
- **Record ownership:** `proxy.ts` also refuses a non-super-admin request that reaches another institution's record by id (`/x/<id>`, `?id=`, `examination_session_id`, `course_offering_id`, …). The id → table registry is generated: after adding a table, an id parameter or an `[id]` route, run `node -r dotenv/config scripts/generate-resource-ownership.cjs`. Rows from sources that cannot be filtered at the source (MyJKKN) go through `restrictToCallerInstitution()` before being returned
- **Screens without a sidebar entry** still need a permission: add them to `unlistedPagePermissions` in `lib/navigation-data.ts`, then regenerate the API policy
- **Race Conditions:** Use atomic updates with `.is('used_at', null)`
- **Institution in Updates:** Never allow changing `institutions_id` after record creation
- **FK Auto-Mapping:** Always resolve `institution_code` → UUID before insert; store both

## Regenerate After Changes

**CRITICAL:** API access rules are generated from the code and the schema. If you skip these, the change works for super admins and fails with 403 for everyone else.

| You changed | Run | Why |
|-------------|-----|-----|
| A screen, a sidebar entry, or an API call made from a screen | `node scripts/generate-api-policy.cjs` | Rebuilds `lib/auth/api-policy.generated.ts` — which permission each API route needs |
| A table, an id parameter (`*_id`), or an `[id]` route | `node -r dotenv/config scripts/generate-resource-ownership.cjs` | Rebuilds `lib/auth/resource-ownership.generated.ts` — which table a record id refers to (reads the live schema) |
| Any API route | `node scripts/audit-route-inventory.cjs` | Refreshes `docs/audit/route-inventory.md` |

Then check the result:

```bash
npm test                                                    # unit tests (pagination, permission policy, institution scope, record ownership)
node -r dotenv/config tests/live-policy-simulation.mjs      # what each role is allowed and denied
node tests/live-auth-smoke.mjs                              # forged / anonymous requests must be refused (needs dev server)
node -r dotenv/config tests/live-user-access-test.mjs       # every user against every route (needs dev server)
```

**Every sidebar entry needs a `permission`.** An entry without one is shown to every signed-in user, and the APIs behind it cannot be restricted — the generator prints a WARNING for each. Never edit the two `*.generated.ts` files by hand. To gate a screen that has no sidebar entry, add it to `unlistedPagePermissions` in `lib/navigation-data.ts`. To add a record-id field, add it to `FIELD_TABLES` in `scripts/generate-resource-ownership.cjs`.

## Skills Reference

Use these skills for detailed patterns — do not ask Claude to reproduce them inline:

| Task | Skill |
|------|-------|
| Build CRUD page | `entity-crud-page-builder` |
| API route templates | `nextjs-module-builder` |
| MyJKKN integration rules | `myjkkn-coe-dev-rules` |
| UI patterns (tables, forms, sheets) | `saas-ui-patterns` |
| Excel import/export | `excel-import-export` |
| Institution filtering | `institution-filter` |
| Schema changes | `supabase-schema-change` |
| Debug database | `debug-db` |
| PDF reports | `pdf-processing-pro` |
| Role-based access (6 roles, route guards) | `rbac-coe-permissions` |
| Audit trail for mark changes | `exam-audit-trail` |
| Exam registration + eligibility checks | `exam-registration` |
| Hall ticket PDF + QR generation | `hall-ticket-pdf` |
| Mark entry draft/submit/approve flow | `mark-entry-workflow` |
| CIA+ESE result compilation + grace marks | `result-compilation` |
| Multi-level result declaration approval | `result-declaration-workflow` |
| Grade card / marksheet PDF | `grade-card-pdf` |
| Semester marksheet PDF (data fetch, arrears, part GPA, batch) | `semester-marksheet-pdf` |
| Revaluation application + result revision | `revaluation-system` |
| Question bank + Bloom's taxonomy + blueprints | `question-bank` |
