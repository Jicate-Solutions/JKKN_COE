-- Migration: Add WEF (With Effect From) fields to pdf_institution_settings
-- Description: Allows multiple templates of same type with time-based activation
-- Date: 2025-12-13

-- =============================================================================
-- ADD NEW COLUMNS
-- =============================================================================

-- Add template_name column (required, unique identifier for the template)
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS template_name VARCHAR(100);

-- Add WEF date column (when this template becomes active)
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS wef_date DATE DEFAULT CURRENT_DATE;

-- Add WEF time column (specific time when template activates)
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS wef_time TIME DEFAULT '00:00:00';

-- =============================================================================
-- UPDATE EXISTING RECORDS
-- =============================================================================

-- Set default template_name for existing records (use institution_code + template_type)
UPDATE pdf_institution_settings
SET template_name = CONCAT(institution_code, '_', template_type, '_default')
WHERE template_name IS NULL;

-- Make template_name NOT NULL after populating existing records
ALTER TABLE pdf_institution_settings
ALTER COLUMN template_name SET NOT NULL;

-- =============================================================================
-- REMOVE OLD UNIQUE CONSTRAINT (allows duplicate template_type)
-- =============================================================================

-- Drop the old unique constraint that restricted duplicate template types
ALTER TABLE pdf_institution_settings
DROP CONSTRAINT IF EXISTS unique_institution_template;

-- =============================================================================
-- ADD NEW INDEXES FOR WEF QUERIES
-- =============================================================================

-- Index for template_name lookups (used during PDF generation)
CREATE INDEX IF NOT EXISTS idx_pdf_settings_template_name
ON pdf_institution_settings(template_name);

-- Index for WEF-based template resolution
CREATE INDEX IF NOT EXISTS idx_pdf_settings_wef
ON pdf_institution_settings(institution_code, template_type, wef_date DESC, wef_time DESC);

-- Composite index for active template resolution by name
CREATE INDEX IF NOT EXISTS idx_pdf_settings_active_template
ON pdf_institution_settings(institution_code, template_name, active)
WHERE active = true;

-- =============================================================================
-- FUNCTION: Get active template for a given institution and template name
-- =============================================================================

CREATE OR REPLACE FUNCTION get_active_pdf_template(
    p_institution_code VARCHAR,
    p_template_name VARCHAR DEFAULT NULL,
    p_template_type VARCHAR DEFAULT 'default'
)
RETURNS SETOF pdf_institution_settings AS $$
BEGIN
    -- If template_name is provided, use it for exact match
    IF p_template_name IS NOT NULL THEN
        RETURN QUERY
        SELECT *
        FROM pdf_institution_settings
        WHERE institution_code = p_institution_code
          AND template_name = p_template_name
          AND active = true
          AND (wef_date < CURRENT_DATE OR (wef_date = CURRENT_DATE AND wef_time <= CURRENT_TIME))
        ORDER BY wef_date DESC, wef_time DESC
        LIMIT 1;
    ELSE
        -- Fallback to template_type-based resolution
        -- Returns the most recent active template that has passed its WEF
        RETURN QUERY
        SELECT *
        FROM pdf_institution_settings
        WHERE institution_code = p_institution_code
          AND template_type = p_template_type
          AND active = true
          AND (wef_date < CURRENT_DATE OR (wef_date = CURRENT_DATE AND wef_time <= CURRENT_TIME))
        ORDER BY wef_date DESC, wef_time DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN pdf_institution_settings.template_name IS 'Unique name for this template configuration. Used for direct template resolution during PDF generation.';
COMMENT ON COLUMN pdf_institution_settings.wef_date IS 'With Effect From date. Template becomes active from this date onwards.';
COMMENT ON COLUMN pdf_institution_settings.wef_time IS 'With Effect From time. Combined with wef_date for precise activation timing.';
COMMENT ON FUNCTION get_active_pdf_template IS 'Resolves the currently active PDF template based on template_name or template_type and WEF date/time.';
