-- Setup missing records for semester creation
-- Run this in your Supabase SQL editor to create the required institution and program

-- Step 1: Create the institution JKKNCAS if it doesn't exist
INSERT INTO institutions (
    institution_code,
    name,
    phone,
    email,
    city,
    state,
    country,
    institution_type,
    is_active
) VALUES (
    'JKKNCAS',
    'JKKN College of Arts and Science',
    '1234567890',
    'info@jkkncas.edu.in',
    'Namakkal',
    'Tamil Nadu',
    'India',
    'Arts and Science',
    true
) ON CONFLICT (institution_code) DO NOTHING;

-- Step 2: Create a degree if needed (assuming BSc Zoology)
INSERT INTO degrees (
    degree_code,
    degree_name,
    degree_type,
    discipline,
    is_active
) VALUES (
    'BSCZOO',
    'Bachelor of Science - Zoology',
    'UG',
    'Science',
    true
) ON CONFLICT (degree_code) DO NOTHING;

-- Step 3: Create the program UZO
-- Note: You'll need to get the actual IDs after the inserts above
DO $$
DECLARE
    v_institution_id UUID;
    v_degree_id UUID;
BEGIN
    -- Get the institution ID
    SELECT id INTO v_institution_id
    FROM institutions
    WHERE institution_code = 'JKKNCAS';

    -- Get the degree ID (adjust degree_code as needed)
    SELECT id INTO v_degree_id
    FROM degrees
    WHERE degree_code = 'BSCZOO';

    -- Only insert if both IDs are found
    IF v_institution_id IS NOT NULL AND v_degree_id IS NOT NULL THEN
        INSERT INTO programs (
            institutions_id,
            institution_code,
            degree_id,
            degree_code,
            program_code,
            program_name,
            duration_years,
            total_semesters,
            program_type,
            is_active
        ) VALUES (
            v_institution_id,
            'JKKNCAS',
            v_degree_id,
            'BSCZOO',
            'UZO',
            'UG Zoology',
            3,
            6,
            'Regular',
            true
        ) ON CONFLICT (program_code) DO NOTHING;
    ELSE
        RAISE NOTICE 'Institution or Degree not found. Please check the codes.';
    END IF;
END $$;

-- Verify the data was created
SELECT 'Institutions:' as table_name, COUNT(*) as count FROM institutions WHERE institution_code = 'JKKNCAS'
UNION ALL
SELECT 'Programs:', COUNT(*) FROM programs WHERE program_code = 'UZO'
UNION ALL
SELECT 'Degrees:', COUNT(*) FROM degrees WHERE degree_code = 'BSCZOO';