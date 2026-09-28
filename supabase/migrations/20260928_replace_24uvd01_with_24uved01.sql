-- Replace duplicate course 24UVD01 (VALUE EDUCATION : YOGA, CAS R-2024) with 24UVED01, then delete 24UVD01.
-- Investigated 2026-09-28: only UMA-5 / NOV-DEC-2026 used 24UVD01 —
--   1 course_mapping, 1 course_offering, 1 exam_registration (AUG24MA02 SANDHIYA T, Approved, paid),
--   1 draft ia_question_paper. No final_marks / internal_marks / marks_entry / backlogs / timetables.
-- The offering is REPOINTED, never deleted: deleting it would CASCADE-delete the Approved registration.
-- Fee follows 24UVED01: exam_fee_master prices CAS UG Theory papers at 115 per paper (the same rate
-- 366 paid 24UVED01 registrations carry), so exam_registration_fee_details totals (1010 / 1250) are unchanged.
-- Run in the Supabase SQL Editor.

BEGIN;

-- 1. Course mapping UMA-5
UPDATE course_mapping
SET course_id = '92e4d544-7cc0-4544-aa58-a1057f607438',
	course_code = '24UVED01',
	updated_at = now()
WHERE id = '7fb8781e-cfc5-4eee-93ea-09f9564e1157'
	AND course_id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd';

-- 2. Course offering UMA-5 NOV-DEC-2026 (trg_course_offerings_cascade_code also rewrites its registrations)
UPDATE course_offerings
SET course_id = '92e4d544-7cc0-4544-aa58-a1057f607438',
	course_code = '24UVED01',
	updated_at = now()
WHERE id = '28b8682c-9fde-4b10-805a-6707bd661fbf'
	AND course_id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd';

-- 3. Exam registration: code + fee follow 24UVED01 (UG Theory paper = 115)
UPDATE exam_registrations
SET course_code = '24UVED01',
	fee_amount = (
		SELECT amount FROM exam_fee_master
		WHERE institution_code = 'CAS' AND category = 'EXAM_PAPER' AND sub_category = 'THEORY'
			AND program_level = 'UG' AND program_code IS NULL AND is_active = true
		ORDER BY effective_from DESC LIMIT 1
	),
	updated_at = now()
WHERE course_offering_id = '28b8682c-9fde-4b10-805a-6707bd661fbf';

-- 4. Draft IA (Model) question paper
UPDATE ia_question_papers
SET course_id = '92e4d544-7cc0-4544-aa58-a1057f607438',
	course_code = '24UVED01',
	subject_title = 'ABILITY ENHANCEMENT-I-VALUE EDUCATION- YOGA FOR HUMAN EXCELLENCE',
	updated_at = now()
WHERE id = 'f5d04fb7-56be-4647-82c1-af49efb9483b';

-- 5. Delete the old master (RESTRICT FKs abort the whole transaction if anything still points at it)
DELETE FROM courses WHERE id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd' AND course_code = '24UVD01';

COMMIT;

-- Verify: expect 0 rows left on 24UVD01, UMA row on 24UVED01 @ 115, fee total still 1010
SELECT 'courses' AS t, count(*) FROM courses WHERE course_code = '24UVD01'
UNION ALL SELECT 'course_mapping', count(*) FROM course_mapping WHERE course_code = '24UVD01' OR course_id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd'
UNION ALL SELECT 'course_offerings', count(*) FROM course_offerings WHERE course_code = '24UVD01' OR course_id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd'
UNION ALL SELECT 'exam_registrations', count(*) FROM exam_registrations WHERE course_code = '24UVD01'
UNION ALL SELECT 'ia_question_papers', count(*) FROM ia_question_papers WHERE course_code = '24UVD01' OR course_id = '6bccfa17-acc8-47ce-bf16-8957e325a7cd';

SELECT er.stu_register_no, er.course_code, er.fee_amount, er.registration_status,
	(SELECT sum(fee_amount) FROM exam_registrations x
		WHERE x.student_id = er.student_id AND x.examination_session_id = er.examination_session_id) AS paper_fee_total,
	fd.exam_fee AS fee_details_exam_fee, fd.final_amount
FROM exam_registrations er
LEFT JOIN exam_registration_fee_details fd
	ON fd.student_id = er.student_id AND fd.examination_session_id = er.examination_session_id
WHERE er.course_offering_id = '28b8682c-9fde-4b10-805a-6707bd661fbf';
