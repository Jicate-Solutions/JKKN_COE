-- =====================================================================
-- Migration: Student CIA View — precompute cache + read-path indexes
-- Date: 2026-06-06
-- =====================================================================
-- Backs the new GET /api/v1/student-cia-view endpoint, which returns a
-- learner's ENTIRE internal-assessment (CIA) view in ONE call — every exam
-- session, its CIA round/component config, and the learner's component marks
-- per course per round — replacing the 40+ separate /api/v1/* calls the MyJKKN
-- "Internal Marks" tab made per learner (which caused 429 storms).
--
-- The cache PAYLOAD is computed in application code (lib/cia-view/) so the
-- aggregation logic has a SINGLE source of truth shared by the read path and
-- any back-fill. This table is just fast storage: one indexed row per learner
-- holding the full response JSON.
--
-- Run this in the Supabase SQL Editor (no CLI/exec_sql available). The endpoint
-- works WITHOUT this table — cache access is best-effort and a missing table is
-- treated as a cache miss (live build). Apply this to make result-day reads warm.
-- =====================================================================

-- =====================================================================
-- 1. PRECOMPUTE CACHE TABLE
-- =====================================================================
-- One row per (student, institution) holding the full all-sessions CIA view as
-- JSONB. The endpoint reads this in a single indexed lookup; a session-filtered
-- request slices the cached sessions in app code.

CREATE TABLE IF NOT EXISTS public.student_cia_view_cache (
	student_id        uuid NOT NULL,
	institutions_id   uuid NOT NULL,
	register_number   text,
	-- Full { student, sessions } response object.
	payload           jsonb NOT NULL,
	-- Build-logic version (CIA_VIEW_SCHEMA_VERSION in lib/cia-view). Rows whose
	-- version != current are ignored and rebuilt by the read path.
	schema_version    integer,
	computed_at       timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT student_cia_view_cache_pkey PRIMARY KEY (student_id, institutions_id),
	CONSTRAINT student_cia_view_cache_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES public.institutions(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Lookups by register_number (the other accepted endpoint identifier) and by
-- institution (scoping / bulk invalidation).
CREATE INDEX IF NOT EXISTS idx_scv_cache_register_number
	ON public.student_cia_view_cache(register_number, institutions_id)
	WHERE register_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scv_cache_institutions_id
	ON public.student_cia_view_cache(institutions_id);

COMMENT ON TABLE public.student_cia_view_cache IS
	'Precomputed per-learner CIA view (all sessions) for GET /api/v1/student-cia-view. Payload is built in lib/cia-view.';
COMMENT ON COLUMN public.student_cia_view_cache.payload IS
	'Full endpoint response: { student, sessions[] } with per-course per-round component marks.';

-- RLS: service role only (the v1 API runs server-side with the service key).
ALTER TABLE public.student_cia_view_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public'
		  AND tablename = 'student_cia_view_cache'
		  AND policyname = 'service_role_student_cia_view_cache'
	) THEN
		CREATE POLICY "service_role_student_cia_view_cache"
			ON public.student_cia_view_cache
			FOR ALL
			USING (auth.role() = 'service_role')
			WITH CHECK (auth.role() = 'service_role');
	END IF;
END $$;

-- =====================================================================
-- 2. READ-PATH PERFORMANCE INDEXES
-- =====================================================================
-- The live build fans out one learner at a time across these tables.

-- THIS-learner marks lookup, indexed by the store key the spec calls for:
-- (student_id, course_offering_id, examination_session_id, cia_round).
-- NOTE: 20260514_cia_marks_unique_include_cia_round.sql already creates a UNIQUE
-- constraint on exactly these columns (unique_cia_student_course_offering),
-- which is index-backed — so this is created IF NOT EXISTS only as a safety net
-- for deployments where that constraint name differs.
CREATE INDEX IF NOT EXISTS idx_cia_marks_student_offering_session_round
	ON public.cia_marks(student_id, course_offering_id, examination_session_id, cia_round)
	WHERE is_active = true;

-- CIA settings lookup by institution + session (config per session).
CREATE INDEX IF NOT EXISTS idx_cia_entry_settings_inst_session_active
	ON public.cia_entry_settings(institutions_id, examination_session_id)
	WHERE is_active = true;

-- exam_registrations: the build pulls a learner's Approved regs (regular AND
-- arrear) across all sessions. (Shared with the result-view build.)
CREATE INDEX IF NOT EXISTS idx_exam_registrations_student_status
	ON public.exam_registrations(student_id, registration_status);
