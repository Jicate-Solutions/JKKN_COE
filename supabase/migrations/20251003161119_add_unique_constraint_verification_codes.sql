-- Add unique constraint to prevent duplicate code usage
-- This provides database-level protection against race conditions

-- Create a partial unique index that only applies to unused codes
-- This allows the same email/code combination to exist after use, but prevents
-- multiple unused entries with the same email/code
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_codes_unique_unused
  ON verification_codes(email, code)
  WHERE used_at IS NULL;

-- Add comment to explain the index
COMMENT ON INDEX idx_verification_codes_unique_unused IS
  'Ensures that only one unused verification code can exist for a given email/code combination, preventing race conditions during verification';
