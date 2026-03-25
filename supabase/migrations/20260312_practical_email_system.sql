-- Migration: Practical Examiner Email System
-- Date: 2026-03-12
-- Purpose: Add skilled examiner support + email batch tracking for practical exams

-- =============================================================================
-- 1. ALTER exam_timetable_examiners to support 'skilled' examiner type
-- =============================================================================

-- Drop old CHECK constraint if it exists (only internal/external)
DO $$
BEGIN
    ALTER TABLE exam_timetable_examiners DROP CONSTRAINT IF EXISTS exam_timetable_examiners_examiner_type_check;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop old check constraint: %', SQLERRM;
END $$;

-- Add new CHECK constraint with skilled
ALTER TABLE exam_timetable_examiners
    ADD CONSTRAINT exam_timetable_examiners_examiner_type_check
    CHECK (examiner_type IN ('internal', 'external', 'skilled'));

-- Drop old unique constraint and recreate to allow internal + external + skilled per timetable
DO $$
BEGIN
    ALTER TABLE exam_timetable_examiners DROP CONSTRAINT IF EXISTS exam_timetable_examiners_exam_timetable_id_examiner_type_key;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop old unique constraint: %', SQLERRM;
END $$;

ALTER TABLE exam_timetable_examiners
    ADD CONSTRAINT exam_timetable_examiners_exam_timetable_id_examiner_type_key
    UNIQUE (exam_timetable_id, examiner_type);

-- Add staff_email column for internal/skilled examiners (needed for email sending)
DO $$
BEGIN
    ALTER TABLE exam_timetable_examiners ADD COLUMN staff_email TEXT;
EXCEPTION WHEN duplicate_column THEN
    RAISE NOTICE 'staff_email column already exists';
END $$;

-- =============================================================================
-- 2. CREATE practical_email_batches table
-- =============================================================================

CREATE TABLE IF NOT EXISTS practical_email_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institutions_id UUID NOT NULL REFERENCES institutions(id),
    institution_code VARCHAR(50),
    examination_session_id UUID NOT NULL REFERENCES examination_sessions(id),
    total_emails INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'partial', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_peb_institution ON practical_email_batches(institutions_id);
CREATE INDEX IF NOT EXISTS idx_peb_session ON practical_email_batches(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_peb_status ON practical_email_batches(status);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_practical_email_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_peb_updated_at ON practical_email_batches;
CREATE TRIGGER trigger_peb_updated_at
    BEFORE UPDATE ON practical_email_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_practical_email_batches_updated_at();

-- =============================================================================
-- 3. ADD batch_id column to examiner_email_logs for linking
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE examiner_email_logs ADD COLUMN practical_batch_id UUID REFERENCES practical_email_batches(id);
EXCEPTION WHEN duplicate_column THEN
    RAISE NOTICE 'practical_batch_id column already exists';
END $$;

DO $$
BEGIN
    ALTER TABLE examiner_email_logs ADD COLUMN examiner_type VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN
    RAISE NOTICE 'examiner_type column already exists on examiner_email_logs';
END $$;

CREATE INDEX IF NOT EXISTS idx_eel_practical_batch ON examiner_email_logs(practical_batch_id);

-- Make examiner_id nullable (internal/skilled examiners don't have a row in examiners table)
ALTER TABLE examiner_email_logs ALTER COLUMN examiner_id DROP NOT NULL;

-- =============================================================================
-- 4. SEED email template for practical appointment
-- =============================================================================

INSERT INTO examiner_email_templates (
    template_code,
    subject_template,
    body_template,
    is_active,
    is_default
)
SELECT
    'PRACTICAL_APPOINTMENT',
    'Appointment of Examiner for End Semester Practical Examinations - {{exam_session}}',
    '<div style="font-family: ''Times New Roman'', serif; font-size: 14px; color: #333; max-width: 600px; margin: 0 auto;">
        <p>Dear {{examiner_name}},</p>
        <p>Greetings from {{institution_name}}.</p>
        <p>I am pleased to inform that you have been appointed as <strong>{{examiner_role}}</strong> to conduct the End Semester Practical Examinations for <strong>{{exam_session}}</strong>.</p>
        <p>Please find the detailed appointment letter attached as a PDF document.</p>
        <p>If you are not in a position to accept this offer, please inform us through mail at <a href="mailto:{{coe_email}}">{{coe_email}}</a> immediately.</p>
        <p>Remuneration will be paid as per the norms.</p>
        <br/>
        <p>Thanking you,</p>
        <p>With Regards,</p>
        <p><strong>{{coe_name}}</strong><br/>Controller of Examinations<br/>{{institution_name}}</p>
    </div>',
    true,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM examiner_email_templates WHERE template_code = 'PRACTICAL_APPOINTMENT'
);

-- =============================================================================
-- 5. VIEW: active_pdf_settings (convenience view)
-- =============================================================================

CREATE OR REPLACE VIEW active_pdf_settings AS
SELECT *
FROM pdf_institution_settings
WHERE active = true;

COMMENT ON VIEW active_pdf_settings IS 'Convenience view showing only active PDF institution settings';