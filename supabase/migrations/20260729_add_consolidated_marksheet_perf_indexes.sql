-- =====================================================================
-- Consolidated Marksheet report — performance indexes
-- =====================================================================
-- The /reports/consolidated-marksheet page runs three hot queries that
-- currently have no supporting composite index:
--
--   1. learner dropdown  (action=students)
--   2. batch cohort      (action=batch-marksheet)
--   3. generate          (POST action=generate)
--
-- all of which filter final_marks by
--   institutions_id + program_code + result_status + is_active
-- Only single-column indexes exist today, so Postgres bitmap-ANDs several
-- low-selectivity indexes (is_active / result_status are near-constant)
-- or falls back to a seq scan over the whole marks table.
--
-- NOTE: learner photo / DOB / name are NOT in this database — the
-- learners_profiles mirror table does not exist in this deployment and
-- all profile data is fetched from the MyJKKN API. Nothing to index here.
--
-- Safe to re-run: every statement is IF NOT EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. final_marks cohort lookup
--    Column order = equality columns most selective first. is_active and
--    result_status ride along so the whole predicate is index-resolved
--    and student_id is available for the distinct-cohort scan without a
--    heap fetch.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_final_marks_inst_program_status
	ON public.final_marks (institutions_id, program_code, result_status, is_active)
	INCLUDE (student_id);

-- ---------------------------------------------------------------------
-- 2. Single-learner marksheet lookup
--    action=student-marksheet filters by student_id + result_status +
--    is_active. idx_final_marks_student_id alone still re-checks the
--    status columns on the heap for every attempt row.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_final_marks_student_status
	ON public.final_marks (student_id, result_status, is_active);

-- ---------------------------------------------------------------------
-- 3. consolidated_results folio lookup by cohort
--    Batch marksheet resolves folios via
--    (institutions_id, program_id) + student_id IN (...).
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_consolidated_results_inst_program_student
	ON public.consolidated_results (institutions_id, program_id, student_id);

-- ---------------------------------------------------------------------
-- 4. students register_number probe
--    The university-data Excel export falls back to the local students
--    table for name/gender when MyJKKN has no profile. Guarded with
--    to_regclass so a deployment without the table doesn't abort the
--    script (as learners_profiles did).
-- ---------------------------------------------------------------------
DO $$
BEGIN
	IF to_regclass('public.students') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_students_register_number
			ON public.students (register_number);
	ELSE
		RAISE NOTICE 'public.students not present — skipping idx_students_register_number';
	END IF;
END $$;

-- Refresh planner statistics so the new indexes are costed correctly
ANALYZE public.final_marks;
ANALYZE public.consolidated_results;
