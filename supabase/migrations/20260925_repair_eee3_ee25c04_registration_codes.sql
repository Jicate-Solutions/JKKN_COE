-- Repair: EEE semester-3 NOV-DEC-2026 registrations still carry course_code EE25C04
-- ---------------------------------------------------------------------------------
-- APPLIED 2026-09-25 (still_stale = 0). Kept for the record.
-- The permanent fix (trigger chain + full backfill) is 20260925_course_code_cascade_triggers.sql.
--
-- History (transaction_logs, course updates):
--   2026-08-17 17:02  BASIC ELECTRONICS AND ELECTRICAL ENGINEERING  EE25C04 -> 25EE
--   2026-08-17 17:03  ELECTROMAGNETIC THEORY                        EE25C10 -> EE25C04
--   2026-08-17 17:12  EEE-3 offerings created; 17:13 registrations bulk-created with EE25C04
--   2026-09-15 10:48  ELECTROMAGNETIC THEORY                        EE25C04 -> EE25C10 (back)
--   2026-09-15 14:11  BASIC ELECTRONICS AND ELECTRICAL ENGINEERING  25EEC04 -> EE25C04 (back)
--   2026-09-22 16:32  EEE-3 offering course_code fixed to EE25C10 by hand
--   => 56 exam_registrations rows (offering 87759e04..., all Pending) still said EE25C04,
--      which resolves to BASIC ELECTRONICS on every screen that looks titles up by code
--      (Exam Applications current papers, Course Count report, ...).

-- Preview
SELECT er.id, er.stu_register_no, er.course_code, er.registration_status, c.course_code AS master_code, c.course_name
FROM public.exam_registrations er
JOIN public.course_offerings co ON co.id = er.course_offering_id
JOIN public.courses c ON c.id = co.course_id
WHERE er.course_offering_id = '87759e04-44b9-45ec-bae6-9b3ea54c86ad'
  AND er.course_code = 'EE25C04';

-- Apply (56 rows)
UPDATE public.exam_registrations er
SET course_code = 'EE25C10',
    updated_at = NOW()
WHERE er.course_offering_id = '87759e04-44b9-45ec-bae6-9b3ea54c86ad'
  AND er.course_code = 'EE25C04';

-- Verify (expect 0)
SELECT COUNT(*) AS still_stale
FROM public.exam_registrations
WHERE course_offering_id = '87759e04-44b9-45ec-bae6-9b3ea54c86ad'
  AND course_code <> 'EE25C10';
