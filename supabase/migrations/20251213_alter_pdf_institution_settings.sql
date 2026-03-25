-- Migration: Alter pdf_institution_settings table to add missing columns
-- Description: Adds template_type support and additional configuration fields
-- Date: 2025-12-13

-- =============================================================================
-- ADD MISSING COLUMNS
-- =============================================================================

-- Template type for different document types
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS template_type VARCHAR(50) DEFAULT 'default';

-- Logo position
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS logo_position VARCHAR(20) DEFAULT 'left';

-- Secondary logo fields
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS secondary_logo_url TEXT;

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS secondary_logo_width VARCHAR(20) DEFAULT '60px';

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS secondary_logo_height VARCHAR(20) DEFAULT '60px';

-- Background colors
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS header_background_color VARCHAR(20) DEFAULT '#ffffff';

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS footer_background_color VARCHAR(20) DEFAULT '#ffffff';

-- Watermark enabled flag
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT false;

-- Font sizes (body and subheading)
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS font_size_body VARCHAR(10) DEFAULT '11pt';

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS font_size_subheading VARCHAR(10) DEFAULT '12pt';

-- Border color
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS border_color VARCHAR(20) DEFAULT '#e2e8f0';

-- Page numbering fields (rename/add)
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS page_numbering_enabled BOOLEAN DEFAULT true;

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS page_numbering_format VARCHAR(50) DEFAULT 'Page {page} of {total}';

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS page_numbering_position VARCHAR(20) DEFAULT 'bottom-center';

-- Signature section fields
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS signature_section_enabled BOOLEAN DEFAULT true;

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS signature_labels JSONB DEFAULT '["Prepared by", "Verified by", "Controller of Examinations"]'::jsonb;

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS signature_line_width VARCHAR(20) DEFAULT '100px';

-- Audit fields
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- =============================================================================
-- MIGRATE DATA FROM OLD COLUMNS TO NEW
-- =============================================================================

-- Copy show_page_numbers to page_numbering_enabled
UPDATE pdf_institution_settings
SET page_numbering_enabled = show_page_numbers
WHERE page_numbering_enabled IS NULL AND show_page_numbers IS NOT NULL;

-- Copy signature_section to signature_section_enabled
UPDATE pdf_institution_settings
SET signature_section_enabled = signature_section
WHERE signature_section_enabled IS NULL AND signature_section IS NOT NULL;

-- Copy page_number_format to page_numbering_format
UPDATE pdf_institution_settings
SET page_numbering_format = page_number_format
WHERE page_numbering_format IS NULL AND page_number_format IS NOT NULL;

-- Copy font_size_base to font_size_body
UPDATE pdf_institution_settings
SET font_size_body = font_size_base
WHERE font_size_body IS NULL AND font_size_base IS NOT NULL;

-- =============================================================================
-- ADD UNIQUE CONSTRAINT FOR INSTITUTION + TEMPLATE TYPE
-- =============================================================================

-- First ensure existing records have template_type
UPDATE pdf_institution_settings
SET template_type = 'default'
WHERE template_type IS NULL;

-- Add unique constraint (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_institution_template'
    ) THEN
        ALTER TABLE pdf_institution_settings
        ADD CONSTRAINT unique_institution_template
        UNIQUE (institution_code, template_type);
    END IF;
END $$;

-- =============================================================================
-- CREATE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pdf_settings_institution_code ON pdf_institution_settings(institution_code);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_institution_id ON pdf_institution_settings(institution_id);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_active ON pdf_institution_settings(active);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_template_type ON pdf_institution_settings(template_type);

-- =============================================================================
-- UPDATE TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_pdf_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pdf_settings_updated_at ON pdf_institution_settings;

CREATE TRIGGER trigger_pdf_settings_updated_at
    BEFORE UPDATE ON pdf_institution_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_pdf_settings_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE pdf_institution_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS pdf_settings_admin_all ON pdf_institution_settings;
DROP POLICY IF EXISTS pdf_settings_read_active ON pdf_institution_settings;

-- Policy: Admins can do everything
CREATE POLICY pdf_settings_admin_all ON pdf_institution_settings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('admin', 'super_admin', 'coe_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('admin', 'super_admin', 'coe_admin')
        )
    );

-- Policy: All authenticated users can read active settings
CREATE POLICY pdf_settings_read_active ON pdf_institution_settings
    FOR SELECT
    TO authenticated
    USING (active = true);

-- =============================================================================
-- ADD COMMENTS
-- =============================================================================

COMMENT ON TABLE pdf_institution_settings IS 'Centralized PDF header/footer configuration per institution';
COMMENT ON COLUMN pdf_institution_settings.template_type IS 'Template variant: default, certificate, hallticket, marksheet, report';
COMMENT ON COLUMN pdf_institution_settings.header_html IS 'HTML template for header. Supports placeholders: {{institution_name}}, {{logo_url}}, {{exam_name}}, etc.';
COMMENT ON COLUMN pdf_institution_settings.footer_html IS 'HTML template for footer. Supports same placeholders as header';
COMMENT ON COLUMN pdf_institution_settings.watermark_opacity IS 'Watermark transparency: 0 (invisible) to 1 (fully opaque)';
COMMENT ON COLUMN pdf_institution_settings.signature_labels IS 'JSON array of signature line labels';
