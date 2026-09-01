-- =====================================================================
-- 25JUGCCA134 (SENTHAMILSELVAN V) - 24UGTA01 GENERAL TAMIL-I
-- MALPRACTICE correction. SUPERSEDES fix_25JUGCCA134_gta01_result.sql
-- =====================================================================
-- CONTEXT
--   The earlier script assumed the NOV-DEC-2025 result of 51 (Grade B) was a
--   genuine pass and cancelled the APRIL-MAY-2026 re-attempt. That was the
--   wrong way round.
--
--   The learner was caught in MALPRACTICE in 24UGTA01 in NOV-DEC-2025, so:
--     - the NOV-DEC-2025 result is invalid  -> external mark forced to 0
--     - the APRIL-MAY-2026 attempt (20+13=33, U) was his legitimate re-sit,
--       which he also failed -> must be restored as a real attempt
--     - 24UGTA01 must therefore appear in the arrear list again
--
--   WHY IT VANISHED FROM THE ARREAR LIST: course-list.ts builds
--   passedCourseCodes from every final_marks row with is_pass = true (all
--   sessions, no is_active filter) and merge.ts:164 skips any backlog whose
--   course is in that set. The NOV-DEC-2025 pass put 24UGTA01 in it. Zeroing
--   that row to a fail is the ONLY thing that brings the paper back - the
--   backlog row alone has no say in it.
--
-- SCOPE
--   final_marks      - both 24UGTA01 attempts corrected
--   student_backlogs - reopened as failure_reason 'Malpractice'
--   semester_results - BOTH rows brought in line with the corrected marks:
--                        APRIL-MAY-2026 back to its original pre-correction
--                          figures (undoing the previous script's edit)
--                        NOV-DEC-2025 recomputed for the malpractice
--                          (SGPA 2.39 -> 1.72, 11 -> 8 credits, 4 -> 5 backlogs)
--                        CGPA on BOTH rows -> 3.55 (see the CGPA note at STEP 11)
--
--   Every figure below was produced by replaying the generation engine's own
--   formulas over the corrected rows, not by hand arithmetic. The same
--   replay reproduces the CURRENT stored values exactly when run against the
--   current data, which is what validates it.
--
-- TRIGGER / GUARD NOTES
--   Guards read the OLD row, so publication is withdrawn in a separate
--   earlier statement (see fix_25JUGCCA134_gta01_result.sql for the full
--   write-up). Additional hazards handled here:
--
--   trigger_auto_create_backlog_on_publish fires on every transition INTO
--   'Published' for a failed row and calls create_backlog_from_final_marks,
--   which does INSERT ... ON CONFLICT (student_id, course_id,
--   original_examination_session_id) DO UPDATE attempt_count = +1. So:
--     - STEP 3 (Nov-Dec re-publish) INSERTS a brand new backlog row, because
--       no backlog yet exists keyed to the NOV-DEC-2025 session
--     - STEP 4 (Apr-May re-publish) hits ON CONFLICT on the existing row and
--       increments attempt_count
--   STEP 5 deletes the stray row and STEP 6 sets attempt_count explicitly, so
--   both side effects are cleaned up. STEP 5 must run BEFORE STEP 6, which
--   re-keys the surviving row onto the NOV-DEC-2025 session.
--
--   trigger_increment_backlog_attempt bumps attempt_count whenever
--   last_attempt_session_id changes - STEP 6 leaves that column alone.
--
--   check_clearance_consistency requires is_cleared = false to carry NULL
--   cleared_examination_session_id AND NULL cleared_date, so STEP 6 clears
--   every cleared_* column together.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1  NOV-DEC-2025 attempt: withdraw publication
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET result_status = 'Under Review',
    updated_at    = NOW()
WHERE id = 'e5390e2b-6314-4894-b410-92a08105d0da';   -- 24UGTA01 / NOV-DEC-2025

-- ---------------------------------------------------------------------
-- STEP 2  NOV-DEC-2025 attempt: MALPRACTICE - external mark to 0
--         Before: INT 20, EXT 31, TOT 51, B, gp 5.1, Pass
--         After : INT 20, EXT  0, TOT 20, U,  gp 0,  Reappear
--         (total/percentage/grade/grade_points/is_pass/pass_status are all
--          recalculated by the final_marks BEFORE UPDATE triggers)
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET external_marks_obtained = 0,
    calculation_notes       = 'MALPRACTICE in NOV-DEC-2025 examination. External mark forced to 0 and the result invalidated; the learner must re-appear for 24UGTA01.',
    remarks                 = 'MALPRACTICE in NOV-DEC-2025 examination. External mark forced to 0 and the result invalidated; the learner must re-appear for 24UGTA01.',
    updated_at              = NOW()
WHERE id = 'e5390e2b-6314-4894-b410-92a08105d0da';

-- ---------------------------------------------------------------------
-- STEP 3  NOV-DEC-2025 attempt: restore publication
--         Side effect: auto-creates a NOV-DEC-keyed backlog row (STEP 5)
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET result_status = 'Published',
    updated_at    = NOW()
WHERE id = 'e5390e2b-6314-4894-b410-92a08105d0da';

-- ---------------------------------------------------------------------
-- STEP 4  APRIL-MAY-2026 attempt: restore the legitimate re-sit
--         Undoes the previous script. Back to INT 20, EXT 13, TOT 33, U,
--         Reappear, Published, is_active = true.
--         OLD.result_status is 'Cancelled' here, so the publication guard
--         does not object to the mark change.
-- ---------------------------------------------------------------------
UPDATE public.final_marks
SET external_marks_obtained = 13,
    is_active               = true,
    result_status           = 'Published',
    calculation_notes       = NULL,
    remarks                 = 'Legitimate re-attempt after the NOV-DEC-2025 malpractice. Failed again (33/100).',
    updated_at              = NOW()
WHERE id = '23ab18f8-5876-420a-91c5-cfdfbe6826c1';   -- 24UGTA01 / APRIL-MAY-2026

-- ---------------------------------------------------------------------
-- STEP 5  Remove the backlog row auto-created by STEP 3
--         Keeps exactly one open 24UGTA01 backlog. Must precede STEP 6,
--         which moves the surviving row onto the NOV-DEC-2025 key.
-- ---------------------------------------------------------------------
DELETE FROM public.student_backlogs
WHERE student_id = '89c049a3-202a-4ce0-9d2d-11e8d8cc0e85'
  AND course_id  = 'c80866bc-53fb-4ff3-a780-aa7822b8855b'   -- 24UGTA01
  AND id <> 'ef1fa8df-06cc-4326-9ee7-1e28ca3f0dc1';

-- ---------------------------------------------------------------------
-- STEP 6  Reopen the 24UGTA01 backlog as a MALPRACTICE arrear
--         Re-pointed at the NOV-DEC-2025 malpractice, which is the true
--         first failure. attempt_count = 2 (Nov-Dec + Apr-May both taken),
--         so the UI badge reads "Attempt 3" - his genuine next sitting.
-- ---------------------------------------------------------------------
UPDATE public.student_backlogs
SET is_cleared                     = false,
    cleared_examination_session_id = NULL,
    cleared_final_marks_id         = NULL,
    cleared_semester               = NULL,
    cleared_internal_marks         = NULL,
    cleared_external_marks         = NULL,
    cleared_total_marks            = NULL,
    cleared_percentage             = NULL,
    cleared_grade_points           = NULL,
    cleared_letter_grade           = NULL,
    cleared_date                   = NULL,
    original_examination_session_id = '402d740b-0fcf-404c-8c8e-021b377da73f', -- NOV-DEC-2025
    original_final_marks_id        = 'e5390e2b-6314-4894-b410-92a08105d0da',
    original_semester              = 1,
    original_internal_marks        = 20,
    original_external_marks        = 0,
    original_total_marks           = 20,
    original_percentage            = 20,
    original_grade_points          = 0,
    original_letter_grade          = 'U',
    failure_reason                 = 'Malpractice',
    is_absent                      = false,
    attempt_count                  = 2,
    priority_level                 = 'High',
    remarks                        = 'MALPRACTICE in NOV-DEC-2025. Re-attempted APRIL-MAY-2026 and failed (33). Learner must re-appear for 24UGTA01.',
    updated_at                     = NOW()
WHERE id = 'ef1fa8df-06cc-4326-9ee7-1e28ca3f0dc1';

-- ---------------------------------------------------------------------
-- STEP 7-10  semester_results APRIL-MAY-2026: revert to original values
--
--   With the Apr-May attempt active again the session holds 15 rows, so the
--   engine's own figures are once more 46 / 35 / 205.60 / 4.47 / 51.73 / 4 -
--   exactly what this row held before the previous script touched it.
--
--   Withdraw + unlock, restore, re-publish + re-lock, then put the original
--   dates back that the auto-populate triggers overwrite with CURRENT_DATE.
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET is_locked      = false,
    locked_by      = NULL,
    locked_date    = NULL,
    is_published   = false,
    published_by   = NULL,
    published_date = NULL,
    updated_at     = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

UPDATE public.semester_results
SET total_credits_registered = 46,
    total_credits_earned     = 35,
    total_credit_points      = 205.60,
    sgpa                     = 4.47,
    cgpa                     = 3.55,   -- was 4.33; see the CGPA note at STEP 11
    percentage               = 51.73,
    total_backlogs           = 4,
    new_backlogs             = 4,
    result_status            = 'Fail',
    remarks                  = NULL,
    updated_at               = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

UPDATE public.semester_results
SET is_published   = true,
    published_by   = 'd93eb907-9d24-49bf-9920-ddfcff79134f',
    published_date = '2026-07-13',
    is_locked      = true,
    locked_by      = 'd93eb907-9d24-49bf-9920-ddfcff79134f',
    locked_date    = '2026-07-13',
    updated_at     = NOW()
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

UPDATE public.semester_results
SET published_date = '2026-07-13',
    locked_date    = '2026-07-13'
WHERE id = 'def4a70f-9315-4dfd-a195-bdbf3b63a173';

-- ---------------------------------------------------------------------
-- STEP 11-14  semester_results NOV-DEC-2025 (Semester 1): apply malpractice
--
--   Losing the 24UGTA01 pass costs 3 credits and 15.3 credit points
--   (credit 3 x grade point 5.1) and adds a fifth backlog:
--
--     Field                     Before -> After    Why
--     total_credits_registered   23   ->  23       he still sat 7 papers
--     total_credits_earned       11   ->   8       24UGTA01's 3 credits lost
--     total_credit_points      54.9   -> 39.6      5.1 -> 0 grade point
--     sgpa                     2.39   -> 1.72      39.6 / 23
--     percentage              35.29   -> 30.86     216 / 700 (total 51 -> 20)
--     total_backlogs              4   ->   5       24UGTA01 now a backlog
--     new_backlogs                4   ->   5
--     result_status            Fail   -> Fail      unchanged
--
--   CGPA NOTE - this is why BOTH rows change.
--   The engine computes ONE cumulative CGPA per learner from every active
--   final_marks row across all sessions (route.ts ~1596-1645), then stamps
--   that same figure on the row it is writing. After the malpractice the
--   cumulative total is 245.2 points / 69 credits = 3.55, so both semester
--   rows carry 3.55. The stored 4.54 and 4.33 differ from each other today
--   only because they were generated on different dates from different data.
--   Verified by replaying the engine's own formula over the corrected rows.
--
--   Sem 1 audit values parked for restore:
--     published_by / locked_by = dd7661d1-37ff-477a-9f04-44140e14151b
--     published_date / locked_date = 2026-06-24
-- ---------------------------------------------------------------------
UPDATE public.semester_results
SET is_locked      = false,
    locked_by      = NULL,
    locked_date    = NULL,
    is_published   = false,
    published_by   = NULL,
    published_date = NULL,
    updated_at     = NOW()
WHERE id = 'ed4bdd08-64b2-4ad0-bf21-8c1f1458c6af';   -- NOV-DEC-2025

UPDATE public.semester_results
SET total_credits_registered = 23,
    total_credits_earned     = 8,
    total_credit_points      = 39.60,
    sgpa                     = 1.72,
    cgpa                     = 3.55,
    percentage               = 30.86,
    total_backlogs           = 5,
    new_backlogs             = 5,
    result_status            = 'Fail',
    remarks                  = 'Recomputed after the 24UGTA01 malpractice in NOV-DEC-2025 (external mark forced to 0).',
    updated_at               = NOW()
WHERE id = 'ed4bdd08-64b2-4ad0-bf21-8c1f1458c6af';

UPDATE public.semester_results
SET is_published   = true,
    published_by   = 'dd7661d1-37ff-477a-9f04-44140e14151b',
    published_date = '2026-06-24',
    is_locked      = true,
    locked_by      = 'dd7661d1-37ff-477a-9f04-44140e14151b',
    locked_date    = '2026-06-24',
    updated_at     = NOW()
WHERE id = 'ed4bdd08-64b2-4ad0-bf21-8c1f1458c6af';

UPDATE public.semester_results
SET published_date = '2026-06-24',
    locked_date    = '2026-06-24'
WHERE id = 'ed4bdd08-64b2-4ad0-bf21-8c1f1458c6af';


-- =====================================================================
-- VERIFY  (read the output BEFORE you COMMIT)
-- =====================================================================

-- A. Both 24UGTA01 attempts must now be failures, both active + published
SELECT es.session_code, fm.internal_marks_obtained AS int_m,
       fm.external_marks_obtained AS ext_m, fm.total_marks_obtained AS total,
       fm.letter_grade, fm.is_pass, fm.pass_status, fm.result_status, fm.is_active
FROM public.final_marks fm
JOIN public.courses c ON c.id = fm.course_id
JOIN public.examination_sessions es ON es.id = fm.examination_session_id
WHERE fm.register_number = '25JUGCCA134' AND c.course_code = '24UGTA01'
ORDER BY es.session_code;
-- Expect: APRIL-MAY-2026  20 | 13 | 33 | U | false | Reappear | Published | true
--         NOV-DEC-2025    20 |  0 | 20 | U | false | Reappear | Published | true
-- CRITICAL: no is_pass = true row may remain, or the paper stays hidden
-- from the arrear list.

-- B. Exactly ONE open 24UGTA01 backlog, reason Malpractice, attempt_count 2
SELECT c.course_code, b.is_cleared, b.failure_reason, b.attempt_count,
       b.original_total_marks, b.original_letter_grade
FROM public.student_backlogs b
JOIN public.courses c ON c.id = b.course_id
WHERE b.register_number = '25JUGCCA134' AND c.course_code = '24UGTA01';
-- Expect exactly 1 row: 24UGTA01 | false | Malpractice | 2 | 20 | U

-- C. Semester results - both rows now consistent with the corrected marks
SELECT semester, sgpa, cgpa, percentage, total_credits_registered AS cr_reg,
       total_credits_earned AS cr_earn, total_credit_points AS pts,
       total_backlogs, result_status, is_published, is_locked
FROM public.semester_results
WHERE register_number = '25JUGCCA134'
ORDER BY semester;
-- Expect: 1 | 1.72 | 3.55 | 30.86 | 23 |  8 |  39.60 | 5 | Fail | true | true
--         2 | 4.47 | 3.55 | 51.73 | 46 | 35 | 205.60 | 4 | Fail | true | true

-- D. Audit columns must survive the withdraw/restore on BOTH rows
SELECT semester, published_by, published_date, locked_by, locked_date
FROM public.semester_results
WHERE register_number = '25JUGCCA134'
ORDER BY semester;
-- Expect sem 1: dd7661d1-37ff-477a-9f04-44140e14151b | 2026-06-24 (both pairs)
-- Expect sem 2: d93eb907-9d24-49bf-9920-ddfcff79134f | 2026-07-13 (both pairs)
-- Any NULL, or today's date, means a restore step did not apply - ROLLBACK.

COMMIT;
-- ROLLBACK;  -- run this INSTEAD of COMMIT if any verify block looks wrong
