-- =====================================================
-- Add part_b_total_credit to consolidated_results
-- =====================================================
-- Date: 2026-07-23
-- Purpose: part_b_credits_earned keeps the flag-respecting sum
-- (credit_included=true courses only). This NEW column stores the
-- ALL-INCLUSIVE Part B credit total: every course with
-- course_part_master='Part B', ignoring credit_included and pass
-- status, with final_marks.credit fallback when the course-master
-- credit is 0 (result_type='credit' internship/project rows).
-- =====================================================

ALTER TABLE public.consolidated_results
	ADD COLUMN IF NOT EXISTS part_b_total_credit INT DEFAULT 0;

COMMENT ON COLUMN public.consolidated_results.part_b_total_credit IS
'All-inclusive Part B credit total (includes credit_included=false courses; fm.credit fallback for zero-credit masters). part_b_credits_earned remains the credit_included-respecting sum.';
