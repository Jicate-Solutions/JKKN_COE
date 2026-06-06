-- =====================================================================
-- Migration: Student Result View — precompute cache, performance indexes,
--            and per-API-key rate limit configuration
-- Date: 2026-06-06
-- =====================================================================
-- Backs the new GET /api/v1/student-result-view endpoint, which returns a
-- learner's entire multi-semester result view in ONE call (replacing ~20
-- separate /api/v1/* calls per student on the MyJKKN result page).
--
-- Three concerns:
--   C2  Precompute / materialize      -> student_result_view_cache
--   C4  Read performance              -> targeted composite indexes
--   C3  Per-institution rate limiting -> api_keys.rate_limit_per_min
--
-- The cache PAYLOAD is computed in application code (lib/result-view/) so the
-- aggregation/SGPA/visibility logic has a SINGLE source of truth shared by the
-- read path and the publish-time refresh. This table is just fast storage:
-- one indexed row per learner holding the full response JSON.
--
-- Run this in the Supabase SQL Editor (no CLI/exec_sql available).
-- =====================================================================

-- =====================================================================
-- 1. PRECOMPUTE CACHE TABLE (C2)
-- =====================================================================
-- One row per (student, institution) holding the full all-semesters result
-- view as JSONB. The endpoint reads this in a single indexed lookup; a
-- session-filtered request slices the cached semesters in app code.
-- Refreshed whenever results are (re)published or a declaration date changes.

CREATE TABLE IF NOT EXISTS public.student_result_view_cache (
	student_id        uuid NOT NULL,
	institutions_id   uuid NOT NULL,
	register_number   text,
	-- Full { student, grade_system, semesters } response object.
	payload           jsonb NOT NULL,
	computed_at       timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT student_result_view_cache_pkey PRIMARY KEY (student_id, institutions_id),
	CONSTRAINT student_result_view_cache_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES public.institutions(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Lookups by register_number (the other accepted endpoint identifier) and by
-- institution (scoping / bulk invalidation).
CREATE INDEX IF NOT EXISTS idx_srv_cache_register_number
	ON public.student_result_view_cache(register_number, institutions_id)
	WHERE register_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_srv_cache_institutions_id
	ON public.student_result_view_cache(institutions_id);

COMMENT ON TABLE public.student_result_view_cache IS
	'Precomputed per-learner result view (all semesters) for GET /api/v1/student-result-view. Payload is built in lib/result-view and refreshed at result-publish time.';
COMMENT ON COLUMN public.student_result_view_cache.payload IS
	'Full endpoint response: { student, grade_system, semesters[] }. Undeclared semesters already have marks nulled / is_published=false at build time.';

-- RLS: service role only (the v1 API runs server-side with the service key).
ALTER TABLE public.student_result_view_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public'
		  AND tablename = 'student_result_view_cache'
		  AND policyname = 'service_role_student_result_view_cache'
	) THEN
		CREATE POLICY "service_role_student_result_view_cache"
			ON public.student_result_view_cache
			FOR ALL
			USING (auth.role() = 'service_role')
			WITH CHECK (auth.role() = 'service_role');
	END IF;
END $$;

-- =====================================================================
-- 2. READ-PATH PERFORMANCE INDEXES (C4)
-- =====================================================================
-- These accelerate the live-build path (cache miss) and the publish-time
-- refresh, which fan out one learner at a time.

-- final_marks lookup by learner + session (live build joins marks per reg).
CREATE INDEX IF NOT EXISTS idx_final_marks_student_session
	ON public.final_marks(student_id, examination_session_id);

-- exam_registrations: the build pulls a learner's Approved regs (BOTH regular
-- and arrear papers) across all sessions. Indexed by (student_id,
-- registration_status) per C4.
CREATE INDEX IF NOT EXISTS idx_exam_registrations_student_status
	ON public.exam_registrations(student_id, registration_status);

-- register_number -> learner resolution (endpoint accepts register_number).
CREATE INDEX IF NOT EXISTS idx_exam_registrations_stu_register_no
	ON public.exam_registrations(stu_register_no)
	WHERE stu_register_no IS NOT NULL;

-- course_mapping is keyed by institution_code (string), not institutions_id.
CREATE INDEX IF NOT EXISTS idx_course_mapping_institution_program
	ON public.course_mapping(institution_code, program_code);

-- grade_system band set scoped by institution + UG/PG code.
CREATE INDEX IF NOT EXISTS idx_grade_system_institution_code
	ON public.grade_system(institutions_id, grade_system_code)
	WHERE is_active = true;

-- =====================================================================
-- 3. PER-API-KEY RATE LIMIT CONFIG (C3)
-- =====================================================================
-- Adds an optional per-key requests-per-minute ceiling. NULL = use the
-- application default. Lets ops raise the shared MyJKKN key and/or issue
-- per-institution keys with independent limits, so one college's result-day
-- spike cannot starve other institutions on the same key pool.

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'api_keys'
		  AND column_name = 'rate_limit_per_min'
	) THEN
		ALTER TABLE public.api_keys
			ADD COLUMN rate_limit_per_min integer;
		RAISE NOTICE 'rate_limit_per_min column added to api_keys';
	ELSE
		RAISE NOTICE 'rate_limit_per_min column already exists on api_keys';
	END IF;
END $$;

COMMENT ON COLUMN public.api_keys.rate_limit_per_min IS
	'Optional per-key request ceiling (requests/minute). NULL = application default. Raise for high-traffic shared keys (e.g. MyJKKN) or set per-institution keys independently.';
