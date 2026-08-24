-- =====================================================
-- Migration: Per-learner exam application charges on exam_registrations
-- Created: 2026-08-24
-- Reference: JKKNCAS/Circular-59/CoE/Exam Fee Sem-I,III,V/26-27
--
-- exam_registrations.fee_amount already carries the PER-PAPER exam fee (theory /
-- practical / project). The circular also charges three amounts ONCE PER LEARNER
-- PER SESSION, which until now had nowhere to live:
--
--   Application fee     charged once when the learner applies for the session
--   Mark statement fee  charged once per session
--   Late fine           charged once, when the application is past the cut-off
--
-- STORAGE RULE (important for every report that sums these columns)
-- -----------------------------------------------------------------
-- These are per-learner-per-session charges, so they are stamped on exactly ONE
-- row per (learner, session) - the anchor row of the batch that first applied -
-- and left at 0 on every other paper row of that learner. That keeps
--
--     SUM(fee_amount + application_fee + mark_statement_fee + late_fine)
--
-- correct when summed over any set of a learner's registrations. Never spread the
-- same charge across the learner's rows, and never re-charge a learner who already
-- carries a non-zero charge in the same session.
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

ALTER TABLE public.exam_registrations
	ADD COLUMN IF NOT EXISTS application_fee    NUMERIC(10, 2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS mark_statement_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS late_fine          NUMERIC(10, 2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS applied_date       DATE;

COMMENT ON COLUMN public.exam_registrations.application_fee IS
	'Exam application fee, charged once per learner per session. Stamped on a single anchor row per (learner, session); 0 on the learner''s other paper rows so SUM() never double-counts.';

COMMENT ON COLUMN public.exam_registrations.mark_statement_fee IS
	'Mark statement fee, charged once per learner per session. Stamped on the same anchor row as application_fee; 0 elsewhere.';

COMMENT ON COLUMN public.exam_registrations.late_fine IS
	'Late fine from exam_fee_schedules, charged once per learner per session when the application date is past last_date_without_fine. Stamped on the same anchor row; 0 elsewhere.';

COMMENT ON COLUMN public.exam_registrations.applied_date IS
	'Date the learner applied for the exam (registration_status moved to Applied). NULL for rows that were only registered, never applied.';

COMMENT ON COLUMN public.exam_registrations.fee_amount IS
	'PER-PAPER exam fee for this one paper at the learner''s fee tier. Excludes application / mark statement / late fine - those live in their own columns and are charged once per session.';

-- The Exam Application screens list a session cohort and then look up who has
-- already been charged the once-per-session heads. Both are covered here.
CREATE INDEX IF NOT EXISTS idx_exam_registrations_session_status
	ON public.exam_registrations (institutions_id, examination_session_id, registration_status);

CREATE INDEX IF NOT EXISTS idx_exam_registrations_session_learner_charge
	ON public.exam_registrations (institutions_id, examination_session_id, stu_register_no)
	WHERE application_fee > 0 OR mark_statement_fee > 0;
