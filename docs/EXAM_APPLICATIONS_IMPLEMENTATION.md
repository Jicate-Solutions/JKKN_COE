# Exam Applications — Implementation Notes

**Date:** 2026-08-19
**Route:** `/exam-management/exam-applications`
**Status:** Code complete, type-checks clean. Permission migration not yet applied. Not yet tested against live data.

---

## 1. What this module does

The Exam Application page builds a single, de-duplicated course list for one learner in one
examination session, drawn from **three** sources, validates eligibility, and writes the
selected courses back into the existing `exam_registrations` table.

```
Select Session
      ↓
Search / Select Learner   (MyJKKN learner-profiles)
      ↓
  ┌───────────────────┬──────────────────┬────────────────────┐
  │ Exam Registration │ Backlog / Arrear │     Offer List     │
  └───────────────────┴──────────────────┴────────────────────┘
      ↓
Merge on UPPER(course_code) → remove duplicates
      ↓
Resolve eligibility (ordered chain)
      ↓
Display → Select eligible courses → Submit
      ↓
INSERT INTO exam_registrations (registration_status = 'Applied')
```

It is a **separate page**. It does not replace or modify the Exam Registrations flow; it
reuses that module's layout, components, filters and design language.

---

## 2. Files

### New

| File | Lines | Purpose |
|---|---|---|
| `types/exam-applications.ts` | 87 | Shared types |
| `lib/exam-applications/course-list.ts` | 384 | Merge + dedupe + eligibility engine |
| `app/api/exam-management/exam-applications/courses/route.ts` | 65 | `GET` merged course list |
| `app/api/exam-management/exam-applications/route.ts` | 286 | `GET` applied / `POST` submit / `DELETE` withdraw |
| `app/(coe)/exam-management/exam-applications/page.tsx` | 776 | UI |
| `supabase/migrations/20260819_seed_exam_applications_page_permission.sql` | 49 | Sidebar permission seed |

### Modified

| File | Change |
|---|---|
| `lib/navigation-data.ts` | Nav entry under **Pre-Exam**, gated by `page.exam_management.exam_applications.view` |
| `lib/utils/exam-registrations/validation.ts` | Added `'Applied'` to both `validStatuses` lists (form + import) |
| `app/(coe)/exam-management/exam-registrations/page.tsx` | `Applied` option in the status filter and the form dropdown; blue badge styling |

**No new tables and no schema migration.** The only migration added is a permission seed.

---

## 3. Course sources

All three are queried in `buildExamApplicationCourses()`.

| # | Source | Table / view | Filter |
|---|---|---|---|
| 1 | Exam Registration | `exam_registrations` | learner + `examination_session_id` + `institutions_id` |
| 2 | Backlog / Arrear | `student_backlogs_detailed_view` | `is_cleared = false` AND `is_active = true` |
| 3 | Offer List | `course_offerings` | `program_code` + learner's current `semester`, `is_active` |

The learner is matched with a PostgREST `or` filter on **both** `student_id` and register
number, because `exam_registrations.student_id` is nullable and bulk-imported rows may
carry only `stu_register_no`.

If `student_backlogs_detailed_view` errors (missing or renamed), the failure is logged and
backlogs degrade to empty rather than breaking the whole page.

---

## 4. Merge and de-duplication

Merge key is `course_code.trim().toUpperCase()`. A course can therefore never appear twice
regardless of how many sources produced it.

The `Source` column shows a single source name, or **`Multiple Sources`** when more than one
contributed. The real list is on the badge's `title`, so hovering reveals it.

When the same course has several offerings in a session, the winner is chosen by preferring
an **active** offering, then one matching the learner's **current semester**.

---

## 5. Eligibility

Resolved in this exact order — first match wins:

| Order | Status | Condition |
|---|---|---|
| 1 | `Already Registered` | A registration already exists for this course in this session |
| 2 | `Already Passed` | `final_marks.is_pass = true` for the course, and it is not a backlog |
| 3 | `Not Offered` | No `course_offerings` row for the course in this session |
| 4 | `Inactive Offering` | `course_offerings.is_active = false` |
| 5 | `Seats Full` | `enrolled_count >= max_enrollment` |
| 6 | `Eligible` | — |

Only `Eligible` rows can be selected. Everything else renders dimmed with the checkbox
disabled, and the reason is on the badge's `title`.

### Attempt limits are not enforced

`student_backlogs.attempt_count` / `max_attempts_allowed` are shown on the row (the
`Attempt N` badge) but never block an application — a learner past the permitted number of
attempts stays `Eligible`.

### Passed courses are never shown as backlog

Course codes with `final_marks.is_pass = true` are collected first and used to **drop the
`Backlog` source** from a merged course before eligibility runs. A cleared subject can
therefore never surface as an arrear, even if `student_backlogs.is_cleared` is stale.

---

## 6. Submit

`POST /api/exam-management/exam-applications`

`buildExamApplicationCourses()` is **re-run server-side** and the submitted course codes are
checked against its output. A hand-crafted request cannot register an ineligible course —
the browser's list is never trusted.

Rows are written to `exam_registrations` with:

| Column | Value |
|---|---|
| `registration_status` | `'Applied'` (constant `APPLICATION_STATUS`) |
| `is_regular` | `false` for backlog courses, otherwise `true` |
| `attempt_number` | `attempt_count + 1` for backlog courses, otherwise `1` |

After a successful insert of a backlog course, the matching `student_backlogs` row is
updated with `is_registered_for_arrear = true`, `arrear_registration_date` and
`arrear_exam_session_id`. A failure there is logged but does not fail the request, since the
registrations are already committed.

Per-course outcomes come back as `created` / `skipped` / `failed` with a reason, so a partial
submit reports exactly which courses were rejected and why.

### NOT NULL columns

`exam_registrations` declares `stu_register_no`, `student_name`, `institution_code`,
`course_code` and `session_code` as **NOT NULL**. The handler therefore requires
`register_number` and `student_name` up front and returns `400` if either is missing —
building the course list works from `student_id` alone, but inserting does not.
`session_code` is resolved from the session and also `400`s if unresolvable.

### `unique_registration` is not a duplicate guard

The constraint is
`(institutions_id, student_id, examination_session_id, course_offering_id, attempt_number)`.
Because `attempt_number` is part of the key, an arrear applied at attempt 2 will **not**
collide with the learner's attempt-1 row — which is correct for arrears, but means the
database will not catch double-application on its own.

Protection is the `Already Registered` check in the merge logic, which matches any
registration for that course in the session regardless of attempt. That runs server-side
inside `POST`, not only in the UI.

`student_id` being nullable has the same shape of implication (Postgres treats NULLs as
distinct in unique constraints), but this flow always populates it from the MyJKKN learner.

---

## 7. Permission

Navigation in this codebase is DB-permission-gated, not role-gated. The nav entry uses:

```
permission: 'page.exam_management.exam_applications.view'
```

`supabase/migrations/20260819_seed_exam_applications_page_permission.sql` registers that
permission and grants it to `super_admin` and `coe`, following the convention in
`20260513_seed_page_permissions.sql`. Both `ON CONFLICT` clauses make it re-runnable.

> **Not yet applied.** Until it runs, only `super_admin` sees the sidebar entry, because
> `app-sidebar.tsx` short-circuits to show super_admin everything. The page itself remains
> reachable by direct URL.

Apply with `supabase db push`, or paste it into the Supabase SQL editor.

---

## 8. Gotcha: two checkouts of this repo

This machine has **two clones** of `Jicate-Solutions/JKKN_COE`:

| Path | HEAD | Date | Dev server |
|---|---|---|---|
| `D:\JKKN\Development\Appliaction\JKKN_COE` | `d6ce330` | 2026-04-17 | no |
| `D:\JKKN\Development\Appliaction\COE\JKKN_COE` | `d87c854` | 2026-08-18 | **yes, port 3000** |

The second is roughly four months ahead and contains the first's HEAD in its history. The
`node` process serving `localhost:3000` runs from `COE\JKKN_COE`.

This module was initially built in the stale copy, which produced a **404** on the new route
even though every file existed — Next was serving the other directory. All work now lives in
`COE\JKKN_COE`. The stale copy still holds the original, superseded files.

The two checkouts differ in more than commits: the stale one gates navigation with
`coe_roles` arrays and has no permission seed system, so nav and permission changes are
**not** portable between them by copying.

---

## 9. Verification status

- `npx tsc --noEmit` in `COE\JKKN_COE`: 60 errors, all pre-existing in `lib/utils/exam-rooms/*`, **none** in any file listed here.
- ESLint could not be run — the repo's flat config throws `TypeError: Converting circular structure to JSON` on load, unrelated to this work.
- The Supabase MCP is unauthorized in this environment, so the schema was read from `supabase/migrations/` and the supplied `exam_registrations` DDL rather than queried, and the permission migration could not be applied.
- **Not exercised against live data.** Worth testing with a learner who has both pending arrears and current-semester offerings, to confirm the merge, the `Multiple Sources` label, and the arrear `attempt_number` increment.
