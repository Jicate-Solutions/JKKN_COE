-- =====================================================
-- CIA columns on exam_timetables + seating_arrangements
-- Created: 2026-04-22
-- Purpose: Allow CIA rounds to reuse main-exam timetable + seating infrastructure.
-- All columns nullable — main-exam queries must filter `cia_setting_id IS NULL`.
-- =====================================================

ALTER TABLE public.exam_timetables
	ADD COLUMN IF NOT EXISTS cia_setting_id UUID NULL,
	ADD COLUMN IF NOT EXISTS cia_round      INT  NULL,
	ADD COLUMN IF NOT EXISTS cia_round_name VARCHAR(40) NULL;

ALTER TABLE public.exam_timetables
	ADD CONSTRAINT cia_setting_fk
	FOREIGN KEY (cia_setting_id) REFERENCES public.cia_entry_settings(id) ON DELETE CASCADE;

ALTER TABLE public.exam_timetables
	ADD CONSTRAINT check_cia_consistency
	CHECK ((cia_setting_id IS NULL) = (cia_round IS NULL));

-- Partial index: main-exam queries remain O(main rows)
CREATE INDEX IF NOT EXISTS idx_et_cia
	ON public.exam_timetables(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_et_main_only
	ON public.exam_timetables(examination_session_id)
	WHERE cia_setting_id IS NULL;

-- seating_arrangements piggybacks via exam_timetables.id (already FK'd),
-- but add direct columns for efficient CIA-scoped queries
ALTER TABLE public.seating_arrangements
	ADD COLUMN IF NOT EXISTS cia_setting_id UUID NULL,
	ADD COLUMN IF NOT EXISTS cia_round      INT  NULL;

CREATE INDEX IF NOT EXISTS idx_sa_cia
	ON public.seating_arrangements(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;

COMMENT ON COLUMN public.exam_timetables.cia_setting_id IS
	'NULL = main exam row. Set = CIA round row; list/detail queries must filter to segregate.';
