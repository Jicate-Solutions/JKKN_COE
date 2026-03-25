-- Migration: Allow multiple grade system codes (UG, PG, or both)
-- ============================================================
--
-- Purpose: Enable multi-select for grade_system_code field in exam_types table
--
-- Background:
-- The exam_types table has a check constraint (exam_types_grade_sys_code_check) that
-- only allows single values 'UG' or 'PG'. This migration updates the constraint to
-- also allow comma-separated combinations like 'UG,PG'.
--
-- Valid values after migration:
-- - NULL (optional field)
-- - 'UG' (Undergraduate only)
-- - 'PG' (Postgraduate only)
-- - 'UG,PG' (Both UG and PG)
-- - 'PG,UG' (Both - alternate order)
--
-- Related files:
-- - app/api/exam-management/exam-types/route.ts (API validation)
-- - app/(coe)/exam-management/exam-types/page.tsx (UI multi-select)
--
-- Date: 2026-01-06
-- ============================================================

-- Step 1: Drop the existing check constraint
ALTER TABLE exam_types DROP CONSTRAINT IF EXISTS exam_types_grade_sys_code_check;

-- Step 2: Add a new check constraint that allows multi-select values
ALTER TABLE exam_types ADD CONSTRAINT exam_types_grade_sys_code_check
CHECK (
  grade_system_code IS NULL
  OR grade_system_code IN ('UG', 'PG', 'UG,PG', 'PG,UG')
);

-- Step 3: Add comment explaining the column purpose and valid values
COMMENT ON COLUMN exam_types.grade_system_code IS 'Grade system code - can be UG, PG, or both (UG,PG). Supports multi-select for exam types applicable to multiple grade systems.';
