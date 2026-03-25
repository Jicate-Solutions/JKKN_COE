-- EXAMINER MANAGEMENT TABLES

-- Enums
DO $$ BEGIN CREATE TYPE examiner_type AS ENUM ('UG', 'PG', 'PRACTICAL', 'SCRUTINY', 'UG_PG', 'ALL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE examiner_status AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE email_delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE appointment_type AS ENUM ('UG_VALUATION', 'PG_VALUATION', 'PRACTICAL', 'SCRUTINY', 'CHIEF_EXAMINER', 'EXTERNAL_EXAMINER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Examiners Table
CREATE TABLE IF NOT EXISTS examiners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mobile VARCHAR(20),
    designation VARCHAR(255),
    department VARCHAR(255),
    institution_name VARCHAR(500),
    institution_address TEXT,
    ug_experience_years INTEGER DEFAULT 0,
    pg_experience_years INTEGER DEFAULT 0,
    examiner_type examiner_type DEFAULT 'UG',
    is_internal BOOLEAN DEFAULT FALSE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    status examiner_status DEFAULT 'PENDING',
    status_remarks TEXT,
    institution_id UUID REFERENCES institutions(id),
    institution_code VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_examiners_email ON examiners(email);
CREATE INDEX IF NOT EXISTS idx_examiners_status ON examiners(status);
CREATE INDEX IF NOT EXISTS idx_examiners_examiner_type ON examiners(examiner_type);

-- Board Associations
CREATE TABLE IF NOT EXISTS examiner_board_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    examiner_id UUID NOT NULL REFERENCES examiners(id) ON DELETE CASCADE,
    board_id UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    board_code VARCHAR(50),
    willing_for_valuation BOOLEAN DEFAULT TRUE,
    willing_for_practical BOOLEAN DEFAULT FALSE,
    willing_for_scrutiny BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_examiner_board UNIQUE(examiner_id, board_id)
);

-- Email Verification
CREATE TABLE IF NOT EXISTS examiner_email_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Logs
CREATE TABLE IF NOT EXISTS examiner_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    examiner_id UUID NOT NULL REFERENCES examiners(id) ON DELETE CASCADE,
    board_type VARCHAR(50),
    board_id UUID REFERENCES board(id),
    email_to VARCHAR(255) NOT NULL,
    email_cc TEXT[],
    email_bcc TEXT[],
    email_subject VARCHAR(500) NOT NULL,
    email_body TEXT,
    pdf_url TEXT,
    status email_delivery_status DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    institution_code VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- SMTP Config
CREATE TABLE IF NOT EXISTS smtp_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_code VARCHAR(50),
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT TRUE,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255) DEFAULT 'Controller of Examinations',
    default_cc_emails TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE IF NOT EXISTS examiner_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    examiner_id UUID NOT NULL REFERENCES examiners(id) ON DELETE CASCADE,
    institution_code VARCHAR(50) NOT NULL,
    board_id UUID REFERENCES board(id),
    board_code VARCHAR(50),
    appointment_type appointment_type NOT NULL,
    appointment_date DATE NOT NULL,
    reporting_time TIME,
    venue VARCHAR(500),
    subject_code VARCHAR(50),
    subject_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'APPOINTED',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- RLS
ALTER TABLE examiners ENABLE ROW LEVEL SECURITY;
ALTER TABLE examiner_board_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE examiner_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE examiner_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE examiner_email_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_examiners" ON examiners FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_board_assoc" ON examiner_board_associations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_email_logs" ON examiner_email_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_appointments" ON examiner_appointments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_smtp" ON smtp_configuration FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_verification" ON examiner_email_verification FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_verification_insert" ON examiner_email_verification FOR INSERT WITH CHECK (TRUE);
