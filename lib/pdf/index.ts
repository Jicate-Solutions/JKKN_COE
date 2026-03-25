/**
 * PDF Library Exports
 *
 * Centralized exports for PDF generation utilities and settings management.
 */

// Settings Service (server-side)
export {
	getPdfSettings,
	getPdfSettingsWithFallback,
	getPdfGenerationConfig,
	getAllPdfSettingsForInstitution,
	hasPdfSettings,
	invalidatePdfSettingsCache,
} from './settings-service'

// React Hook (client-side)
export { usePdfSettings, usePdfSettingsForm } from './use-pdf-settings'

// Header/Footer Renderer
export {
	renderPdfHeader,
	renderPdfFooter,
	renderSignatureSection,
	getContentArea,
	applyInstitutionHeaderFooter,
	createInstitutionPdf,
} from './pdf-header-renderer'

// Re-export types
export type {
	PdfInstitutionSettings,
	PdfSettingsFormData,
	PdfGenerationConfig,
	PdfPreviewRequest,
	TemplateType,
	PaperSize,
	Orientation,
	PageNumberPosition,
} from '@/types/pdf-settings'

export { DEFAULT_PDF_SETTINGS, PAPER_DIMENSIONS, PDF_PLACEHOLDERS } from '@/types/pdf-settings'
