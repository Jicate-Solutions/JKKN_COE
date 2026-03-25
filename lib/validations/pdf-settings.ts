/**
 * PDF Settings Validation Schemas
 *
 * Zod schemas for validating PDF institution settings data.
 * Used in API routes and form validation.
 */

import { z } from 'zod'

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const PaperSizeSchema = z.enum(['A4', 'Letter', 'Legal'])
export const OrientationSchema = z.enum(['portrait', 'landscape'])
export const LogoPositionSchema = z.enum(['left', 'center', 'right'])
export const PageNumberPositionSchema = z.enum([
	'top-left',
	'top-center',
	'top-right',
	'bottom-left',
	'bottom-center',
	'bottom-right',
])
export const TemplateTypeSchema = z.enum([
	'default',
	'certificate',
	'hallticket',
	'marksheet',
	'report',
])

// =============================================================================
// HELPER SCHEMAS
// =============================================================================

// Date in ISO format (YYYY-MM-DD)
const IsoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

// Time in 24-hour format (HH:mm or HH:mm:ss from DB)
const TimeSchema = z
	.string()
	.transform((val) => (val && val.length > 5 ? val.slice(0, 5) : val))
	.pipe(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be a valid time in HH:mm format'))

// CSS dimension value (e.g., "20px", "15mm", "1in")
const CssDimensionSchema = z
	.string()
	.regex(
		/^\d+(\.\d+)?(px|mm|cm|in|pt|%)$/,
		'Must be a valid CSS dimension (e.g., "20px", "15mm", "1in")'
	)

// Hex color value
const HexColorSchema = z
	.string()
	.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color (e.g., "#1a365d")')

// Font size (e.g., "11pt", "12px")
const FontSizeSchema = z
	.string()
	.regex(/^\d+(\.\d+)?(pt|px|em|rem)$/, 'Must be a valid font size (e.g., "11pt", "12px")')

// URL, relative path, or empty string
const OptionalUrlSchema = z
	.string()
	.refine(
		(val) => {
			if (!val || val === '') return true
			// Allow relative paths starting with /
			if (val.startsWith('/')) return true
			// Allow full URLs
			try {
				new URL(val)
				return true
			} catch {
				return false
			}
		},
		{ message: 'Must be a valid URL or relative path (e.g., /logo.png or https://example.com/logo.png)' }
	)
	.or(z.literal(''))
	.nullable()
	.optional()

// =============================================================================
// MAIN VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema for creating PDF settings
 */
export const CreatePdfSettingsSchema = z.object({
	institution_id: z.string().uuid().optional().nullable(),
	institution_code: z
		.string()
		.min(1, 'Institution code is required')
		.max(50, 'Institution code must be at most 50 characters'),

	// Template identification (allows multiple records with same template_type)
	template_name: z
		.string()
		.min(1, 'Template name is required')
		.max(100, 'Template name must be at most 100 characters'),
	template_type: TemplateTypeSchema.optional().default('default'),

	// WEF (With Effect From) - determines when this template becomes active
	wef_date: IsoDateSchema.optional().default(() => new Date().toISOString().split('T')[0]),
	wef_time: TimeSchema.optional().default('00:00'),

	// Logo settings
	logo_url: OptionalUrlSchema,
	logo_width: CssDimensionSchema.optional().default('60px'),
	logo_height: CssDimensionSchema.optional().default('60px'),
	logo_position: LogoPositionSchema.optional().default('left'),

	// Secondary logo
	secondary_logo_url: OptionalUrlSchema,
	secondary_logo_width: CssDimensionSchema.optional().default('60px'),
	secondary_logo_height: CssDimensionSchema.optional().default('60px'),

	// Header configuration
	header_html: z
		.string()
		.max(10000, 'Header HTML must be at most 10000 characters')
		.optional()
		.nullable(),
	header_height: CssDimensionSchema.optional().default('80px'),
	header_background_color: HexColorSchema.optional().default('#ffffff'),

	// Footer configuration
	footer_html: z
		.string()
		.max(10000, 'Footer HTML must be at most 10000 characters')
		.optional()
		.nullable(),
	footer_height: CssDimensionSchema.optional().default('40px'),
	footer_background_color: HexColorSchema.optional().default('#ffffff'),

	// Watermark settings
	watermark_url: OptionalUrlSchema,
	watermark_opacity: z.coerce
		.number()
		.min(0, 'Watermark opacity must be at least 0')
		.max(1, 'Watermark opacity must be at most 1')
		.optional()
		.default(0.1),
	watermark_enabled: z.boolean().optional().default(false),

	// Paper and layout settings
	paper_size: PaperSizeSchema.optional().default('A4'),
	orientation: OrientationSchema.optional().default('portrait'),

	// Margins
	margin_top: CssDimensionSchema.optional().default('20mm'),
	margin_bottom: CssDimensionSchema.optional().default('20mm'),
	margin_left: CssDimensionSchema.optional().default('15mm'),
	margin_right: CssDimensionSchema.optional().default('15mm'),

	// Font settings
	font_family: z
		.string()
		.max(100, 'Font family must be at most 100 characters')
		.optional()
		.default('Times New Roman, serif'),
	font_size_body: FontSizeSchema.optional().default('11pt'),
	font_size_heading: FontSizeSchema.optional().default('14pt'),
	font_size_subheading: FontSizeSchema.optional().default('12pt'),

	// Color scheme
	primary_color: HexColorSchema.optional().default('#1a365d'),
	secondary_color: HexColorSchema.optional().default('#4a5568'),
	accent_color: HexColorSchema.optional().default('#2b6cb0'),
	border_color: HexColorSchema.optional().default('#e2e8f0'),

	// Page numbering
	page_numbering_enabled: z.boolean().optional().default(true),
	page_numbering_format: z
		.string()
		.max(50, 'Page numbering format must be at most 50 characters')
		.optional()
		.default('Page {page} of {total}'),
	page_numbering_position: PageNumberPositionSchema.optional().default('bottom-center'),

	// Signature section settings
	signature_section_enabled: z.boolean().optional().default(true),
	signature_labels: z
		.array(z.string().max(100))
		.max(10, 'Maximum 10 signature labels allowed')
		.optional()
		.default(['Prepared by', 'Verified by', 'Controller of Examinations']),
	signature_line_width: CssDimensionSchema.optional().default('100px'),

	// Status
	active: z.boolean().optional().default(true),
})

/**
 * Schema for updating PDF settings (all fields optional except id)
 */
export const UpdatePdfSettingsSchema = z.object({
	id: z.string().uuid('Invalid settings ID'),

	institution_id: z.string().uuid().optional().nullable(),
	institution_code: z
		.string()
		.min(1, 'Institution code is required')
		.max(50, 'Institution code must be at most 50 characters')
		.optional(),

	// Template identification
	template_name: z.string().min(1).max(100).optional(),
	template_type: TemplateTypeSchema.optional(),

	// WEF (With Effect From)
	wef_date: IsoDateSchema.optional(),
	wef_time: TimeSchema.optional(),

	// Logo settings
	logo_url: OptionalUrlSchema,
	logo_width: CssDimensionSchema.optional(),
	logo_height: CssDimensionSchema.optional(),
	logo_position: LogoPositionSchema.optional(),

	// Secondary logo
	secondary_logo_url: OptionalUrlSchema,
	secondary_logo_width: CssDimensionSchema.optional(),
	secondary_logo_height: CssDimensionSchema.optional(),

	// Header configuration
	header_html: z.string().max(10000).optional().nullable(),
	header_height: CssDimensionSchema.optional(),
	header_background_color: HexColorSchema.optional(),

	// Footer configuration
	footer_html: z.string().max(10000).optional().nullable(),
	footer_height: CssDimensionSchema.optional(),
	footer_background_color: HexColorSchema.optional(),

	// Watermark settings
	watermark_url: OptionalUrlSchema,
	watermark_opacity: z.coerce.number().min(0).max(1).optional(),
	watermark_enabled: z.boolean().optional(),

	// Paper and layout settings
	paper_size: PaperSizeSchema.optional(),
	orientation: OrientationSchema.optional(),

	// Margins
	margin_top: CssDimensionSchema.optional(),
	margin_bottom: CssDimensionSchema.optional(),
	margin_left: CssDimensionSchema.optional(),
	margin_right: CssDimensionSchema.optional(),

	// Font settings
	font_family: z.string().max(100).optional(),
	font_size_body: FontSizeSchema.optional(),
	font_size_heading: FontSizeSchema.optional(),
	font_size_subheading: FontSizeSchema.optional(),

	// Color scheme
	primary_color: HexColorSchema.optional(),
	secondary_color: HexColorSchema.optional(),
	accent_color: HexColorSchema.optional(),
	border_color: HexColorSchema.optional(),

	// Page numbering
	page_numbering_enabled: z.boolean().optional(),
	page_numbering_format: z.string().max(50).optional(),
	page_numbering_position: PageNumberPositionSchema.optional(),

	// Signature section settings
	signature_section_enabled: z.boolean().optional(),
	signature_labels: z.array(z.string().max(100)).max(10).optional(),
	signature_line_width: CssDimensionSchema.optional(),

	// Status
	active: z.boolean().optional(),
})

/**
 * Schema for preview request - more lenient to allow preview with incomplete data
 */
export const PdfPreviewRequestSchema = z.object({
	settings: z.object({
		institution_id: z.string().uuid().optional().nullable(),
		institution_code: z.string().optional().default(''),

		// Template identification
		template_name: z.string().optional().default(''),
		template_type: TemplateTypeSchema.optional().default('default'),

		// WEF (With Effect From)
		wef_date: z.string().optional().default(() => new Date().toISOString().split('T')[0]),
		wef_time: z.string().optional().default('00:00'),

		// Logo settings - accept any string for preview
		logo_url: z.string().optional().nullable(),
		logo_width: z.string().optional().default('60px'),
		logo_height: z.string().optional().default('60px'),
		logo_position: z.string().optional().default('left'),

		// Secondary logo
		secondary_logo_url: z.string().optional().nullable(),
		secondary_logo_width: z.string().optional().default('60px'),
		secondary_logo_height: z.string().optional().default('60px'),

		// Header configuration
		header_html: z.string().optional().nullable(),
		header_height: z.string().optional().default('80px'),
		header_background_color: z.string().optional().default('#ffffff'),

		// Footer configuration
		footer_html: z.string().optional().nullable(),
		footer_height: z.string().optional().default('40px'),
		footer_background_color: z.string().optional().default('#ffffff'),

		// Watermark settings
		watermark_url: z.string().optional().nullable(),
		watermark_opacity: z.number().optional().default(0.1),
		watermark_enabled: z.boolean().optional().default(false),

		// Paper and layout settings
		paper_size: PaperSizeSchema.optional().default('A4'),
		orientation: OrientationSchema.optional().default('portrait'),

		// Margins
		margin_top: z.string().optional().default('20mm'),
		margin_bottom: z.string().optional().default('20mm'),
		margin_left: z.string().optional().default('15mm'),
		margin_right: z.string().optional().default('15mm'),

		// Font settings
		font_family: z.string().optional().default('Times New Roman, serif'),
		font_size_body: z.string().optional().default('11pt'),
		font_size_heading: z.string().optional().default('14pt'),
		font_size_subheading: z.string().optional().default('12pt'),

		// Color scheme - accept any string for preview (will fallback to defaults if invalid)
		primary_color: z.string().optional().default('#1a365d'),
		secondary_color: z.string().optional().default('#4a5568'),
		accent_color: z.string().optional().default('#2b6cb0'),
		border_color: z.string().optional().default('#e2e8f0'),

		// Page numbering
		page_numbering_enabled: z.boolean().optional().default(true),
		page_numbering_format: z.string().optional().default('Page {page} of {total}'),
		page_numbering_position: PageNumberPositionSchema.optional().default('bottom-center'),

		// Signature section settings
		signature_section_enabled: z.boolean().optional().default(true),
		signature_labels: z.array(z.string()).optional().default(['Prepared by', 'Verified by', 'Controller of Examinations']),
		signature_line_width: z.string().optional().default('100px'),

		// Status
		active: z.boolean().optional().default(true),
	}).partial(),
	sample_data: z
		.record(z.string(), z.string().optional())
		.optional()
		.default({
			institution_name: 'Sample Institution',
			exam_name: 'End Semester Examination - December 2025',
			student_name: 'John Doe',
			register_number: '12345678',
		}),
	template_type: TemplateTypeSchema.optional().default('default'),
})

/**
 * Schema for fetching settings by institution code
 * Can optionally filter by template_name or template_type
 */
export const GetPdfSettingsSchema = z.object({
	institution_code: z.string().min(1, 'Institution code is required'),
	template_name: z.string().optional(), // Resolve by template_name (preferred)
	template_type: TemplateTypeSchema.optional(), // Fallback to template_type
})

// =============================================================================
// TYPE INFERENCE
// =============================================================================

export type CreatePdfSettingsInput = z.infer<typeof CreatePdfSettingsSchema>
export type UpdatePdfSettingsInput = z.infer<typeof UpdatePdfSettingsSchema>
export type PdfPreviewRequestInput = z.infer<typeof PdfPreviewRequestSchema>
export type GetPdfSettingsInput = z.infer<typeof GetPdfSettingsSchema>

// =============================================================================
// VALIDATION HELPER FUNCTIONS
// =============================================================================

/**
 * Validate create PDF settings data
 */
export function validateCreatePdfSettings(data: unknown) {
	return CreatePdfSettingsSchema.safeParse(data)
}

/**
 * Validate update PDF settings data
 */
export function validateUpdatePdfSettings(data: unknown) {
	return UpdatePdfSettingsSchema.safeParse(data)
}

/**
 * Validate preview request data
 */
export function validatePdfPreviewRequest(data: unknown) {
	return PdfPreviewRequestSchema.safeParse(data)
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * NOTE: For production, use a library like DOMPurify on the server side
 */
export function sanitizeHtml(html: string | null | undefined): string | null {
	if (!html) return null

	// Basic sanitization - remove script tags and event handlers
	// For production, use DOMPurify or similar library
	let sanitized = html
		// Remove script tags
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		// Remove event handlers
		.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
		// Remove javascript: URLs
		.replace(/javascript:/gi, '')
		// Remove data: URLs (potential XSS vector)
		.replace(/data:/gi, '')

	return sanitized
}

/**
 * Validate and sanitize HTML fields in settings
 */
export function sanitizePdfSettingsHtml<T extends { header_html?: string | null; footer_html?: string | null }>(
	settings: T
): T {
	const result = { ...settings }
	// Only sanitize HTML fields if they are explicitly present in the input
	// This prevents adding header_html: null to partial update payloads
	if ('header_html' in settings) {
		result.header_html = sanitizeHtml(settings.header_html)
	}
	if ('footer_html' in settings) {
		result.footer_html = sanitizeHtml(settings.footer_html)
	}
	return result
}
