-- =====================================================
-- Widen consolidated_results.cgpa to 3 decimals
-- =====================================================
-- Date: 2026-07-23
-- Purpose: Store the ACTUAL CGPA value with 3 decimal places
-- (e.g. 6.857) instead of the previous numeric(4,2) which rounded
-- to 2 decimals (6.86). No rounding beyond the 3rd decimal.
-- The check_cgpa_valid constraint (0..10) is unaffected.
-- =====================================================

ALTER TABLE public.consolidated_results
	ALTER COLUMN cgpa TYPE NUMERIC(5, 3);

COMMENT ON COLUMN public.consolidated_results.cgpa IS
'Cumulative GPA across all semesters, stored to 3 decimals (numeric(5,3)). Actual computed value — not rounded to 2 decimals.';
