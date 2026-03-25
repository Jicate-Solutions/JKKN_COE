/**
 * PDF Institution Settings Types
 *
 * TypeScript interfaces for the centralized PDF header management system.
 * These types support the pdf_institution_settings table and related operations.
 */

// =============================================================================
// ENUMS AND CONSTANTS
// =============================================================================

export type PaperSize = 'A4' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'
export type LogoPosition = 'left' | 'center' | 'right'
export type PageNumberPosition =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right'
export type TemplateType = 'default' | 'certificate' | 'hallticket' | 'marksheet' | 'report'

// WEF (With Effect From) status for template activation
export type WefStatus = 'active' | 'scheduled' | 'expired'

// Available placeholders for header/footer HTML templates
export const PDF_PLACEHOLDERS = {
	INSTITUTION_NAME: '{{institution_name}}',
	INSTITUTION_CODE: '{{institution_code}}',
	EXAM_NAME: '{{exam_name}}',
	DATE: '{{date}}',
	PAGE_NUMBER: '{{page_number}}',
	TOTAL_PAGES: '{{total_pages}}',
	PAGE_NUMBER_TEXT: '{{page_number_text}}',
	GENERATION_DATE: '{{generation_date}}',
	LOGO_URL: '{{logo_url}}',
	LOGO_WIDTH: '{{logo_width}}',
	LOGO_HEIGHT: '{{logo_height}}',
	SECONDARY_LOGO_URL: '{{secondary_logo_url}}',
	SECONDARY_LOGO_WIDTH: '{{secondary_logo_width}}',
	SECONDARY_LOGO_HEIGHT: '{{secondary_logo_height}}',
	PRIMARY_COLOR: '{{primary_color}}',
	SECONDARY_COLOR: '{{secondary_color}}',
	ACCENT_COLOR: '{{accent_color}}',
	BORDER_COLOR: '{{border_color}}',
	FONT_FAMILY: '{{font_family}}',
	FONT_SIZE_BODY: '{{font_size_body}}',
	FONT_SIZE_HEADING: '{{font_size_heading}}',
	FONT_SIZE_SUBHEADING: '{{font_size_subheading}}',
	ACCREDITATION_TEXT: '{{accreditation_text}}',
	ADDRESS: '{{address}}',
} as const

// =============================================================================
// DATABASE ENTITY TYPE
// =============================================================================

export interface PdfInstitutionSettings {
	id: string
	institution_id: string | null
	institution_code: string

	// Template identification (allows multiple records with same template_type)
	template_name: string
	template_type: TemplateType

	// WEF (With Effect From) - determines when this template becomes active
	wef_date: string // ISO date string (YYYY-MM-DD)
	wef_time: string // Time string (HH:mm)

	// Logo settings
	logo_url: string | null
	logo_width: string
	logo_height: string
	logo_position: LogoPosition

	// Secondary logo (right side)
	secondary_logo_url: string | null
	secondary_logo_width: string
	secondary_logo_height: string

	// Header configuration
	header_html: string | null
	header_height: string
	header_background_color: string

	// Footer configuration
	footer_html: string | null
	footer_height: string
	footer_background_color: string

	// Watermark settings
	watermark_url: string | null
	watermark_opacity: number
	watermark_enabled: boolean

	// Paper and layout settings
	paper_size: PaperSize
	orientation: Orientation

	// Margins
	margin_top: string
	margin_bottom: string
	margin_left: string
	margin_right: string

	// Font settings
	font_family: string
	font_size_body: string
	font_size_heading: string
	font_size_subheading: string

	// Color scheme
	primary_color: string
	secondary_color: string
	accent_color: string
	border_color: string

	// Page numbering
	page_numbering_enabled: boolean
	page_numbering_format: string
	page_numbering_position: PageNumberPosition

	// Signature section settings
	signature_section_enabled: boolean
	signature_labels: string[]
	signature_line_width: string

	// Status
	active: boolean

	// Metadata
	created_by: string | null
	updated_by: string | null
	created_at: string
	updated_at: string
}

// =============================================================================
// FORM DATA TYPE (for create/update operations)
// =============================================================================

export interface PdfSettingsFormData {
	institution_id?: string
	institution_code: string

	// Template identification
	template_name: string
	template_type?: TemplateType

	// WEF (With Effect From) - determines when this template becomes active
	wef_date?: string // ISO date string (YYYY-MM-DD)
	wef_time?: string // Time string (HH:mm)

	// Logo settings
	logo_url?: string
	logo_width?: string
	logo_height?: string
	logo_position?: LogoPosition

	// Secondary logo
	secondary_logo_url?: string
	secondary_logo_width?: string
	secondary_logo_height?: string

	// Header configuration
	header_html?: string
	header_height?: string
	header_background_color?: string

	// Footer configuration
	footer_html?: string
	footer_height?: string
	footer_background_color?: string

	// Watermark settings
	watermark_url?: string
	watermark_opacity?: number
	watermark_enabled?: boolean

	// Paper and layout
	paper_size?: PaperSize
	orientation?: Orientation

	// Margins
	margin_top?: string
	margin_bottom?: string
	margin_left?: string
	margin_right?: string

	// Font settings
	font_family?: string
	font_size_body?: string
	font_size_heading?: string
	font_size_subheading?: string

	// Colors
	primary_color?: string
	secondary_color?: string
	accent_color?: string
	border_color?: string

	// Page numbering
	page_numbering_enabled?: boolean
	page_numbering_format?: string
	page_numbering_position?: PageNumberPosition

	// Signature section
	signature_section_enabled?: boolean
	signature_labels?: string[]
	signature_line_width?: string

	// Status
	active?: boolean
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface PdfSettingsResponse {
	success: boolean
	data?: PdfInstitutionSettings
	error?: string
}

export interface PdfSettingsListResponse {
	success: boolean
	data?: PdfInstitutionSettings[]
	error?: string
}

// =============================================================================
// PREVIEW REQUEST TYPE
// =============================================================================

export interface PdfPreviewRequest {
	settings: Partial<PdfSettingsFormData>
	sample_data?: {
		institution_name?: string
		exam_name?: string
		student_name?: string
		register_number?: string
		[key: string]: string | undefined
	}
	template_type?: TemplateType
}

// =============================================================================
// CONFIGURATION TYPES FOR PDF GENERATION
// =============================================================================

export interface PdfGenerationConfig {
	// Resolved settings (placeholders replaced with actual values)
	header_html: string
	footer_html: string

	// Logo URLs
	logo_url: string | null
	secondary_logo_url: string | null

	// Watermark
	watermark_url: string | null
	watermark_opacity: number
	watermark_enabled: boolean

	// Paper settings
	paper_size: PaperSize
	orientation: Orientation

	// Margins (in numeric values for jsPDF)
	margins: {
		top: number
		bottom: number
		left: number
		right: number
	}

	// Font settings
	font_family: string
	font_sizes: {
		body: number
		heading: number
		subheading: number
	}

	// Colors (hex values)
	colors: {
		primary: string
		secondary: string
		accent: string
		border: string
	}

	// Page numbering
	page_numbering: {
		enabled: boolean
		format: string
		position: PageNumberPosition
	}

	// Signature section
	signature: {
		enabled: boolean
		labels: string[]
		line_width: number
	}
}

// =============================================================================
// IMPORT/EXPORT TYPES
// =============================================================================

export interface PdfSettingsImportError {
	row: number
	institution_code: string
	errors: string[]
}

export interface PdfSettingsUploadSummary {
	total: number
	success: number
	failed: number
}

// =============================================================================
// AUDIT LOG TYPE
// =============================================================================

export interface PdfSettingsAuditEntry {
	id: string
	settings_id: string
	user_id: string
	action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate'
	old_values: Partial<PdfInstitutionSettings> | null
	new_values: Partial<PdfInstitutionSettings> | null
	created_at: string
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_PDF_SETTINGS: PdfSettingsFormData = {
	institution_code: '',
	template_name: '',
	template_type: 'default',
	wef_date: new Date().toISOString().split('T')[0], // Today's date
	wef_time: '00:00',
	logo_url: '/jkkn_logo.png',
	logo_width: '60px',
	logo_height: '60px',
	logo_position: 'left',
	secondary_logo_url: '/jkkn_logo.png',
	secondary_logo_width: '60px',
	secondary_logo_height: '60px',
	header_height: '80px',
	header_background_color: '#ffffff',
	footer_height: '40px',
	footer_background_color: '#ffffff',
	watermark_opacity: 0.1,
	watermark_enabled: false,
	paper_size: 'A4',
	orientation: 'portrait',
	margin_top: '20mm',
	margin_bottom: '20mm',
	margin_left: '15mm',
	margin_right: '15mm',
	font_family: 'Times New Roman, serif',
	font_size_body: '11pt',
	font_size_heading: '14pt',
	font_size_subheading: '12pt',
	primary_color: '#1a365d',
	secondary_color: '#4a5568',
	accent_color: '#2b6cb0',
	border_color: '#e2e8f0',
	page_numbering_enabled: true,
	page_numbering_format: 'Page {page} of {total}',
	page_numbering_position: 'bottom-center',
	signature_section_enabled: true,
	signature_labels: ['Prepared by', 'Verified by', 'Controller of Examinations'],
	signature_line_width: '100px',
	active: true,
}

// =============================================================================
// HELPER FUNCTIONS FOR WEF (With Effect From) LOGIC
// =============================================================================

/**
 * Determines the WEF status of a template based on current date/time
 */
export function getWefStatus(wefDate: string, wefTime: string): WefStatus {
	const now = new Date()
	// Normalize wef_time: DB may store HH:mm:ss, trim to HH:mm for consistent parsing
	const normalizedTime = wefTime?.length > 5 ? wefTime.slice(0, 5) : wefTime
	const wefDateTime = new Date(`${wefDate}T${normalizedTime}:00`)

	if (wefDateTime <= now) {
		return 'active'
	}
	return 'scheduled'
}

/**
 * Checks if a template is currently active based on WEF date/time
 */
export function isTemplateActive(wefDate: string, wefTime: string): boolean {
	const normalizedTime = wefTime?.length > 5 ? wefTime.slice(0, 5) : wefTime
	const wefDateTime = new Date(`${normalizedTime ? `${wefDate}T${normalizedTime}:00` : wefDate}`)
	return wefDateTime <= new Date()
}

/**
 * Finds the most recent active template from a list of templates
 * Returns the template with the latest WEF that has already passed
 */
export function findActiveTemplate<T extends { wef_date: string; wef_time: string; active: boolean }>(
	templates: T[]
): T | null {
	const now = new Date()

	// Filter to only active templates whose WEF has passed
	const activeTemplates = templates.filter((t) => {
		if (!t.active) return false
		const normalizedTime = t.wef_time?.length > 5 ? t.wef_time.slice(0, 5) : t.wef_time
		const wefDateTime = new Date(`${t.wef_date}T${normalizedTime}:00`)
		return wefDateTime <= now
	})

	if (activeTemplates.length === 0) return null

	// Sort by WEF date/time descending and return the most recent
	return activeTemplates.sort((a, b) => {
		const aNormalizedTime = a.wef_time?.length > 5 ? a.wef_time.slice(0, 5) : a.wef_time
		const bNormalizedTime = b.wef_time?.length > 5 ? b.wef_time.slice(0, 5) : b.wef_time
		const aDateTime = new Date(`${a.wef_date}T${aNormalizedTime}:00`)
		const bDateTime = new Date(`${b.wef_date}T${bNormalizedTime}:00`)
		return bDateTime.getTime() - aDateTime.getTime()
	})[0]
}

// =============================================================================
// PAPER SIZE DIMENSIONS (in mm)
// =============================================================================

export const PAPER_DIMENSIONS: Record<
	PaperSize,
	{ portrait: { width: number; height: number }; landscape: { width: number; height: number } }
> = {
	A4: {
		portrait: { width: 210, height: 297 },
		landscape: { width: 297, height: 210 },
	},
	Letter: {
		portrait: { width: 215.9, height: 279.4 },
		landscape: { width: 279.4, height: 215.9 },
	},
	Legal: {
		portrait: { width: 215.9, height: 355.6 },
		landscape: { width: 355.6, height: 215.9 },
	},
}
