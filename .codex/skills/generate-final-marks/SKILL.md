---
name: generate-final-marks
description: Generate final_marks rows for JKKN COE by combining internal (CIA) marks, external (ESE) marks, and exam attendance into per-learner-course grades, grade points, and pass/fail status. Use when implementing, debugging, or extending final marks generation — including the /grading/generate-final-marks page, the /api/grading/final-marks route, percentage-based grade lookup, absent (AAA) handling, CIA-only fallback, regeneration blocking, or the final_marks upsert. Triggers on 'generate final marks', 'final marks', 'final_marks', 'combine internal and external marks', 'CIA + ESE', 'compute grades', 'grade point calculation', 'why are final marks blocked', 'regenerate results', 'CIA only course marks', 'absent grade AAA'.
---

# Generate Final Marks

Final marks generation combines **internal (CIA)**, **external (ESE)**, and **attendance** data into one `final_marks` row per learner-course, computing percentage, letter grade, grade point, credit points, and pass/fail status. It is the bridge between mark entry and result compilation.

**Pipeline:** `internal_marks` + `marks_entry` + `exam_attendance` → **final_marks** → `semester_results`

## Key files

- Page: [generate-final-marks/page.tsx](../../../app/(coe)/grading/generate-final-marks/page.tsx) — 4-step wizard (select program/session → courses → review → save).
- API: [final-marks/route.ts](../../../app/api/grading/final-marks/route.ts) — `GET` (which courses already have saved results) and `POST` (generate / preview / save).
- Types: [types/final-marks.ts](../../../types/final-marks.ts)
- Downstream: [results/generate-semester-results/route.ts](../../../app/api/results/generate-semester-results/route.ts)

## API contract — POST /api/grading/final-marks

Request body (`GenerateFinalMarksPayload`):

```ts
{
  institutions_id: string          // FK; filters every query
  program_code: string             // CODE string ("BCA"), NOT the UUID — required
  program_id: string               // MyJKKN program UUID (not used for filtering)
  examination_session_id: string
  course_ids: string[]             // courses.id UUIDs to generate
  regulation_id: string            // for grade_system lookup
  grade_system_code?: 'UG' | 'PG'  // auto-inferred from program_code if omitted
  save_to_db?: boolean             // false = preview only; true = upsert
}
```

Set `save_to_db: false` first to preview, then `true` to commit. Response returns `results[]`, a `summary` (passed/failed/absent/distinction/first_class/skipped_*), and `saved_count` + per-record `errors` when saving.

## Generation logic (mark-based courses)

1. `totalMarks = internalObtained + externalObtained` — each capped at its own max.
2. `percentage = round((totalMarks / totalMax) * 100, 2)` — **normalized to a 100-scale** even when `totalMax ≠ 100`.
3. Grade lookup: find the `grade_system` row where `percentage` is in `[min_mark, max_mark]`.
4. `gradePoint = round(percentage / 10, 2)`; `creditPoints = gradePoint * credit` (0 if failed/absent).

Pass/fail checks thresholds in order — `internal_pass_mark`, then `external_pass_mark`, then `total_pass_mark` — and records the first `failReason` (INTERNAL / EXTERNAL / TOTAL).

## Critical business rules

- **Absent comes from `exam_attendance.attendance_status = 'Absent'`** — never a boolean. Absent → `letter_grade = 'AAA'`, `grade_points = 0`, `pass_status = 'Absent'`, regardless of any marks present. (Aligns with internal marks where grade `'AAA'` = absent — see project memory.)
- **Evaluation type drives required inputs:** `CIA & ESE` needs both; `CIA Only` needs internal only and has **no attendance requirement** (no external exam → no `exam_attendance` row); `ESE Only` needs external only.
- **Status papers** (`result_type = 'Status'`): qualitative grades ('Commended', 'Highly Commended', 'AAA') stored in `marks_entry.grade`; percentage/grade_point set to 0.
- **Regeneration is blocked once saved.** If any selected course already has a non-null `final_marks.result_status`, POST returns 400 ("Cannot regenerate results. X course(s) already have saved results."). This is the implicit lock on internal/external marks — it is NOT limited to Published status.
- **Idempotent upsert key:** `onConflict: 'institutions_id,exam_registration_id,course_offering_id'`. Initial saved `result_status` is `'Pending'`.
- **CIA-only fallback:** when a CIA-only course has no `exam_registrations`, students are pulled from `internal_marks` (filtered `eq('program_code', programCode)`) and given virtual registration IDs `cia-virtual-{internal_marks.id}`.

## Row-limit & batching gotchas

Supabase caps at 1000 rows — this route handles it explicitly; preserve these when editing:

- `exam_registrations`, `internal_marks`: paginated via `.range(from, to)` (PAGE_SIZE 1000); CIA fallback uses `.range(0, 19999)`.
- `internal_marks` / `marks_entry` / `exam_attendance`: fetched in **batches of 200** IDs (student IDs or exam_registration IDs).
- Final upsert: **batched in 200-record chunks** with per-record retry fallback on transient network errors.

## Status & failure modes

`result_status`: `Draft → Pending → Published → Locked`. Generation writes `Pending`.

Generation returns 400 when: no `exam_registrations` for a course; CIA course has no internal marks; results already exist; missing `grade_system`; or no resolvable course codes. Skipped (not failed) learners appear in `summary.skipped_*` and `skipped_records[]` — missing attendance or missing marks.

## Field schema

For the complete `final_marks` column list, FK relationships, and `pass_status`/`result_status` enums, read [references/final-marks-schema.md](references/final-marks-schema.md).

## Related skills

- `gpa-cgpa-calculator` — consumes `final_marks.grade_points` and `.credit`.
- `result-compilation` / `result-declaration-workflow` — aggregate `final_marks` into `semester_results`.
- `mark-entry-workflow` — produces the `marks_entry` (external) rows this skill reads.
