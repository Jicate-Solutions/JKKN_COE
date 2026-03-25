-- Migration: Add myjkkn_institution_ids array field to institutions table
-- Purpose: Map multiple MyJKKN institution UUIDs to single COE institution
-- Example: CAS (Arts & Science) maps to both Aided and Self MyJKKN institutions

-- Add myjkkn_institution_ids array field
ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS myjkkn_institution_ids UUID[];

-- Create GIN index for fast array lookup
CREATE INDEX IF NOT EXISTS idx_institutions_myjkkn_ids
ON institutions USING GIN(myjkkn_institution_ids);

-- Update institutions with their MyJKKN UUIDs
-- CAS - Arts & Science (maps to both Aided and Self)
UPDATE institutions
SET myjkkn_institution_ids = ARRAY[
  'a33138b6-4eea-4675-941f-1071bf88b127',  -- JKKN College of Arts and Science (Aided)
  'b0b8a724-7c65-4f07-8047-2a38e8100ad5'   -- JKKN College of Arts and Science (Self)
]::uuid[]
WHERE institution_code = 'CAS';

-- CET - Engineering & Technology
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['5de4fba1-4564-41ed-8c73-5d948b74b843']::uuid[]
WHERE institution_code = 'CET';

-- COP - Pharmacy
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['ddbe6cac-a00b-405f-83ce-7f27a87abb15']::uuid[]
WHERE institution_code = 'COP';

-- CON - Nursing
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['eb40d779-32f9-4da7-9c30-bb9af0afb82f']::uuid[]
WHERE institution_code = 'CON';

-- AHS - Allied Health Sciences
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['60c57abd-ebef-46f9-84ff-8ef67d8654ee']::uuid[]
WHERE institution_code = 'AHS';

-- COD - Dental College
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['d6bd1a19-6e3f-44f9-a9a1-d36b9b3eb1b6']::uuid[]
WHERE institution_code = 'COD';

-- COE - Education
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['89a3a3e5-0c9e-4f9d-8ae9-dcfdd68dbc80']::uuid[]
WHERE institution_code = 'COE';

-- NMC - Naturopathy Medical College
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['6b3be1e9-c8f9-43ef-bf2b-2067d8f9f4e4']::uuid[]
WHERE institution_code = 'NMC';

-- PAG - Ayurveda & Grace
UPDATE institutions
SET myjkkn_institution_ids = ARRAY['8b76e09a-f58d-476f-8ce9-cbc3f8aa9c20']::uuid[]
WHERE institution_code = 'PAG';

-- Add comment for documentation
COMMENT ON COLUMN institutions.myjkkn_institution_ids IS
'Array of MyJKKN institution UUIDs that map to this COE institution. Used for institution lookup during session sync. One COE institution can map to multiple MyJKKN institutions (e.g., CAS maps to both Aided and Self).';
