-- =====================================================
-- FIX: grade_points column precision
-- =====================================================
-- Date: 2026-01-18
-- Issue: grade_points DECIMAL(3,2) only allows values up to 9.99
--        but grade points can be 10.0 for 100% marks
--
-- Fix: Change to DECIMAL(4,2) to allow values up to 99.99
--      Also fix total_grade_points if needed
-- =====================================================

-- Fix grade_points column precision to allow 10.00
ALTER TABLE public.final_marks
ALTER COLUMN grade_points TYPE DECIMAL(4,2);

-- Fix total_grade_points column precision (credit * grade_points can be > 9.99)
-- e.g., 4 credits * 10.0 GP = 40.0
ALTER TABLE public.final_marks
ALTER COLUMN total_grade_points TYPE DECIMAL(6,2);

-- =====================================================
-- Verification
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== GRADE POINTS PRECISION FIX COMPLETE ===';
    RAISE NOTICE 'grade_points changed to DECIMAL(4,2) - allows up to 99.99';
    RAISE NOTICE 'total_grade_points changed to DECIMAL(6,2) - allows up to 9999.99';
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
