-- Migration: Create pdf_institution_settings table for centralized PDF header management
-- Description: Allows non-developer admin users to configure PDF headers per institution
-- Date: 2025-12-13

-- =============================================================================
-- TABLE: pdf_institution_settings
-- =============================================================================

CREATE TABLE IF NOT EXISTS pdf_institution_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Institution reference (unique constraint ensures one active config per institution)
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    institution_code VARCHAR(50) NOT NULL,

    -- Logo settings
    logo_url TEXT,
    logo_width VARCHAR(20) DEFAULT '60px',
    logo_height VARCHAR(20) DEFAULT '60px',
    logo_position VARCHAR(20) DEFAULT 'left', -- left, center, right

    -- Secondary logo (right side)
    secondary_logo_url TEXT,
    secondary_logo_width VARCHAR(20) DEFAULT '60px',
    secondary_logo_height VARCHAR(20) DEFAULT '60px',

    -- Header configuration (supports HTML with placeholders)
    header_html TEXT,
    header_height VARCHAR(20) DEFAULT '80px',
    header_background_color VARCHAR(20) DEFAULT '#ffffff',

    -- Footer configuration (supports HTML with placeholders)
    footer_html TEXT,
    footer_height VARCHAR(20) DEFAULT '40px',
    footer_background_color VARCHAR(20) DEFAULT '#ffffff',

    -- Watermark settings
    watermark_url TEXT,
    watermark_opacity DECIMAL(3,2) DEFAULT 0.1 CHECK (watermark_opacity >= 0 AND watermark_opacity <= 1),
    watermark_enabled BOOLEAN DEFAULT false,

    -- Paper and layout settings
    paper_size VARCHAR(20) DEFAULT 'A4', -- A4, Letter, Legal
    orientation VARCHAR(20) DEFAULT 'portrait', -- portrait, landscape

    -- Margins (in mm)
    margin_top VARCHAR(20) DEFAULT '20mm',
    margin_bottom VARCHAR(20) DEFAULT '20mm',
    margin_left VARCHAR(20) DEFAULT '15mm',
    margin_right VARCHAR(20) DEFAULT '15mm',

    -- Font settings
    font_family VARCHAR(100) DEFAULT 'Times New Roman, serif',
    font_size_body VARCHAR(10) DEFAULT '11pt',
    font_size_heading VARCHAR(10) DEFAULT '14pt',
    font_size_subheading VARCHAR(10) DEFAULT '12pt',

    -- Color scheme
    primary_color VARCHAR(20) DEFAULT '#1a365d',
    secondary_color VARCHAR(20) DEFAULT '#4a5568',
    accent_color VARCHAR(20) DEFAULT '#2b6cb0',
    border_color VARCHAR(20) DEFAULT '#e2e8f0',

    -- Page numbering
    page_numbering_enabled BOOLEAN DEFAULT true,
    page_numbering_format VARCHAR(50) DEFAULT 'Page {page} of {total}',
    page_numbering_position VARCHAR(20) DEFAULT 'bottom-center', -- top-left, top-center, top-right, bottom-left, bottom-center, bottom-right

    -- Signature section settings
    signature_section_enabled BOOLEAN DEFAULT true,
    signature_labels JSONB DEFAULT '["Prepared by", "Verified by", "Controller of Examinations"]'::jsonb,
    signature_line_width VARCHAR(20) DEFAULT '100px',

    -- Template type (for future extensibility)
    template_type VARCHAR(50) DEFAULT 'default', -- default, certificate, hallticket, marksheet, report

    -- Status and activation
    active BOOLEAN DEFAULT true,

    -- Metadata
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_institution_template UNIQUE (institution_code, template_type)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pdf_settings_institution_code ON pdf_institution_settings(institution_code);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_institution_id ON pdf_institution_settings(institution_id);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_active ON pdf_institution_settings(active);
CREATE INDEX IF NOT EXISTS idx_pdf_settings_template_type ON pdf_institution_settings(template_type);

-- =============================================================================
-- TRIGGER: Auto-update updated_at timestamp
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

-- Policy: All authenticated users can read active settings for their institution
CREATE POLICY pdf_settings_read_active ON pdf_institution_settings
    FOR SELECT
    TO authenticated
    USING (active = true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE pdf_institution_settings IS 'Centralized PDF header/footer configuration per institution';
COMMENT ON COLUMN pdf_institution_settings.header_html IS 'HTML template for header. Supports placeholders: {{institution_name}}, {{institution_code}}, {{exam_name}}, {{date}}, {{page_number}}';
COMMENT ON COLUMN pdf_institution_settings.footer_html IS 'HTML template for footer. Supports same placeholders as header';
COMMENT ON COLUMN pdf_institution_settings.watermark_opacity IS 'Watermark transparency: 0 (invisible) to 1 (fully opaque)';
COMMENT ON COLUMN pdf_institution_settings.template_type IS 'Template variant: default, certificate, hallticket, marksheet, report';
COMMENT ON COLUMN pdf_institution_settings.signature_labels IS 'JSON array of signature line labels';

-- =============================================================================
-- SEED DATA: Default settings for existing institutions
-- =============================================================================

-- Insert default settings for each existing institution
INSERT INTO pdf_institution_settings (
    institution_id,
    institution_code,
    header_html,
    footer_html,
    template_type,
    active
)
SELECT
    i.id,
    i.institution_code,
    '<div style="text-align: center; padding: 10px 0; border-bottom: 2px solid {{primary_color}};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <img src="{{logo_url}}" style="width: {{logo_width}}; height: {{logo_height}};" />
            <div style="flex: 1; text-align: center;">
                <h1 style="color: {{primary_color}}; font-size: {{font_size_heading}}; margin: 0; font-family: {{font_family}};">{{institution_name}}</h1>
                <p style="color: {{secondary_color}}; font-size: {{font_size_body}}; margin: 5px 0;">{{accreditation_text}}</p>
                <p style="color: {{secondary_color}}; font-size: {{font_size_body}}; margin: 0;">{{address}}</p>
            </div>
            <img src="{{secondary_logo_url}}" style="width: {{secondary_logo_width}}; height: {{secondary_logo_height}};" />
        </div>
    </div>',
    '<div style="text-align: center; padding: 10px 0; border-top: 1px solid {{border_color}}; font-size: 9pt; color: {{secondary_color}};">
        <span>{{page_number_text}}</span>
        <span style="margin-left: 20px;">Generated on: {{generation_date}}</span>
    </div>',
    'default',
    true
FROM institutions i
WHERE NOT EXISTS (
    SELECT 1 FROM pdf_institution_settings p
    WHERE p.institution_code = i.institution_code
    AND p.template_type = 'default'
);
