/**
 * PDF Settings Service
 *
 * Server-side service for fetching and managing PDF institution settings.
 * Includes caching for performance optimization.
 */

import { getSupabaseServer } from '@/lib/supabase-server'
import {
	type PdfInstitutionSettings,
	type PdfGenerationConfig,
	type TemplateType,
	type PaperSize,
	type Orientation,
	type PageNumberPosition,
	DEFAULT_PDF_SETTINGS,
	PAPER_DIMENSIONS,
} from '@/types/pdf-settings'

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

// Simple in-memory cache with TTL
const settingsCache = new Map<string, { data: PdfInstitutionSettings; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(institutionCode: string, templateType: TemplateType): string {
	return `${institutionCode}:${templateType}`
}

function getCachedSettings(institutionCode: string, templateType: TemplateType): PdfInstitutionSettings | null {
	const key = getCacheKey(institutionCode, templateType)
	const cached = settingsCache.get(key)

	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data
	}

	// Expired or not found
	settingsCache.delete(key)
	return null
}

function setCachedSettings(institutionCode: string, templateType: TemplateType, data: PdfInstitutionSettings): void {
	const key = getCacheKey(institutionCode, templateType)
	settingsCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate cache for a specific institution or all cache
 */
export function invalidatePdfSettingsCache(institutionCode?: string): void {
	if (institutionCode) {
		// Delete all entries for this institution
		for (const key of settingsCache.keys()) {
			if (key.startsWith(`${institutionCode}:`)) {
				settingsCache.delete(key)
			}
		}
	} else {
		// Clear all cache
		settingsCache.clear()
	}
}

// =============================================================================
// MAIN SERVICE FUNCTIONS
// =============================================================================

/**
 * Fetch PDF settings for an institution
 *
 * @param institutionCode - The institution code
 * @param templateType - The template type (default: 'default')
 * @param useCache - Whether to use cache (default: true)
 * @returns PDF settings or null if not found
 */
export async function getPdfSettings(
	institutionCode: string,
	templateType: TemplateType = 'default',
	useCache: boolean = true
): Promise<PdfInstitutionSettings | null> {
	// Check cache first
	if (useCache) {
		const cached = getCachedSettings(institutionCode, templateType)
		if (cached) {
			return cached
		}
	}

	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('pdf_institution_settings')
		.select('*')
		.eq('institution_code', institutionCode)
		.eq('template_type', templateType)
		.eq('active', true)
		.single()

	if (error || !data) {
		console.warn(`PDF settings not found for ${institutionCode}:${templateType}`)
		return null
	}

	// Cache the result
	setCachedSettings(institutionCode, templateType, data)

	return data
}

/**
 * Fetch PDF settings with fallback to default template
 *
 * @param institutionCode - The institution code
 * @param templateType - The template type
 * @returns PDF settings (falls back to default template if specific not found)
 */
export async function getPdfSettingsWithFallback(
	institutionCode: string,
	templateType: TemplateType = 'default'
): Promise<PdfInstitutionSettings | null> {
	// Try to get specific template
	let settings = await getPdfSettings(institutionCode, templateType)

	// Fallback to default template if specific not found
	if (!settings && templateType !== 'default') {
		settings = await getPdfSettings(institutionCode, 'default')
	}

	return settings
}

/**
 * Get PDF generation configuration with all placeholders resolved
 *
 * @param institutionCode - The institution code
 * @param templateType - The template type
 * @param customData - Custom data for placeholder replacement
 * @returns Ready-to-use PDF generation configuration
 */
export async function getPdfGenerationConfig(
	institutionCode: string,
	templateType: TemplateType = 'default',
	customData: Record<string, string> = {}
): Promise<PdfGenerationConfig> {
	const settings = await getPdfSettingsWithFallback(institutionCode, templateType)

	// Fetch institution data for placeholders
	const supabase = getSupabaseServer()
	const { data: institution } = await supabase
		.from('institutions')
		.select('id, institution_code, name')
		.eq('institution_code', institutionCode)
		.single()

	// Build placeholder values
	const placeholders: Record<string, string> = {
		institution_name: institution?.name || customData.institution_name || 'Institution',
		institution_code: institutionCode,
		exam_name: customData.exam_name || 'Examination',
		date: customData.date || new Date().toLocaleDateString('en-IN'),
		page_number: customData.page_number || '1',
		total_pages: customData.total_pages || '1',
		page_number_text: customData.page_number_text || 'Page 1 of 1',
		generation_date: new Date().toLocaleString('en-IN'),
		accreditation_text: customData.accreditation_text || '',
		address: customData.address || '',
		logo_url: settings?.logo_url || '',
		logo_width: settings?.logo_width || DEFAULT_PDF_SETTINGS.logo_width || '60px',
		logo_height: settings?.logo_height || DEFAULT_PDF_SETTINGS.logo_height || '60px',
		secondary_logo_url: settings?.secondary_logo_url || '',
		secondary_logo_width: settings?.secondary_logo_width || DEFAULT_PDF_SETTINGS.secondary_logo_width || '60px',
		secondary_logo_height: settings?.secondary_logo_height || DEFAULT_PDF_SETTINGS.secondary_logo_height || '60px',
		primary_color: settings?.primary_color || DEFAULT_PDF_SETTINGS.primary_color || '#1a365d',
		secondary_color: settings?.secondary_color || DEFAULT_PDF_SETTINGS.secondary_color || '#4a5568',
		accent_color: settings?.accent_color || DEFAULT_PDF_SETTINGS.accent_color || '#2b6cb0',
		border_color: settings?.border_color || DEFAULT_PDF_SETTINGS.border_color || '#e2e8f0',
		font_family: settings?.font_family || DEFAULT_PDF_SETTINGS.font_family || 'Times New Roman, serif',
		font_size_body: settings?.font_size_body || DEFAULT_PDF_SETTINGS.font_size_body || '11pt',
		font_size_heading: settings?.font_size_heading || DEFAULT_PDF_SETTINGS.font_size_heading || '14pt',
		font_size_subheading: settings?.font_size_subheading || DEFAULT_PDF_SETTINGS.font_size_subheading || '12pt',
		...customData,
	}

	// Replace placeholders in HTML
	const replaceInHtml = (html: string | null | undefined): string => {
		if (!html) return ''
		let result = html
		for (const [key, value] of Object.entries(placeholders)) {
			result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
		}
		return result
	}

	// Parse dimension string to number (mm)
	const parseDimension = (value: string | undefined): number => {
		if (!value) return 20
		const match = value.match(/^(\d+(?:\.\d+)?)(px|mm|cm|in|pt|%)$/)
		if (!match) return 20
		const num = parseFloat(match[1])
		const unit = match[2]
		switch (unit) {
			case 'px':
				return num * 0.264583
			case 'mm':
				return num
			case 'cm':
				return num * 10
			case 'in':
				return num * 25.4
			case 'pt':
				return num * 0.352778
			default:
				return num
		}
	}

	// Parse font size to number
	const parseFontSize = (value: string | undefined): number => {
		if (!value) return 11
		const match = value.match(/^(\d+(?:\.\d+)?)(pt|px|em|rem)$/)
		if (!match) return 11
		return parseFloat(match[1])
	}

	return {
		header_html: replaceInHtml(settings?.header_html),
		footer_html: replaceInHtml(settings?.footer_html),
		logo_url: settings?.logo_url || null,
		secondary_logo_url: settings?.secondary_logo_url || null,
		watermark_url: settings?.watermark_url || null,
		watermark_opacity: settings?.watermark_opacity ?? 0.1,
		watermark_enabled: settings?.watermark_enabled ?? false,
		paper_size: (settings?.paper_size || 'A4') as PaperSize,
		orientation: (settings?.orientation || 'portrait') as Orientation,
		margins: {
			top: parseDimension(settings?.margin_top),
			bottom: parseDimension(settings?.margin_bottom),
			left: parseDimension(settings?.margin_left),
			right: parseDimension(settings?.margin_right),
		},
		font_family: settings?.font_family || DEFAULT_PDF_SETTINGS.font_family || 'Times New Roman, serif',
		font_sizes: {
			body: parseFontSize(settings?.font_size_body),
			heading: parseFontSize(settings?.font_size_heading),
			subheading: parseFontSize(settings?.font_size_subheading),
		},
		colors: {
			primary: settings?.primary_color || DEFAULT_PDF_SETTINGS.primary_color || '#1a365d',
			secondary: settings?.secondary_color || DEFAULT_PDF_SETTINGS.secondary_color || '#4a5568',
			accent: settings?.accent_color || DEFAULT_PDF_SETTINGS.accent_color || '#2b6cb0',
			border: settings?.border_color || DEFAULT_PDF_SETTINGS.border_color || '#e2e8f0',
		},
		page_numbering: {
			enabled: settings?.page_numbering_enabled ?? true,
			format: settings?.page_numbering_format || 'Page {page} of {total}',
			position: (settings?.page_numbering_position || 'bottom-center') as PageNumberPosition,
		},
		signature: {
			enabled: settings?.signature_section_enabled ?? true,
			labels: settings?.signature_labels || ['Prepared by', 'Verified by', 'Controller of Examinations'],
			line_width: parseDimension(settings?.signature_line_width),
		},
	}
}

/**
 * Get all PDF settings for an institution (all template types)
 */
export async function getAllPdfSettingsForInstitution(institutionCode: string): Promise<PdfInstitutionSettings[]> {
	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('pdf_institution_settings')
		.select('*')
		.eq('institution_code', institutionCode)
		.order('template_type', { ascending: true })

	if (error) {
		console.error('Error fetching all PDF settings:', error)
		return []
	}

	return data || []
}

/**
 * Check if PDF settings exist for an institution
 */
export async function hasPdfSettings(institutionCode: string, templateType?: TemplateType): Promise<boolean> {
	const supabase = getSupabaseServer()

	let query = supabase
		.from('pdf_institution_settings')
		.select('id')
		.eq('institution_code', institutionCode)
		.eq('active', true)

	if (templateType) {
		query = query.eq('template_type', templateType)
	}

	const { data, error } = await query.limit(1)

	return !error && data && data.length > 0
}
