-- =====================================================
-- ADD RLS POLICY FOR STUDENT_DUMMY_NUMBERS
-- Created: 2025-11-17
-- Description: Add service role policy to allow updating packet_no field
-- =====================================================

-- Add policy for service role to update student_dummy_numbers
CREATE POLICY IF NOT EXISTS "Service role can update student dummy numbers"
  ON public.student_dummy_numbers
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add policy for service role to have full access
CREATE POLICY IF NOT EXISTS "Service role can manage all student dummy numbers"
  ON public.student_dummy_numbers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify RLS is enabled (if not, enable it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'student_dummy_numbers'
      AND rowsecurity = true
  ) THEN
    ALTER TABLE public.student_dummy_numbers ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMENT ON POLICY "Service role can manage all student dummy numbers" ON public.student_dummy_numbers
  IS 'Allows service role to perform all operations on student_dummy_numbers table for packet generation';
