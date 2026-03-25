-- Engineering Examiner Registration Schema Extension

-- 1. Add new columns to examiners table
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) DEFAULT 'arts';
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS salutation VARCHAR(10);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS highest_qualification VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS aicte_faculty_code VARCHAR(100);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS official_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS institution_coe_contact VARCHAR(50);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS institution_coe_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS teaching_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS industry_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS total_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS area_of_expertise VARCHAR(500);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS willingness_roles TEXT[];
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS google_profile_picture TEXT;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS declaration_acknowledged BOOLEAN DEFAULT false;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS additional_data JSONB DEFAULT '{}';

-- Index on form_type for filtering
CREATE INDEX IF NOT EXISTS idx_examiners_form_type ON examiners(form_type);

-- 2. Create examiner_form_configs table
CREATE TABLE IF NOT EXISTS examiner_form_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id),
    institution_code VARCHAR(50),
    form_type VARCHAR(50) NOT NULL,
    url_slug VARCHAR(100) UNIQUE NOT NULL,
    form_title VARCHAR(500),
    form_description TEXT,
    exam_session_label VARCHAR(100),
    departments JSONB DEFAULT '[]',
    designations JSONB DEFAULT '[]',
    willingness_roles JSONB DEFAULT '[]',
    salutations JSONB DEFAULT '["Dr", "Mr", "Mrs", "Ms"]',
    header_logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    google_client_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_institution_form_type UNIQUE(institution_id, form_type)
);

-- RLS
ALTER TABLE examiner_form_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_form_configs" ON examiner_form_configs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_active_configs" ON examiner_form_configs FOR SELECT USING (is_active = true);

-- 3. Seed engineering form config for Kathir College of Engineering
INSERT INTO examiner_form_configs (
    institution_code,
    form_type,
    url_slug,
    form_title,
    form_description,
    exam_session_label,
    departments,
    designations,
    willingness_roles,
    salutations,
    is_active
) VALUES (
    'JKKNCET',
    'engineering',
    'engg-examiner-registration',
    'External Faculty Database Collection Form - J.K.K. Nattraja College of Engineering & Technology [Autonomous]',
    'Greetings from Office of Controller of Examinations. External Examiner''s willingness form for Question Paper setting, Scrutiny, Practical Exams, Project Viva Voce and Central Valuation.',
    'Apr/May-2026',
    '["CSE", "AI&DS", "ECE", "EEE", "MECH", "CCE", "MATHEMATICS", "PHYSICS", "CHEMISTRY", "ENGLISH", "TAMIL", "CYBER SECURITY"]',
    '["Professor", "Associate Professor", "Assistant Professor"]',
    '["Question Paper Setter", "Question Paper Scrutiny", "External Examiner for Practical Exams", "Examiner for Central Valuation"]',
    '["Dr", "Mr", "Mrs", "Ms"]',
    true
) ON CONFLICT (url_slug) DO NOTHING;
