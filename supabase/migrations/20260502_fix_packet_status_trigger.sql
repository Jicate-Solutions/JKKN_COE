-- =====================================================
-- FIX: validate_packet_status_transition trigger fires on every UPDATE
-- Created: 2026-05-02
-- Description: The BEFORE UPDATE trigger raised "Invalid status transition
--              from Created to Created" when only valuation_date (or any
--              non-status column) was updated. Restrict the trigger to
--              fire only when packet_status actually changes.
-- =====================================================

DROP TRIGGER IF EXISTS trigger_validate_packet_status_transition
  ON public.answer_sheet_packets;

CREATE TRIGGER trigger_validate_packet_status_transition
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  WHEN (NEW.packet_status IS DISTINCT FROM OLD.packet_status)
  EXECUTE FUNCTION validate_packet_status_transition();
