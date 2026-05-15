-- =====================================================
-- Include cia_round in cia_marks unique constraints
-- Created: 2026-05-14
-- Purpose: A learner can have one cia_marks row PER ROUND for the same
--          course offering + session. The original constraints
--          (unique_cia_student_course_offering, unique_cia_marks) didn't
--          include cia_round, so syncing Round 2 marks for a learner who
--          already had Round 1 marks failed with 23505 "duplicate key value".
--
-- Effect:
--   - Backfills NULL cia_round → 1 for any existing rows
--   - Makes cia_round NOT NULL with default 1
--   - Drops the two legacy unique constraints
--   - Recreates them with cia_round appended
-- =====================================================

-- 1. Make sure cia_round column exists. It was referenced by app code +
--    /api/v1/cia-marks/sync long before any migration formally added it;
--    add it defensively so this migration is idempotent on either schema.
ALTER TABLE public.cia_marks
	ADD COLUMN IF NOT EXISTS cia_round INT;

-- 2. Backfill any pre-existing rows with cia_round = 1 (single-round legacy data)
UPDATE public.cia_marks
SET cia_round = 1
WHERE cia_round IS NULL;

-- 3. Lock down the column — every row going forward must declare its round
ALTER TABLE public.cia_marks
	ALTER COLUMN cia_round SET NOT NULL,
	ALTER COLUMN cia_round SET DEFAULT 1;

-- 4. Drop the legacy unique constraints (names from 20260402_create_cia_marks_table.sql).
--    Using IF EXISTS so re-runs and forks of the schema (e.g. the 20260427 variant)
--    don't fail.
ALTER TABLE public.cia_marks
	DROP CONSTRAINT IF EXISTS unique_cia_marks;

ALTER TABLE public.cia_marks
	DROP CONSTRAINT IF EXISTS unique_cia_student_course_offering;

-- 5. Recreate the constraints with cia_round in the key.
--    These match the conflict key used by /api/v1/cia-marks/sync and
--    /api/pre-exam/internal-mark-entry — both have always intended one
--    row per (learner, course offering, session, round).
ALTER TABLE public.cia_marks
	ADD CONSTRAINT unique_cia_marks
		UNIQUE (institutions_id, exam_registration_id, course_offering_id, cia_round);

ALTER TABLE public.cia_marks
	ADD CONSTRAINT unique_cia_student_course_offering
		UNIQUE (student_id, course_offering_id, examination_session_id, cia_round);

COMMENT ON CONSTRAINT unique_cia_student_course_offering ON public.cia_marks IS
	'One cia_marks row per learner per course offering per session per round. cia_round in key allows Round 1 and Round 2 to coexist for the same learner.';
