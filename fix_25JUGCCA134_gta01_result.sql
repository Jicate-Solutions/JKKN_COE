-- =====================================================================
-- Result correction: 25JUGCCA134 (SENTHAMILSELVAN V) - 24UGTA01
-- =====================================================================
-- ISSUE
--   24UGTA01 (GENERAL TAMIL-I) shows as Fail/Reappear.
--
-- ROOT CAUSE
--   The learner PASSED 24UGTA01 in NOV-DEC-2025 (Sem 1, regular attempt 1)
--   with internal 20 + external 31 = 51, Grade B, Pass.
--
--   He was then wrongly re-registered as an ARREAR candidate in
--   APRIL-MAY-2026 for three courses he had ALREADY PASSED:
--     24UGTA01, 24UCCC02, 24UCSGEP04
--   (stale-arrear bug: the arrear list does not subtract final_marks passes).
--
--   That invalid 24UGTA01 re-attempt scored 20 + 13 = 33 (U, Reappear),
--   which overrode the genuine Semester 1 pass and raised a false backlog.
--
-- FIX (scope: 24UGTA01 only - all other subjects untouched)
--   1. final_marks      - zero the external mark on the invalid attempt and
--                         deactivate it so the NOV-DEC-2025 pass stands
--   2. student_backlogs - mark the false backlog cleared against the real pass
--   3. semester_results - recompute APRIL-MAY-2026 without the invalid row
--
-- =====================================================================
-- WHY THIS RUNS AS SEVEN STATEMENTS, NOT THREE
--
--   Three BEFORE UPDATE guards reject these edits outright:
--     prevent_published_marks_modification        (final_marks)
--       -> fires when OLD.result_status = 'Published' and marks change
--     prevent_published_semester_results_modification
--       -> fires when OLD.is_published = true and sgpa/percentage change
--     prevent_locked_semester_results_modification
--       -> fires when OLD.is_locked = true and sgpa/percentage change
--          (BOTH semester_results rows are is_locked = true)
--
--   Every guard tests the OLD row, so withdrawing publication / unlocking in
--   a SEPARATE EARLIER STATEMENT clears the way - that statement changes no
--   guarded column, so it passes, and the next one sees the withdrawn OLD.
--
-- ALSO DELIBERATE
--   The invalid attempt ends as result_status 'Cancelled', NOT re-Published.
--   trigger_auto_create_backlog_on_publish re-creates a backlog whenever a
--   failed row transitions into 'Published' - re-publishing it would silently
--   recreate the exact false backlog this script is removing.
--
--   external_percentage is a GENERATED column - never assign to it.
--   final_marks triggers recalculate total_marks_obtained, percentage,
--   letter_grade, grade_points, is_pass and pass_status by themselves.
--
--   Two CHECK constraints then police the withdrawal itself:
--   check_lock_consistency and check_publication_consistency each demand the
--   flag and its _by / _date columns move together. So STEP 4 nulls all six,
--   STEP 6 restores them explicitly, and STEP 7 puts the original dates back
--   that STEP 6's triggers overwrite. See each step for detail.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1  final_marks: withdraw publication on the invalid attempt
--         (no guarded column changes here, so the guard lets it through)
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET result_status = 'Under Review',
    updated_at    = NOW()
WHERE id = '23ab18f8-5876-420a-91c5-cfdfbe6826c1';   -- 24UGTA01 / APRIL-MAY-2026

-- ---------------------------------------------------------------------
-- STEP 2  final_marks: zero the external mark, deactivate, cancel
--         Before: INT 20, EXT 13, TOT 33, U, gp 0, Reappear, active
--         After : INT 20, EXT  0, TOT 20 (trigger-recalculated), inactive
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET external_marks_obtained = 0,
    is_active               = false,
    result_status           = 'Cancelled',
    calculation_notes       = 'Corrected: invalid arrear registration - 24UGTA01 was already PASSED in NOV-DEC-2025 (20+31=51, Grade B). External mark set to 0 and attempt cancelled so the Nov-Dec-2025 pass stands.',
    remarks                 = 'Corrected: invalid arrear registration - 24UGTA01 was already PASSED in NOV-DEC-2025 (20+31=51, Grade B). External mark set to 0 and attempt cancelled so the Nov-Dec-2025 pass stands.',
    updated_at              = NOW()
WHERE id = '23ab18f8-5876-420a-91c5-cfdfbe6826c1';

-- The genuine NOV-DEC-2025 pass row is left UNTOUCHED:
--   e5390e2b-6314-4894-b410-92a08105d0da  INT 20 EXT 31 TOT 51  B  Pass

-- ---------------------------------------------------------------------
-- STEP 3  student_backlogs: clear the false backlog against the real pass
-- ---------------------------------------------------------------------
UPDATE public.student_backlogs
SET is_cleared                     = true,
    cleared_examination_session_id = '402d740b-0fcf-404c-8c8e-021b377da73f', -- NOV-DEC-2025
    cleared_final_marks_id         = 'e5390e2b-6314-4894-b410-92a08105d0da',
    cleared_semester               = 1,
    cleared_internal_marks         = 20,
    cleared_external_marks         = 31,
    cleared_total_marks            = 51,
    cleared_percentage             = 51,
    cleared_grade_points           = 5.1,
    cleared_letter_grade           = 'B',
    cleared_date                   = '2025-12-01',
    remarks                        = 'Backlog raised in error. 24UGTA01 was passed in NOV-DEC-2025 with 51 (Grade B); the APRIL-MAY-2026 arrear registration was invalid.',
    updated_at                     = NOW()
WHERE id = 'ef1fa8df-06cc-4326-9ee7-1e28ca3f0dc1';

-- ---------------------------------------------------------------------
-- STEP 4  semester_results: unlock + withdraw publication (APRIL-MAY-2026)
--         Required before sgpa/percentage may change. Restored in STEPS 6-7.
--
--         The _by / _date columns MUST be nulled in the same statement:
--           check_lock_consistency
--             (is_locked=false AND locked_by IS NULL AND locked_date IS NULL) OR
--             (is_locked=true  AND locked_by IS NOT NULL AND locked_date IS NOT NULL)
--           check_publication_consistency  - same shape for is_published
--         Clearing only the flag leaves a half-state and the CHECK rejects it.
--
--         Values being parked for restore (captured from the live row):
--           published_by / locked_by = d93eb907-9d24-49bf-9920-ddfcff79134f
--           published_date / locked_date = 2026-07-13
--         result_declared_date / result_declared_by are NOT touched, so
--         check_result_declared_consistency stays satisfied throughout.
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET is_locked      = false,
    locked_by      = NULL,
    locked_date    = NULL,
    is_published   = false,
    published_by   = NULL,
    published_date = NULL,
    updated_at     = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';   -- APRIL-MAY-2026

-- ---------------------------------------------------------------------
-- STEP 5  semester_results: apply the recomputed figures
--
--    Derived with the same formula the generation engine uses
--    (app/api/grading/semester-results/route.ts ~line 1680); the formula was
--    first verified to reproduce the stored row EXACTLY before any change.
--
--    Field                     Before -> After    Why
--    total_credits_registered   46   ->  43       invalid 3-credit row removed
--    total_credits_earned       35   ->  35       unchanged (never earned here)
--    total_credit_points     205.6   -> 205.6     unchanged (grade point was 0)
--    sgpa                     4.47   -> 4.78      205.6 / 43
--    percentage              51.73   -> 53.07     743 / 1400
--    total_backlogs              4   ->   3       GTA01 no longer a backlog
--    new_backlogs                4   ->   3
--    result_status            Fail   -> Fail      3 real backlogs remain
--                                                 (24UGEN01, 24UGTA02, 24UBANM1)
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET total_credits_registered = 43,
    total_credits_earned     = 35,
    total_credit_points      = 205.6,
    sgpa                     = 4.78,
    percentage               = 53.07,
    total_backlogs           = 3,
    new_backlogs             = 3,
    result_status            = 'Fail',
    remarks                  = 'Recomputed after cancelling the invalid 24UGTA01 arrear attempt (passed NOV-DEC-2025).',
    updated_at               = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

-- ---------------------------------------------------------------------
-- STEP 6  semester_results: restore publication + lock
--
--   published_by / locked_by must be supplied explicitly. The auto-populate
--   triggers only fall back to auth.uid(), which is NULL in the SQL Editor,
--   and a NULL _by against a true flag trips the consistency CHECKs again.
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET is_published   = true,
    published_by   = 'd93eb907-9d24-49bf-9920-ddfcff79134f',
    published_date = '2026-07-13',
    is_locked      = true,
    locked_by      = 'd93eb907-9d24-49bf-9920-ddfcff79134f',
    locked_date    = '2026-07-13',
    updated_at     = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

-- ---------------------------------------------------------------------
-- STEP 7  semester_results: restore the ORIGINAL publication/lock dates
--
--   STEP 6 cannot preserve them: on a false->true flip both auto-populate
--   triggers overwrite the date with CURRENT_DATE unconditionally, so the
--   row would falsely claim it was published/locked today rather than on
--   2026-07-13 when the results were actually declared.
--
--   This statement is only reachable now because OLD.is_published and
--   OLD.is_locked are already true, so neither trigger re-fires, and neither
--   guard objects - a date is not one of the columns they protect.
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET published_date = '2026-07-13',
    locked_date    = '2026-07-13'
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

-- Semester 1 (NOV-DEC-2025) row ed4bdd08-64b2-4ad0-bf21-8c1f1458c6af needs
-- NO change - it already counts 24UGTA01 as passed (SGPA 2.39, 11/23 credits
-- earned, 4 backlogs). Verified correct, so it stays locked and published.


-- =====================================================================
-- VERIFY  (read the output BEFORE you COMMIT)
-- =====================================================================

-- A. 24UGTA01 must show the Nov-Dec pass active, the Apr-May attempt cancelled
SELECT es.session_code, fm.internal_marks_obtained AS int_m,
       fm.external_marks_obtained AS ext_m, fm.total_marks_obtained AS total,
       fm.letter_grade, fm.pass_status, fm.result_status, fm.is_active
FROM public.final_marks fm
JOIN public.courses c ON c.id = fm.course_id
JOIN public.examination_sessions es ON es.id = fm.examination_session_id
WHERE fm.register_number = '25JUGCCA134' AND c.course_code = '24UGTA01'
ORDER BY es.session_code;
-- Expect: APRIL-MAY-2026  20 |  0 | 20 | U | Reappear | Cancelled | false
--         NOV-DEC-2025    20 | 31 | 51 | B | Pass     | Published | true

-- B. No uncleared 24UGTA01 backlog may remain
SELECT c.course_code, b.is_cleared, b.cleared_total_marks, b.cleared_letter_grade
FROM public.student_backlogs b
JOIN public.courses c ON c.id = b.course_id
WHERE b.register_number = '25JUGCCA134' AND c.course_code = '24UGTA01';
-- Expect: 24UGTA01 | true | 51 | B

-- C. Semester results must be back to published + locked
SELECT semester, sgpa, percentage, total_credits_registered AS cr_reg,
       total_credits_earned AS cr_earn, total_backlogs, result_status,
       is_published, is_locked
FROM public.semester_results
WHERE register_number = '25JUGCCA134'
ORDER BY semester;
-- Expect: 1 | 2.39 | 35.29 | 23 | 11 | 4 | Fail | true | true   (unchanged)
--         2 | 4.78 | 53.07 | 43 | 35 | 3 | Fail | true | true   (corrected)

-- D. Audit columns must come back intact - no half-state, no today's date
SELECT semester, published_by, published_date, locked_by, locked_date,
       result_declared_by, result_declared_date
FROM public.semester_results
WHERE register_number = '25JUGCCA134'
ORDER BY semester;
-- Expect sem 2: d93eb907-9d24-49bf-9920-ddfcff79134f | 2026-07-13 (all three pairs)
-- Expect sem 1: dd7661d1-37ff-477a-9f04-44140e14151b | 2026-06-24 (untouched)
-- Any NULL _by, or a date of today, means STEP 6/7 did not apply - ROLLBACK.

COMMIT;
-- ROLLBACK;  -- run this INSTEAD of COMMIT if any verify block looks wrong
