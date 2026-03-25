/**
 * PDF Settings Preview API Route
 *
 * POST /api/pdf-settings/preview
 *
 * Generates a preview PDF using current (unsaved or saved) header configuration.
 * Returns a base64-encoded PDF or data URI for preview purposes.
 */

import { NextResponse, NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { validatePdfPreviewRequest, sanitizePdfSettingsHtml } from '@/lib/validations/pdf-settings'
import jsPDF from 'jspdf'
import {
	DEFAULT_PDF_SETTINGS,
	PAPER_DIMENSIONS,
	type PdfInstitutionSettings,
	type PaperSize,
	type Orientation,
} from '@/types/pdf-settings'

// =============================================================================
// POST: Generate preview PDF
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()

		// Validate input
		const validation = validatePdfPreviewRequest(body)
		if (!validation.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					details: validation.error.errors.map((e) => ({
						field: e.path.join('.'),
						message: e.message,
					})),
				},
				{ status: 400 }
			)
		}

		const { settings, sample_data, template_type } = validation.data

		// Sanitize HTML content
		const sanitizedSettings = sanitizePdfSettingsHtml(settings)

		// Merge with defaults
		const finalSettings = {
			...DEFAULT_PDF_SETTINGS,
			...sanitizedSettings,
		}

		// Fetch institution data if institution_code is provided
		let institutionData: any = null
		if (finalSettings.institution_code) {
			const supabase = getSupabaseServer()
			const { data } = await supabase
				.from('institutions')
				.select('name')
				.eq('institution_code', finalSettings.institution_code)
				.single()
			institutionData = data
		}

		// Generate preview PDF
		const pdfDataUri = await generatePreviewPdf(finalSettings, sample_data || {}, institutionData)

		return NextResponse.json({
			success: true,
			preview_url: pdfDataUri,
			settings_used: finalSettings,
		})
	} catch (error) {
		console.error('PDF preview generation error:', error)
		return NextResponse.json({ error: 'Failed to generate preview PDF' }, { status: 500 })
	}
}

// =============================================================================
// PDF GENERATION LOGIC
// =============================================================================

async function generatePreviewPdf(
	settings: typeof DEFAULT_PDF_SETTINGS,
	sampleData: Record<string, string | undefined>,
	institutionData: any
): Promise<string> {
	// Determine paper dimensions
	const paperSize = (settings.paper_size || 'A4') as PaperSize
	const orientation = (settings.orientation || 'portrait') as Orientation
	const dimensions = PAPER_DIMENSIONS[paperSize][orientation]

	// Create PDF document
	const doc = new jsPDF({
		orientation: orientation === 'portrait' ? 'p' : 'l',
		unit: 'mm',
		format: paperSize.toLowerCase() as any,
	})

	const pageWidth = dimensions.width
	const pageHeight = dimensions.height

	// Parse margins
	const margins = {
		top: parseDimension(settings.margin_top || '20mm'),
		bottom: parseDimension(settings.margin_bottom || '20mm'),
		left: parseDimension(settings.margin_left || '15mm'),
		right: parseDimension(settings.margin_right || '15mm'),
	}

	const contentWidth = pageWidth - margins.left - margins.right

	// Replace placeholders in sample data
	const placeholders = {
		institution_name: institutionData?.name || sampleData.institution_name || 'Sample Institution',
		institution_code: settings.institution_code || 'SAMPLE',
		exam_name: sampleData.exam_name || 'End Semester Examination - December 2025',
		student_name: sampleData.student_name || 'John Doe',
		register_number: sampleData.register_number || '12345678',
		date: new Date().toLocaleDateString('en-IN', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		}),
		page_number: '1',
		total_pages: '1',
		generation_date: new Date().toLocaleString('en-IN'),
		accreditation_text: 'Accredited by NAAC',
		address: 'Sample Address, City, State',
		logo_url: settings.logo_url || '',
		logo_width: settings.logo_width || '60px',
		logo_height: settings.logo_height || '60px',
		secondary_logo_url: settings.secondary_logo_url || '',
		secondary_logo_width: settings.secondary_logo_width || '60px',
		secondary_logo_height: settings.secondary_logo_height || '60px',
		primary_color: settings.primary_color || '#1a365d',
		secondary_color: settings.secondary_color || '#4a5568',
		accent_color: settings.accent_color || '#2b6cb0',
		border_color: settings.border_color || '#e2e8f0',
		font_family: settings.font_family || 'Times New Roman, serif',
		font_size_body: settings.font_size_body || '11pt',
		font_size_heading: settings.font_size_heading || '14pt',
		font_size_subheading: settings.font_size_subheading || '12pt',
	}

	let currentY = margins.top

	// === DRAW HEADER ===
	currentY = drawHeader(doc, settings, placeholders, margins, pageWidth, currentY)

	// === DRAW SAMPLE CONTENT ===
	currentY = drawSampleContent(doc, settings, placeholders, margins, pageWidth, contentWidth, currentY)

	// === DRAW WATERMARK (if enabled) ===
	if (settings.watermark_enabled && settings.watermark_url) {
		drawWatermark(doc, settings, pageWidth, pageHeight)
	}

	// === DRAW FOOTER ===
	drawFooter(doc, settings, placeholders, margins, pageWidth, pageHeight)

	// === DRAW SIGNATURE SECTION (if enabled) ===
	if (settings.signature_section_enabled) {
		drawSignatureSection(doc, settings, margins, pageWidth, pageHeight)
	}

	// Return as data URI
	return doc.output('datauristring')
}

// =============================================================================
// DRAWING FUNCTIONS
// =============================================================================

function drawHeader(
	doc: jsPDF,
	settings: typeof DEFAULT_PDF_SETTINGS,
	placeholders: Record<string, string>,
	margins: { top: number; left: number; right: number },
	pageWidth: number,
	startY: number
): number {
	let currentY = startY

	// Draw header background
	const headerHeight = parseDimension(settings.header_height || '80px')
	const headerBgColor = settings.header_background_color || '#ffffff'
	if (headerBgColor !== '#ffffff') {
		doc.setFillColor(headerBgColor)
		doc.rect(margins.left, currentY, pageWidth - margins.left - margins.right, headerHeight, 'F')
	}

	// Draw logo (if available)
	const logoWidth = parseDimension(settings.logo_width || '60px') / 4 // Convert px to mm approx
	const logoHeight = parseDimension(settings.logo_height || '60px') / 4

	if (settings.logo_url && settings.logo_position === 'left') {
		// Logo placeholder box
		doc.setDrawColor(200, 200, 200)
		doc.setLineWidth(0.5)
		doc.rect(margins.left, currentY, logoWidth, logoHeight)
		doc.setFontSize(6)
		doc.text('LOGO', margins.left + logoWidth / 2, currentY + logoHeight / 2, { align: 'center' })
	}

	// Draw institution name and details (centered)
	const primaryColor = hexToRgb(placeholders.primary_color)
	const secondaryColor = hexToRgb(placeholders.secondary_color)

	doc.setFont('times', 'bold')
	doc.setFontSize(14)
	doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b)
	doc.text(placeholders.institution_name.toUpperCase(), pageWidth / 2, currentY + 8, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b)
	doc.text(placeholders.accreditation_text, pageWidth / 2, currentY + 14, { align: 'center' })

	doc.setFontSize(9)
	doc.text(placeholders.address, pageWidth / 2, currentY + 20, { align: 'center' })

	// Draw secondary logo (right side)
	if (settings.secondary_logo_url) {
		const secLogoWidth = parseDimension(settings.secondary_logo_width || '60px') / 4
		const secLogoHeight = parseDimension(settings.secondary_logo_height || '60px') / 4
		doc.setDrawColor(200, 200, 200)
		doc.rect(pageWidth - margins.right - secLogoWidth, currentY, secLogoWidth, secLogoHeight)
		doc.setFontSize(6)
		doc.text('LOGO', pageWidth - margins.right - secLogoWidth / 2, currentY + secLogoHeight / 2, {
			align: 'center',
		})
	}

	// Draw header bottom border
	const borderColor = hexToRgb(placeholders.border_color)
	doc.setDrawColor(borderColor.r, borderColor.g, borderColor.b)
	doc.setLineWidth(0.5)
	doc.line(margins.left, currentY + headerHeight / 3, pageWidth - margins.right, currentY + headerHeight / 3)

	return currentY + headerHeight / 3 + 5
}

function drawSampleContent(
	doc: jsPDF,
	settings: typeof DEFAULT_PDF_SETTINGS,
	placeholders: Record<string, string>,
	margins: { top: number; left: number; right: number; bottom: number },
	pageWidth: number,
	contentWidth: number,
	startY: number
): number {
	let currentY = startY

	const primaryColor = hexToRgb(placeholders.primary_color)
	const secondaryColor = hexToRgb(placeholders.secondary_color)

	// Examination title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b)
	doc.text(placeholders.exam_name.toUpperCase(), pageWidth / 2, currentY + 8, { align: 'center' })

	currentY += 16

	// Sample table/content placeholder
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)
	doc.text('PREVIEW - Sample Content Area', pageWidth / 2, currentY, { align: 'center' })

	currentY += 10

	// Draw sample data box
	doc.setDrawColor(200, 200, 200)
	doc.setFillColor(248, 250, 252)
	doc.roundedRect(margins.left + 20, currentY, contentWidth - 40, 50, 3, 3, 'FD')

	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b)

	const sampleText = [
		`Student Name: ${placeholders.student_name}`,
		`Register Number: ${placeholders.register_number}`,
		`Institution: ${placeholders.institution_name}`,
		`Generated on: ${placeholders.generation_date}`,
	]

	let textY = currentY + 12
	sampleText.forEach((text) => {
		doc.text(text, pageWidth / 2, textY, { align: 'center' })
		textY += 8
	})

	currentY += 60

	// Note about preview
	doc.setFontSize(8)
	doc.setTextColor(150, 150, 150)
	doc.text(
		'This is a preview of your PDF header configuration. Actual content will vary based on the document type.',
		pageWidth / 2,
		currentY,
		{ align: 'center' }
	)

	return currentY + 10
}

function drawWatermark(doc: jsPDF, settings: typeof DEFAULT_PDF_SETTINGS, pageWidth: number, pageHeight: number) {
	// In a real implementation, this would load and draw the watermark image
	// For preview, we'll draw a placeholder
	const opacity = settings.watermark_opacity || 0.1

	doc.setGState(new (doc as any).GState({ opacity }))
	doc.setFontSize(60)
	doc.setTextColor(200, 200, 200)

	// Rotate and draw watermark text diagonally
	doc.text('WATERMARK', pageWidth / 2, pageHeight / 2, {
		align: 'center',
		angle: 45,
	})

	// Reset opacity
	doc.setGState(new (doc as any).GState({ opacity: 1 }))
}

function drawFooter(
	doc: jsPDF,
	settings: typeof DEFAULT_PDF_SETTINGS,
	placeholders: Record<string, string>,
	margins: { left: number; right: number; bottom: number },
	pageWidth: number,
	pageHeight: number
) {
	const footerY = pageHeight - margins.bottom

	// Draw footer top border
	const borderColor = hexToRgb(placeholders.border_color)
	doc.setDrawColor(borderColor.r, borderColor.g, borderColor.b)
	doc.setLineWidth(0.3)
	doc.line(margins.left, footerY - 8, pageWidth - margins.right, footerY - 8)

	// Page numbering
	if (settings.page_numbering_enabled) {
		const format = settings.page_numbering_format || 'Page {page} of {total}'
		const pageText = format.replace('{page}', placeholders.page_number).replace('{total}', placeholders.total_pages)

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setTextColor(100, 100, 100)

		const position = settings.page_numbering_position || 'bottom-center'
		let x = pageWidth / 2
		let align: 'center' | 'left' | 'right' = 'center'

		if (position.includes('left')) {
			x = margins.left
			align = 'left'
		} else if (position.includes('right')) {
			x = pageWidth - margins.right
			align = 'right'
		}

		doc.text(pageText, x, footerY, { align })
	}

	// Generation date
	doc.setFontSize(8)
	doc.setTextColor(150, 150, 150)
	doc.text(`Generated: ${placeholders.generation_date}`, pageWidth - margins.right, footerY, { align: 'right' })
}

function drawSignatureSection(
	doc: jsPDF,
	settings: typeof DEFAULT_PDF_SETTINGS,
	margins: { left: number; right: number; bottom: number },
	pageWidth: number,
	pageHeight: number
) {
	const labels = settings.signature_labels || ['Prepared by', 'Verified by', 'Controller of Examinations']
	const lineWidth = parseDimension(settings.signature_line_width || '100px') / 4

	const signatureY = pageHeight - margins.bottom - 25
	const spacing = (pageWidth - margins.left - margins.right) / (labels.length + 1)

	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.setTextColor(0, 0, 0)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)

	labels.forEach((label, index) => {
		const x = margins.left + spacing * (index + 1)
		doc.text(label, x, signatureY, { align: 'center' })
		doc.line(x - lineWidth / 2, signatureY + 8, x + lineWidth / 2, signatureY + 8)
	})
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function parseDimension(value: string): number {
	const match = value.match(/^(\d+(?:\.\d+)?)(px|mm|cm|in|pt|%)$/)
	if (!match) return 20 // Default fallback

	const num = parseFloat(match[1])
	const unit = match[2]

	switch (unit) {
		case 'px':
			return num * 0.264583 // px to mm
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
			}
		: { r: 0, g: 0, b: 0 }
}
