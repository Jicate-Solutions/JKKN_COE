-- =====================================================================
-- Migration: add schema_version to student_result_view_cache
-- Date: 2026-06-06
-- =====================================================================
-- The result-view payload is built in application code (lib/result-view). When
-- that build logic or shape changes, previously cached rows become stale. This
-- column lets the read path ignore (and rebuild) rows stamped with an older
-- RESULT_VIEW_SCHEMA_VERSION, so logic changes auto-heal without a manual purge.
--
-- Existing rows get NULL -> they mismatch the current version -> rebuilt on next
-- read. (Optionally TRUNCATE the table to force an immediate cold rebuild.)
--
-- Run this in the Supabase SQL Editor.
-- =====================================================================

ALTER TABLE public.student_result_view_cache
	ADD COLUMN IF NOT EXISTS schema_version integer;

COMMENT ON COLUMN public.student_result_view_cache.schema_version IS
	'Build-logic version (RESULT_VIEW_SCHEMA_VERSION in lib/result-view). Rows whose version != current are ignored and rebuilt by the read path.';

-- Force an immediate rebuild of every cached row (recommended after a shape
-- change such as semester-grouped -> session-grouped + arrears):
-- TRUNCATE TABLE public.student_result_view_cache;
