-- Create regulations table
CREATE TABLE IF NOT EXISTS regulations (
  id BIGSERIAL PRIMARY KEY,
  regulation_year INT NOT NULL,
  regulation_code VARCHAR(50) NOT NULL UNIQUE,
  status BOOLEAN NOT NULL DEFAULT true,
  
  minimum_internal NUMERIC(5,2) DEFAULT 0,
  minimum_external NUMERIC(5,2) DEFAULT 0,
  minimum_attendance NUMERIC(5,2) NOT NULL,
  minimum_total NUMERIC(5,2) DEFAULT 0,
  
  maximum_internal NUMERIC(5,2) DEFAULT 0,
  maximum_external NUMERIC(5,2) DEFAULT 0,
  maximum_total NUMERIC(5,2) DEFAULT 0,
  maximum_qp_marks NUMERIC(5,2) DEFAULT 0,
  
  condonation_range_start NUMERIC(5,2) DEFAULT 0,
  condonation_range_end NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_regulations_year ON regulations(regulation_year);
CREATE INDEX IF NOT EXISTS idx_regulations_code ON regulations(regulation_code);
CREATE INDEX IF NOT EXISTS idx_regulations_status ON regulations(status);
CREATE INDEX IF NOT EXISTS idx_regulations_created_at ON regulations(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for service role to manage all regulations
CREATE POLICY "Service role can manage all regulations" ON regulations
  FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users to read regulations
CREATE POLICY "Authenticated users can read regulations" ON regulations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert regulations (if they have proper permissions)
CREATE POLICY "Authenticated users can insert regulations" ON regulations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to update regulations (if they have proper permissions)
CREATE POLICY "Authenticated users can update regulations" ON regulations
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy for authenticated users to delete regulations (if they have proper permissions)
CREATE POLICY "Authenticated users can delete regulations" ON regulations
  FOR DELETE USING (auth.role() = 'authenticated');
