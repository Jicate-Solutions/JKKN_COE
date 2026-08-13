-- =====================================================
-- Add grade to consolidated_results
-- =====================================================
-- Date: 2026-08-13
-- Purpose: Store the cumulative letter GRADE for the learner's overall
-- CGPA, looked up from the `cgpa_grade_system` table (the same band that
-- already supplies consolidated_results.part_a_classification and the
-- cumulative grade printed on the consolidated marksheet).
--
-- Band resolution (mirrors resolveCumulativeGrade() in
-- app/api/reports/consolidated-marksheet/route.ts):
--   1. institution-specific rows (institutions_id = cr.institutions_id) win
--      over the global defaults (institutions_id IS NULL)
--   2. within a set, an exact band (min_cgpa <= cgpa <= max_cgpa) wins
--   3. otherwise the highest band whose floor the CGPA clears (the seeded
--      bands leave gaps at every boundary, e.g. 8.49 | 8.50, while CGPA is
--      kept to 3 decimals)
--   4. grade_system_code must match the row's program_type (UG / PG)
-- =====================================================

ALTER TABLE public.consolidated_results
	ADD COLUMN IF NOT EXISTS grade VARCHAR(10);

COMMENT ON COLUMN public.consolidated_results.grade IS
'Cumulative letter grade for the overall CGPA, resolved from cgpa_grade_system (institution bands first, then global defaults, matched on grade_system_code = program_type). NULL when no band matched.';

-- =====================================================
-- Backfill existing rows
-- =====================================================
-- Safe to re-run: only touches rows where grade IS NULL. Does not modify
-- cgpa or any credit column — consolidated rows stay frozen as issued.

UPDATE public.consolidated_results cr
SET grade = (
	SELECT g.grade
	FROM public.cgpa_grade_system g
	WHERE g.is_active = true
	  AND g.grade_system_code = cr.program_type
	  AND (g.institutions_id = cr.institutions_id OR g.institutions_id IS NULL)
	  AND cr.cgpa >= g.min_cgpa
	ORDER BY
		(g.institutions_id IS NULL),          -- institution bands first
		(cr.cgpa <= g.max_cgpa) DESC,         -- exact band match first
		g.min_cgpa DESC                       -- else highest floor cleared
	LIMIT 1
)
WHERE cr.grade IS NULL;
