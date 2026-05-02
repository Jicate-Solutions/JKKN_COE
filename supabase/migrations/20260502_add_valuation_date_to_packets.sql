-- =====================================================
-- PER-PACKET VALUATION DATE
-- Created: 2026-05-02
-- Description: Adds a per-packet valuation date so Central Valuation
--              dates can be planned at packet granularity (e.g., 9
--              packets of one course spread across multiple days
--              within the board's valuation window).
-- =====================================================

ALTER TABLE public.answer_sheet_packets
  ADD COLUMN IF NOT EXISTS valuation_date date NULL;

CREATE INDEX IF NOT EXISTS idx_asp_valuation_date
  ON public.answer_sheet_packets (institutions_id, examination_session_id, valuation_date);

COMMENT ON COLUMN public.answer_sheet_packets.valuation_date IS
  'Scheduled Central Valuation date for this specific packet. Must lie within the matching board_valuation_windows range.';
