/**
 * PDF Header Renderer
 *
 * Utility functions for rendering institution-configured headers and footers
 * in jsPDF documents. Integrates with the pdf_institution_settings system.
 */

import jsPDF from 'jspdf'
import { getPdfGenerationConfig } from './settings-service'
import type { PdfGenerationConfig, TemplateType } from '@/types/pdf-settings'

// =============================================================================
// TYPES
// =============================================================================

export interface RenderHeaderOptions {
	doc: jsPDF
	institutionCode: string
	templateType?: TemplateType
	customData?: Record<string, string>
	pageWidth: number
	pageHeight: number
	startY?: number
}

export interface RenderFooterOptions {
	doc: jsPDF
	institutionCode: string
	templateType?: TemplateType
	customData?: Record<string, string>
	pageWidth: number
	pageHeight: number
	currentPage: number
	totalPages: number
}

export interface HeaderFooterResult {
	headerEndY: number
	footerStartY: number
	contentAreaHeight: number
}

// =============================================================================
// MAIN RENDER FUNCTIONS
// =============================================================================

/**
 * Render PDF header with institution settings
 *
 * @returns The Y position after the header (content start Y)
 */
export async function renderPdfHeader(options: RenderHeaderOptions): Promise<number> {
	const { doc, institutionCode, templateType = 'default', customData = {}, pageWidth, startY = 0 } = options

	// Get configuration
	const config = await getPdfGenerationConfig(institutionCode, templateType, customData)

	let currentY = startY + config.margins.top

	// Draw header background (if not white)
	// Note: header_background_color handling would require parsing from settings

	// Draw logos
	currentY = await drawLogos(doc, config, pageWidth, currentY)

	// Draw institution name and details
	currentY = drawInstitutionDetails(doc, config, customData, pageWidth, currentY)

	// Draw header bottom border
	drawHeaderBorder(doc, config, pageWidth, currentY)

	return currentY + 5 // Add some spacing after header
}

/**
 * Render PDF footer with institution settings
 */
export async function renderPdfFooter(options: RenderFooterOptions): Promise<void> {
	const {
		doc,
		institutionCode,
		templateType = 'default',
		customData = {},
		pageWidth,
		pageHeight,
		currentPage,
		totalPages,
	} = options

	// Get configuration
	const config = await getPdfGenerationConfig(institutionCode, templateType, {
		...customData,
		page_number: String(currentPage),
		total_pages: String(totalPages),
		page_number_text: config.page_numbering.format
			.replace('{page}', String(currentPage))
			.replace('{total}', String(totalPages)),
	})

	const footerY = pageHeight - config.margins.bottom

	// Draw footer top border
	drawFooterBorder(doc, config, pageWidth, footerY - 8)

	// Draw page numbers
	if (config.page_numbering.enabled) {
		drawPageNumbers(doc, config, pageWidth, footerY, currentPage, totalPages)
	}

	// Draw generation date
	drawGenerationDate(doc, config, pageWidth, footerY)
}

/**
 * Render signature section
 */
export async function renderSignatureSection(options: {
	doc: jsPDF
	institutionCode: string
	templateType?: TemplateType
	pageWidth: number
	pageHeight: number
}): Promise<void> {
	const { doc, institutionCode, templateType = 'default', pageWidth, pageHeight } = options

	const config = await getPdfGenerationConfig(institutionCode, templateType)

	if (!config.signature.enabled) return

	const signatureY = pageHeight - config.margins.bottom - 25
	const labels = config.signature.labels
	const spacing = (pageWidth - config.margins.left - config.margins.right) / (labels.length + 1)

	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.setTextColor(0, 0, 0)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)

	labels.forEach((label, index) => {
		const x = config.margins.left + spacing * (index + 1)
		doc.text(label, x, signatureY, { align: 'center' })
		doc.line(x - config.signature.line_width / 2, signatureY + 8, x + config.signature.line_width / 2, signatureY + 8)
	})
}

/**
 * Get usable content area dimensions after header/footer
 */
export async function getContentArea(
	institutionCode: string,
	templateType: TemplateType = 'default'
): Promise<{ top: number; bottom: number; left: number; right: number; height: number; width: number }> {
	const config = await getPdfGenerationConfig(institutionCode, templateType)

	// Estimate header height (this could be made more precise)
	const headerHeight = 35 // Approximate header height in mm
	const footerHeight = config.signature.enabled ? 35 : 15

	return {
		top: config.margins.top + headerHeight,
		bottom: config.margins.bottom + footerHeight,
		left: config.margins.left,
		right: config.margins.right,
		height: 297 - config.margins.top - headerHeight - config.margins.bottom - footerHeight, // A4 default
		width: 210 - config.margins.left - config.margins.right, // A4 default
	}
}

// =============================================================================
// HELPER DRAWING FUNCTIONS
// =============================================================================

async function drawLogos(doc: jsPDF, config: PdfGenerationConfig, pageWidth: number, startY: number): Promise<number> {
	// Left logo placeholder
	if (config.logo_url) {
		doc.setDrawColor(200, 200, 200)
		doc.setLineWidth(0.5)
		doc.rect(config.margins.left, startY, 15, 15)
		doc.setFontSize(6)
		doc.setTextColor(150, 150, 150)
		doc.text('LOGO', config.margins.left + 7.5, startY + 8, { align: 'center' })
	}

	// Right logo placeholder
	if (config.secondary_logo_url) {
		doc.setDrawColor(200, 200, 200)
		doc.rect(pageWidth - config.margins.right - 15, startY, 15, 15)
		doc.setFontSize(6)
		doc.setTextColor(150, 150, 150)
		doc.text('LOGO', pageWidth - config.margins.right - 7.5, startY + 8, { align: 'center' })
	}

	return startY
}

function drawInstitutionDetails(
	doc: jsPDF,
	config: PdfGenerationConfig,
	customData: Record<string, string>,
	pageWidth: number,
	startY: number
): number {
	const primaryColor = hexToRgb(config.colors.primary)
	const secondaryColor = hexToRgb(config.colors.secondary)

	// Institution name
	doc.setFont('times', 'bold')
	doc.setFontSize(config.font_sizes.heading)
	doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b)

	const institutionName = customData.institution_name || 'Institution Name'
	doc.text(institutionName.toUpperCase(), pageWidth / 2, startY + 6, { align: 'center' })

	// Accreditation text
	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b)

	const accreditation = customData.accreditation_text || ''
	if (accreditation) {
		doc.text(accreditation, pageWidth / 2, startY + 12, { align: 'center' })
	}

	// Address
	const address = customData.address || ''
	if (address) {
		doc.setFontSize(9)
		doc.text(address, pageWidth / 2, startY + 18, { align: 'center' })
	}

	return startY + 22
}

function drawHeaderBorder(doc: jsPDF, config: PdfGenerationConfig, pageWidth: number, y: number): void {
	const borderColor = hexToRgb(config.colors.border)
	doc.setDrawColor(borderColor.r, borderColor.g, borderColor.b)
	doc.setLineWidth(0.5)
	doc.line(config.margins.left, y, pageWidth - config.margins.right, y)
}

function drawFooterBorder(doc: jsPDF, config: PdfGenerationConfig, pageWidth: number, y: number): void {
	const borderColor = hexToRgb(config.colors.border)
	doc.setDrawColor(borderColor.r, borderColor.g, borderColor.b)
	doc.setLineWidth(0.3)
	doc.line(config.margins.left, y, pageWidth - config.margins.right, y)
}

function drawPageNumbers(
	doc: jsPDF,
	config: PdfGenerationConfig,
	pageWidth: number,
	footerY: number,
	currentPage: number,
	totalPages: number
): void {
	const pageText = config.page_numbering.format
		.replace('{page}', String(currentPage))
		.replace('{total}', String(totalPages))

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(100, 100, 100)

	let x = pageWidth / 2
	let align: 'center' | 'left' | 'right' = 'center'

	const position = config.page_numbering.position
	if (position.includes('left')) {
		x = config.margins.left
		align = 'left'
	} else if (position.includes('right')) {
		x = pageWidth - config.margins.right
		align = 'right'
	}

	doc.text(pageText, x, footerY, { align })
}

function drawGenerationDate(doc: jsPDF, config: PdfGenerationConfig, pageWidth: number, footerY: number): void {
	doc.setFontSize(8)
	doc.setTextColor(150, 150, 150)
	doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - config.margins.right, footerY, {
		align: 'right',
	})
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

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

// =============================================================================
// HIGH-LEVEL WRAPPER
// =============================================================================

/**
 * Apply institution header and footer to all pages of a jsPDF document
 */
export async function applyInstitutionHeaderFooter(
	doc: jsPDF,
	institutionCode: string,
	templateType: TemplateType = 'default',
	customData: Record<string, string> = {}
): Promise<void> {
	const totalPages = doc.getNumberOfPages()
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)

		// Draw footer with page numbers
		await renderPdfFooter({
			doc,
			institutionCode,
			templateType,
			customData,
			pageWidth,
			pageHeight,
			currentPage: i,
			totalPages,
		})

		// Draw signature section on last page only
		if (i === totalPages) {
			await renderSignatureSection({
				doc,
				institutionCode,
				templateType,
				pageWidth,
				pageHeight,
			})
		}
	}
}

/**
 * Create a new jsPDF document with institution settings applied
 */
export async function createInstitutionPdf(
	institutionCode: string,
	templateType: TemplateType = 'default'
): Promise<{ doc: jsPDF; config: PdfGenerationConfig; contentStartY: number }> {
	const config = await getPdfGenerationConfig(institutionCode, templateType)

	const doc = new jsPDF({
		orientation: config.orientation === 'landscape' ? 'l' : 'p',
		unit: 'mm',
		format: config.paper_size.toLowerCase() as any,
	})

	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	// Render header
	const contentStartY = await renderPdfHeader({
		doc,
		institutionCode,
		templateType,
		pageWidth,
		pageHeight,
	})

	return { doc, config, contentStartY }
}
