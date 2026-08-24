import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getInstitutionHeader } from './institution-header'

/**
 * Generate Student Profile PDF
 *
 * Reproduces the CoE "STUDENT PROFILE" form: institution letterhead, the
 * OFFICE OF THE CONTROLLER OF EXAMINATIONS / STUDENT PROFILE titles, a
 * thirteen-row detail table with a photo cell, and the three signature lines.
 *
 * Landscape A4 with TWO profiles side by side per sheet, so a class set is half
 * the paper. Each card is self-contained — letterhead, title and signatures —
 * so a sheet can be guillotined down the middle and handed out.
 *
 * Fields MyJKKN holds (name, gender, parents, DoB, roll number, mobile) are
 * pre-printed for the learner to verify; the ones it does not hold (Tamil name,
 * UMIS No., Aadhaar No., name as per Aadhaar, ABC ID, signature) are left ruled
 * and blank to be filled by hand.
 *
 * Header text, logo and address come from `institution-header.ts`, keyed by
 * institution_code, so each college prints on its own letterhead.
 */

const MARGIN = 6.35
const CARD_GUTTER = 6
const CARDS_PER_PAGE = 2

// Fixed bands measured from the top of a card. Institutions have different
// numbers of letterhead lines (CET carries an autonomy line and a trust line,
// CAS does not), so laying each band out at a constant offset keeps the two
// cards on a sheet in step — the rules, the table and the signatures line up
// straight across regardless of whose letterhead is on which side.
const LETTERHEAD_RULE_Y = 26
const TITLES_Y = 31
const TABLE_TOP_Y = 43
const SIGNATURE_BOTTOM_GAP = 6
// Row 13 is signed by hand on the printed form, so it is given real writing
// space instead of the one-line height the other rows use.
const SIGNATURE_ROW_HEIGHT = 16
// Clear space wanted between the bottom of the table and the three signature
// labels, so the class incharge, HoD and Principal have somewhere to actually
// sign. The row heights below are sized to leave this much room; the card warns
// if a later font or height change eats into it.
const SIGNATURE_SPACE = 18
const PHOTO_ROW_HEIGHT = 17
const DETAIL_ROW_HEIGHT = 7.8

export interface LearnerProfilePdfRow {
	learner_name?: string
	gender?: string
	father_name?: string
	mother_name?: string
	date_of_birth?: string
	register_number?: string
	roll_number?: string
	phone?: string
	program_code?: string
	program_name?: string
	current_semester?: number | null
	institution_code?: string
	/** Base64 data URL; a plain remote URL will not embed. */
	student_photo_url?: string
}

export interface LearnerProfilePdfData {
	learners: LearnerProfilePdfRow[]
	/** Base64 data URLs for the letterhead logos. */
	logoImage?: string | null
	/** Institution logo, right side. Keyed per card by institution_code. */
	institutionLogos?: Record<string, string>
}

/** The thirteen rows of the form, in the order the printed original uses. */
const FIELDS: { label: string; value: (l: LearnerProfilePdfRow) => string }[] = [
	{ label: 'Name (As per 10th mark sheet)\n(In Capital Letters)', value: l => (l.learner_name || '').toUpperCase() },
	// The printed original shows a Tamil example here. jsPDF's built-in Times is
	// a Latin-1 font with no Tamil glyphs, so reproducing it would emit mojibake —
	// the instruction is given in Latin script instead.
	{ label: 'Tamil Name (As per 10th mark sheet)\n(Write in Tamil, e.g. S. Priya)', value: () => '' },
	{ label: 'Gender', value: l => l.gender || '' },
	{ label: 'Father name', value: l => l.father_name || '' },
	{ label: 'Mother name', value: l => l.mother_name || '' },
	{ label: 'DoB (DD/MM/YYYY)', value: l => formatDob(l.date_of_birth) },
	{ label: 'Roll Number', value: l => l.register_number || l.roll_number || '' },
	{ label: 'UMIS No.', value: () => '' },
	{ label: 'Aadhaar No', value: () => '' },
	{ label: 'Name (As per Aadhaar)', value: () => '' },
	{ label: 'Appar ID/ABC ID', value: () => '' },
	{ label: 'Mobile No (linked in aadhar)', value: l => l.phone || '' },
	{ label: 'Student signature', value: () => '' },
]

const SIGNATURES = [
	'Signature of the class incharge',
	'Signature of the HoD',
	'Signature of the Principal',
]

export function generateLearnerProfilePDF(data: LearnerProfilePdfData): void {
	const doc = buildDocument(data)
	const stamp = new Date().toISOString().split('T')[0]
	doc.save(`student_profile_${stamp}.pdf`)
}

export function generateLearnerProfilePDFBlob(data: LearnerProfilePdfData): Blob {
	return buildDocument(data).output('blob')
}

function buildDocument(data: LearnerProfilePdfData): jsPDF {
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	const cardWidth = (pageWidth - 2 * MARGIN - CARD_GUTTER) / CARDS_PER_PAGE
	const cardHeight = pageHeight - 2 * MARGIN

	const learners = data.learners.length > 0 ? data.learners : [{}]

	learners.forEach((learner, index) => {
		const slot = index % CARDS_PER_PAGE
		if (index > 0 && slot === 0) doc.addPage()

		const cardX = MARGIN + slot * (cardWidth + CARD_GUTTER)
		drawCard(doc, data, learner, cardX, MARGIN, cardWidth, cardHeight)
	})

	stampFooters(doc, pageWidth, pageHeight)
	return doc
}

// ========================================================================
// ONE PROFILE CARD
// ========================================================================

function drawCard(
	doc: jsPDF,
	data: LearnerProfilePdfData,
	learner: LearnerProfilePdfRow,
	cardX: number,
	cardY: number,
	cardWidth: number,
	cardHeight: number
) {
	const pad = 3
	const contentX = cardX + pad
	const contentWidth = cardWidth - 2 * pad
	const centerX = cardX + cardWidth / 2

	// Card outline — the cut line for splitting a sheet into two forms.
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.5)
	doc.rect(cardX, cardY, cardWidth, cardHeight)

	drawLetterhead(doc, data, learner, contentX, cardY + pad + 2, contentWidth, centerX, cardY + LETTERHEAD_RULE_Y)
	drawTitles(doc, learner, cardY + TITLES_Y, contentWidth, centerX)
	const tableEndY = drawDetailTable(doc, learner, contentX, cardY + TABLE_TOP_Y, contentWidth)

	// Labels sit at the foot of the card; the gap above them is the signing area.
	const signatureY = cardY + cardHeight - SIGNATURE_BOTTOM_GAP
	if (signatureY - tableEndY < SIGNATURE_SPACE) {
		console.warn(
			`[Student Profile] Only ${(signatureY - tableEndY).toFixed(1)}mm left to sign in ` +
			`(want ${SIGNATURE_SPACE}mm) — shorten the detail rows.`
		)
	}
	drawSignatures(doc, contentX, signatureY, contentWidth)
}

function drawLetterhead(
	doc: jsPDF,
	data: LearnerProfilePdfData,
	learner: LearnerProfilePdfRow,
	contentX: number,
	startY: number,
	contentWidth: number,
	centerX: number,
	ruleY: number
) {
	const header = getInstitutionHeader(learner.institution_code)
	const logoSize = 13
	// Text is inset past both logos so a long institution name wraps instead of
	// running underneath them.
	const textWidth = contentWidth - 2 * (logoSize + 2)
	let y = startY

	if (data.logoImage) {
		try {
			doc.addImage(data.logoImage, 'PNG', contentX, y, logoSize, logoSize, 'profile-logo-left')
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	const institutionLogo = learner.institution_code
		? data.institutionLogos?.[learner.institution_code]
		: undefined
	if (institutionLogo) {
		try {
			doc.addImage(
				institutionLogo, 'PNG',
				contentX + contentWidth - logoSize, y, logoSize, logoSize,
				`profile-logo-${learner.institution_code}`
			)
		} catch (e) {
			console.warn('Failed to add institution logo:', e)
		}
	}

	doc.setTextColor(0, 0, 0)

	// Institution name
	doc.setFont('times', 'bold')
	doc.setFontSize(9.5)
	const nameLines = doc.splitTextToSize(header.name, textWidth) as string[]
	doc.text(nameLines, centerX, y + 3, { align: 'center' })
	y += 3 + nameLines.length * 3.7

	// Optional autonomy / trust lines
	doc.setFont('times', 'normal')
	doc.setFontSize(6.5)
	for (const line of [header.subtitle, header.trust_line].filter(Boolean) as string[]) {
		doc.text(line, centerX, y, { align: 'center' })
		y += 2.8
	}

	// Accreditation + affiliation
	if (header.accreditation) {
		doc.setFontSize(5.6)
		const accLines = doc.splitTextToSize(header.accreditation, textWidth) as string[]
		doc.text(accLines, centerX, y, { align: 'center' })
		y += accLines.length * 2.4
	}

	// Address
	if (header.address) {
		doc.setFont('times', 'bold')
		doc.setFontSize(6.5)
		doc.text(header.address, centerX, y + 0.8, { align: 'center' })
		y += 3.6
	}

	// Rule at a constant height, so both cards on a sheet are ruled level.
	doc.setLineWidth(0.4)
	doc.line(contentX, ruleY, contentX + contentWidth, ruleY)
}

function drawTitles(
	doc: jsPDF,
	learner: LearnerProfilePdfRow,
	startY: number,
	contentWidth: number,
	centerX: number
) {
	let y = startY

	doc.setFont('times', 'bold')
	doc.setFontSize(8.5)
	drawUnderlinedCentered(doc, 'OFFICE OF THE CONTROLLER OF EXAMINATIONS', centerX, y)
	y += 5

	const title = buildProfileTitle(learner)
	const lines = doc.splitTextToSize(title, contentWidth) as string[]
	for (const line of lines) {
		drawUnderlinedCentered(doc, line, centerX, y)
		y += 4
	}
}

/** e.g. "STUDENT PROFILE – III.B.E. COMPUTER SCIENCE (2026-2027)" */
function buildProfileTitle(learner: LearnerProfilePdfRow): string {
	const program = learner.program_name || learner.program_code || ''
	const year = yearOfStudyRoman(learner.current_semester)
	const prefix = year ? `${year}.` : ''
	const course = program ? `${prefix}${program.toUpperCase()}` : 'PROGRAMME NOT MAPPED'
	return `STUDENT PROFILE – ${course} (${academicYear()})`
}

function drawUnderlinedCentered(doc: jsPDF, text: string, centerX: number, y: number) {
	doc.text(text, centerX, y, { align: 'center' })
	const width = doc.getTextWidth(text)
	doc.setLineWidth(0.25)
	doc.line(centerX - width / 2, y + 0.9, centerX + width / 2, y + 0.9)
}

function drawDetailTable(
	doc: jsPDF,
	learner: LearnerProfilePdfRow,
	contentX: number,
	startY: number,
	contentWidth: number
): number {
	const pageWidth = doc.internal.pageSize.getWidth()
	const snoWidth = 9
	const labelWidth = contentWidth * 0.44
	const valueWidth = contentWidth - snoWidth - labelWidth

	autoTable(doc, {
		startY,
		head: [['S.No', 'Students detail', '']],
		body: FIELDS.map((field, index) => [`${index + 1}.`, field.label, field.value(learner)]),
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 8,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
			valign: 'middle',
			overflow: 'linebreak',
			minCellHeight: DETAIL_ROW_HEIGHT,
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 8.5,
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'top',
			lineColor: [0, 0, 0],
			lineWidth: 0.3,
			minCellHeight: PHOTO_ROW_HEIGHT,
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: snoWidth },
			1: { halign: 'left', cellWidth: labelWidth },
			2: { halign: 'left', cellWidth: valueWidth, fontStyle: 'bold' },
		},
		margin: {
			top: startY,
			bottom: 4,
			left: contentX,
			right: pageWidth - (contentX + contentWidth),
		},
		tableWidth: contentWidth,
		// The last row is signed by hand, so it gets writing height.
		didParseCell: (cell: any) => {
			if (cell.section === 'body' && cell.row.index === FIELDS.length - 1) {
				cell.cell.styles.minCellHeight = SIGNATURE_ROW_HEIGHT
				cell.cell.styles.valign = 'top'
			}
		},
		// The learner's photograph sits in the third header cell, where the
		// printed form shows a photo placeholder.
		didDrawCell: (cell: any) => {
			if (cell.section !== 'head' || cell.column.index !== 2) return
			drawPhoto(doc, learner.student_photo_url, cell.cell)
		},
	})

	return (doc as any).lastAutoTable.finalY
}

function drawPhoto(doc: jsPDF, photo: string | undefined, cell: any) {
	const boxW = 13
	const boxH = 14
	const boxX = cell.x + (cell.width - boxW) / 2
	const boxY = cell.y + (cell.height - boxH) / 2

	if (photo) {
		try {
			doc.addImage(photo, 'JPEG', boxX, boxY, boxW, boxH)
			return
		} catch {
			// fall through to the empty box
		}
	}

	doc.setDrawColor(140, 140, 140)
	doc.setLineWidth(0.2)
	doc.rect(boxX, boxY, boxW, boxH)
	doc.setFont('times', 'normal')
	doc.setFontSize(5.5)
	doc.setTextColor(140, 140, 140)
	doc.text('Affix Photo', boxX + boxW / 2, boxY + boxH / 2, { align: 'center' })
	doc.setTextColor(0, 0, 0)
	doc.setDrawColor(0, 0, 0)
}

function drawSignatures(doc: jsPDF, contentX: number, baselineY: number, contentWidth: number) {
	const slot = contentWidth / SIGNATURES.length

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.setTextColor(0, 0, 0)

	SIGNATURES.forEach((label, index) => {
		doc.text(label, contentX + slot * index + slot / 2, baselineY, { align: 'center' })
	})
}

// ========================================================================
// FOOTER — needs the final page count, so it is stamped after every card
// ========================================================================

function stampFooters(doc: jsPDF, pageWidth: number, pageHeight: number) {
	const totalPages = doc.getNumberOfPages()
	const footerY = pageHeight - MARGIN + 4
	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`

	for (let page = 1; page <= totalPages; page++) {
		doc.setPage(page)
		doc.setFont('times', 'normal')
		doc.setFontSize(7)
		doc.setTextColor(0, 0, 0)
		doc.text(`Generated on ${dateStr}`, MARGIN, footerY)
		doc.text(`Page ${page}/${totalPages}`, pageWidth - MARGIN, footerY, { align: 'right' })
	}
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

/** Semesters 1-2 are year I, 3-4 year II, and so on. */
function yearOfStudyRoman(semester?: number | null): string {
	if (!semester || semester < 1) return ''
	const romans = ['I', 'II', 'III', 'IV', 'V', 'VI']
	return romans[Math.ceil(semester / 2) - 1] || ''
}

/** The Indian academic year rolls over in June. */
function academicYear(now = new Date()): string {
	const year = now.getFullYear()
	return now.getMonth() >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

function formatDob(dateStr?: string): string {
	if (!dateStr) return ''
	const date = new Date(dateStr)
	if (isNaN(date.getTime())) return dateStr
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	return `${day}/${month}/${date.getFullYear()}`
}
