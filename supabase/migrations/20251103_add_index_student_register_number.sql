-- Migration: Add index on students.register_number for improved query performance
-- Date: 2025-11-03
-- Description: Adds a B-tree index on the register_number column in the students table
--              to optimize lookups and joins, especially for exam registrations import

-- Create index on register_number (unique, non-null values)
CREATE INDEX IF NOT EXISTS idx_students_register_number
ON students(register_number)
WHERE register_number IS NOT NULL;

-- Create composite index for institution + register_number lookups
-- This optimizes the common query pattern: find student by register_number within an institution
CREATE INDEX IF NOT EXISTS idx_students_institution_register
ON students(institution_id, register_number)
WHERE register_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_students_register_number IS 'Index for fast lookups by student register number';
COMMENT ON INDEX idx_students_institution_register IS 'Composite index for institution-scoped student lookups';
