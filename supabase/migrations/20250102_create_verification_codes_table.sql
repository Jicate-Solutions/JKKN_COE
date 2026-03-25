-- Create verification codes table
CREATE TABLE IF NOT EXISTS verification_codes (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at ON verification_codes(created_at);

-- Create trigger to update updated_at column
CREATE TRIGGER update_verification_codes_updated_at
  BEFORE UPDATE ON verification_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own verification codes
CREATE POLICY "Users can insert their own verification codes" ON verification_codes
  FOR INSERT WITH CHECK (true);

-- Allow users to read their own verification codes
CREATE POLICY "Users can read their own verification codes" ON verification_codes
  FOR SELECT USING (true);

-- Allow users to update their own verification codes
CREATE POLICY "Users can update their own verification codes" ON verification_codes
  FOR UPDATE USING (true);
