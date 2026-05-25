-- =====================================================
-- Migration: Add 'Professional Competency Skill' to course_info
-- Date: 2026-05-22
-- =====================================================
-- Adds a new course type entry that appears in the Course Type
-- dropdown on /master/courses. Uses sort_order 47 to append after
-- the existing 46 seeded entries (see 20260513_create_course_info_and_course_level.sql).
-- =====================================================

INSERT INTO public.course_info (course_type, display_code, sort_order, status) VALUES
  ('Professional Competency Skill', 'PCS', 47, TRUE)
ON CONFLICT (course_type) DO UPDATE
  SET display_code = EXCLUDED.display_code,
      sort_order   = EXCLUDED.sort_order,
      status       = EXCLUDED.status;
