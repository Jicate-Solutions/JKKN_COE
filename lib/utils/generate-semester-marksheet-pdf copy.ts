/**
 * Semester Mark Sheet PDF Generator
 *
 * Generates print-ready A4 portrait PDF marksheets matching JKKN university format.
 * Layout matches hall ticket style but without header section.
 *
 * Layout Specifications:
 * - Page Size: A4 (210 × 297 mm)
 * - Orientation: Portrait
 * - Student Info: Table with photo on right (like hall ticket)
 * - Course Table: Blue header with course details
 * - Summary: Part-wise credits and GPA at bottom
 *
 * Paper: A4 (210mm × 297mm)
 * Orientation: Portrait
 */

import jsPDF from 'jspdf'
import autoTable, { RowInput } from 'jspdf-autotable'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface MarksheetCourse {
	courseCode: string
	courseName: string
	part: string
	partDescription?: string
	semester: number
	courseOrder: number
	credits: number
	eseMax: number
	ciaMax: number
	totalMax: number
	eseMarks: number
	ciaMarks: number
	totalMarks: number
	percentage: number
	gradePoint: number
	letterGrade: string
	creditPoints: number
	isPassing: boolean
	result: string
	// Enhanced status flags (from JasperReports decode)
	assessmentType?: string  // Theory, Practical, Project, etc.
	passMarks?: number       // Explicit pass marks threshold
	isAbsent?: boolean       // Student was absent
	isMalpractice?: boolean  // Malpractice case
	isIneligible?: boolean   // Ineligible to appear
	isTermFail?: boolean     // Failed in term
	isFinalFail?: boolean    // Final fail status
}

export interface PartBreakdown {
	partName: string          // part
	partDescription: string
	courses: MarksheetCourse[]
	totalCredits: number
	totalCreditPoints: number  // currCP
	partGPA: number            // currGPA
	creditsEarned: number      // currCA
	// Arrear/Re-appear data (from JasperReports partWise dataset)
	arrearCreditsAttempted?: number  // arrCA
	arrearCreditPoints?: number      // arrCP
	arrearGradePoints?: number       // arrGP
	arrearGPA?: number               // arrGPA
}

export interface StudentMarksheetData {
	student: {
		id: string
		name: string
		firstName?: string       // studFristNm
		middleName?: string      // studMidNm
		lastName?: string        // studLastNm
		registerNo: string       // studRegNum
		rollNumber?: string      // studRollNum
		dateOfBirth?: string     // studDBddmmyyyy
		photoUrl?: string        // studPhoto (base64)
		fatherName?: string      // studFathFristNm + studFathMidNm + studFathLastNm
		motherName?: string      // studMothFristNm + studMothMidNm
		guardianName?: string    // studGurdFristNm
		admissionYear?: string   // studYrOfAdmission
		academicYear?: string    // studAcademicYear
		batchName?: string       // studBatchNm
		gender?: string          // studGender
		signature?: string       // studSign (base64)
	}
	semester: number
	semesterName?: string        // studSemName
	semesterCode?: string        // studSemCode
	session: {
		id: string
		name: string
		monthYear: string        // exmDtmmmyyyy
	}
	program: {
		code: string             // studProgmId
		name: string             // studCrsName / studPrgmName
		description?: string     // studProgmDecrptn
		isPG?: boolean           // Flag to indicate PG program (no Part column)
		degreeId?: string        // studDegreeId
		degreeDescription?: string // studDegreeDecrptn
	}
	department?: {
		id: string               // studDeprtmntId
		name: string             // CurDeptNm
		description?: string     // studDeprtmntDecrptn
	}
	regulation?: {
		name: string             // studRegltnNm
		code: string             // studRgltnCode
		description?: string     // studRgltnDecrptn
	}
	institution?: {
		name: string             // instituteNm
		code: string             // instCode
		address?: string         // Full address line for official grade card
		addressLine1?: string    // instAddrLn1
		addressLine2?: string    // instAddrLn2
		addressLine3?: string    // instAddrLn3
		city?: string            // instAddrCity
		state?: string           // instAddrState
		pincode?: string         // instpostcode
		phone?: string           // instPhNo
		email?: string           // instEmAd
		website?: string         // instWebsite
		logo?: string            // instLogo (base64)
		accreditedBy?: string    // insAcrdBy
		category?: string        // instCatgry
		facultyOfStudy?: string  // instFacOfStudy
		parentName?: string      // entparentNm (university name)
	}
	courses: MarksheetCourse[]
	partBreakdown: PartBreakdown[]
	summary: {
		totalCourses: number
		totalCredits: number
		creditsEarned: number     // cumCrErn
		totalCreditPoints: number // totalSubCrditandGrdPoint
		semesterGPA: number       // SGPA / SemGPA
		cgpa?: number             // CGPA
		passedCount: number
		failedCount: number
		overallResult: string     // result / FinalRslt
		folio?: string            // folioNum
		totalIAMax?: number       // TotalIAMaxMarks
		totalIASecured?: number   // TotalIASecMarks
		totalEAMax?: number       // TotalEAMaxMarks
		totalEASecured?: number   // TotalEASecMarks
		totalMaxMarks?: number    // TotalPercntMarks
		totalSecured?: number     // totPercntMarksObt
		percentage?: number       // studPercnt
		classGrade?: string       // resultClsfctn / currSemGrade
		resultPublicationDate?: string // RsltPblctnDt
	}
	// Signature and seal images
	coeSignature?: string        // coeSignature (base64)
	authorizedSignature?: string // AuthriedSign (base64)
	qrCode?: string              // qrCode (base64)
	barCode?: string             // barCode (base64)
	logoImage?: string
	watermarkImage?: string
	generatedDate?: string       // todayDate
	serialNumber?: string        // SNo
}

export interface MarksheetPDFOptions {
	showWatermark?: boolean
	showPhoto?: boolean
	fontSize?: number
	compactMode?: boolean
	showHeader?: boolean      // Show institution name and "MARK STATEMENT" title
	showQRCode?: boolean      // Show QR code for verification
	showCOESignature?: boolean // Show COE signature image
	showCollegeSeal?: boolean  // Show college seal
	showPartSummary?: boolean  // Show part-wise GPA summary (UG only)
	showCGPA?: boolean        // Show CGPA in summary
	showPercentage?: boolean  // Show percentage in summary
	dateFormat?: 'DD-MM-YYYY' | 'DD/MM/YYYY' | 'MMMM YYYY'
}

// ============================================================
// CONSTANTS - A4 DIMENSIONS AND LAYOUT
// ============================================================

const A4_WIDTH = 210  // mm
const A4_HEIGHT = 297 // mm
const MARGIN = 8      // 0.8cm left/right margins
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN - 1 // 194mm

// Colors matching reference - Blue theme
const COLORS = {
	blue: [0, 51, 102] as [number, number, number],        // Dark blue for headers
	lightBlue: [173, 216, 230] as [number, number, number], // Light blue for alternating
	cream: [255, 255, 230] as [number, number, number],    // Cream/yellow for info cells
	white: [255, 255, 255] as [number, number, number],
	black: [0, 0, 0] as [number, number, number]
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Convert image URL to base64 data URI for use in PDF
 * Uses server-side API to bypass CORS restrictions with Supabase storage URLs
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
	if (!url) return null

	try {
		// If already a base64 data URI, return as is
		if (url.startsWith('data:')) {
			return url
		}

		// Use server-side API to fetch and convert image (bypasses CORS)
		const apiUrl = `/api/utils/image-to-base64?url=${encodeURIComponent(url)}`
		const response = await fetch(apiUrl)

		if (!response.ok) {
			console.warn('Failed to fetch image via API:', response.status)
			return null
		}

		const data = await response.json()

		if (data.error || !data.base64) {
			console.warn('Image conversion failed:', data.error)
			return null
		}

		return data.base64
	} catch (error) {
		console.warn('Error fetching image:', error)
		return null
	}
}

/**
 * Convert Part name to Roman numeral
 */
function partToRoman(part: string): string {
	const match = part.match(/Part\s*(\w+)/i)
	if (!match) return part
	const partNum = match[1].toUpperCase()
	const romanMap: Record<string, string> = {
		'1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V',
		'I': 'I', 'II': 'II', 'III': 'III', 'IV': 'IV', 'V': 'V'
	}
	return romanMap[partNum] || partNum
}

/**
 * Get month and year from session
 */
function getMonthYear(session: { name: string; monthYear: string }): string {
	if (session.monthYear) return session.monthYear
	const sessionName = session.name || ''
	const match = sessionName.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]?(\d{4})/i)
	if (match) return `${match[1]}-${match[2]}`
	return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-')
}

/**
 * Check if program is PG based on code or name
 */
function isPGProgram(programCode: string, programName?: string): boolean {
	const code = programCode?.toUpperCase() || ''
	const name = programName?.toUpperCase() || ''

	// Check code prefixes
	const pgCodePrefixes = ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD', 'PG']
	if (pgCodePrefixes.some(prefix => code.startsWith(prefix))) {
		return true
	}

	// Check if code contains 'PG'
	if (code.includes('PG')) {
		return true
	}

	// Check program name for PG indicators
	const pgNamePatterns = ['M.SC', 'MSC', 'M.A.', 'M.A ', 'MA ', 'M.COM', 'MCOM', 'MBA', 'MCA', 'M.PHIL', 'MPHIL', 'PH.D', 'PHD', 'POST GRADUATE', 'POSTGRADUATE', 'MASTER']
	if (pgNamePatterns.some(pattern => name.includes(pattern))) {
		return true
	}

	return false
}

/**
 * Generate folio number
 */
function generateFolio(programCode: string, programName?: string): string {
	const programType = isPGProgram(programCode, programName) ? 'PG' : 'UG'
	const randomNum = Math.floor(Math.random() * 100000).toString().padStart(8, '0')
	return `${programType}-${randomNum}`
}

// ============================================================
// PDF GENERATOR FUNCTION
// ============================================================

/**
 * Convert number to Roman numeral
 */
function toRoman(num: number): string {
	const romanNumerals: [number, string][] = [
		[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
	]
	let result = ''
	for (const [value, symbol] of romanNumerals) {
		while (num >= value) {
			result += symbol
			num -= value
		}
	}
	return result
}

/**
 * Determine enhanced result status based on JasperReports logic
 * Priority: Absent > Malpractice > Ineligible > Fail > Pass
 */
function getEnhancedResultStatus(course: MarksheetCourse): string {
	// Check special statuses first (highest priority)
	if (course.isAbsent) return 'AAA'  // Absent
	if (course.isMalpractice) return 'MALPRACTICE'
	if (course.isIneligible) return 'INELIGIBLE'

	// Check fail conditions
	if (course.isFinalFail) return 'RA'  // Re-Appear (Final Fail)
	if (course.isTermFail) return 'RA'   // Re-Appear (Term Fail)

	// Use existing pass/fail logic
	if (!course.isPassing) return 'RA'   // Re-Appear (Not Passing)

	// Default: Pass
	return 'PASS'
}

/**
 * Add a student's marksheet to a PDF document
 */
function addStudentMarksheetToDoc(
	doc: jsPDF,
	data: StudentMarksheetData,
	options: MarksheetPDFOptions = {}
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	let currentY = MARGIN

	// Determine if this is a PG program (no Part column)
	const isPG = data.program.isPG || isPGProgram(data.program.code, data.program.name)

	// ========== OFFICIAL JKKN HEADER (Optional) ==========

	// Only show header if showHeader option is true
	if (options.showHeader) {
		// Add green decorative border at top
		doc.setDrawColor(60, 120, 100)
		doc.setLineWidth(0.5)
		doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 0.5, 'F')
		currentY += 2

		// Institution name (main title)
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(14)
		doc.setTextColor(...COLORS.blue)
		let institutionName = 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE'
		if (data.institution?.name) {
			institutionName = data.institution.name.toUpperCase()
		}
		let textWidth = doc.getTextWidth(institutionName)
		doc.text(institutionName, (pageWidth - textWidth) / 2, currentY + 4)
		currentY += 6

		// Subtitle - affiliation
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(...COLORS.black)
		const subtitle = '(An Autonomous College Affiliated to Periyar University, Salem.)'
		textWidth = doc.getTextWidth(subtitle)
		doc.text(subtitle, (pageWidth - textWidth) / 2, currentY + 2)
		currentY += 4

		// Accreditation line
		doc.setFontSize(7)
		const accreditation = 'Accredited by NAAC, Approved by AICTE and Recognized by UGC Under Section 2(f) & 12(B),'
		textWidth = doc.getTextWidth(accreditation)
		doc.text(accreditation, (pageWidth - textWidth) / 2, currentY + 2)
		currentY += 3.5

		// Address line
		const address = data.institution?.address || 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu.'
		textWidth = doc.getTextWidth(address)
		doc.text(address, (pageWidth - textWidth) / 2, currentY + 2)
		currentY += 5

		// CHOICE BASED CREDIT SYSTEM
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(9)
		doc.setTextColor(...COLORS.blue)
		const cbcsText = 'CHOICE BASED CREDIT SYSTEM'
		textWidth = doc.getTextWidth(cbcsText)
		doc.text(cbcsText, (pageWidth - textWidth) / 2, currentY + 3)
		currentY += 5

		// GRADE CARD title (red)
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(16)
		doc.setTextColor(180, 0, 0) // Red color
		const gradeCardText = 'GRADE CARD'
		textWidth = doc.getTextWidth(gradeCardText)
		doc.text(gradeCardText, (pageWidth - textWidth) / 2, currentY + 4)
		currentY += 6

		// Serial Number (left aligned)
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(...COLORS.black)
		const serialNo = data.summary?.folio || generateFolio(data.program.code, data.program.name)
		doc.text(`S.No. ${serialNo}`, MARGIN, currentY + 3)
		currentY += 6
	}

	// ========== PHOTO BOX (Top Right) ==========
	//
	// Layout:
	//                         +-------+
	//                         | PHOTO |
	//                         |       |
	//                         +-------+
	// +----------------------------------+
	// | NAME OF THE  | Value | DOB | Val |
	// | REGISTER NO  | Value | MnY | Val |
	// | PROGRAMME    | Value | FOL | Val |
	// +----------------------------------+
	//
	// Photo dimensions: 2.8cm × 3.5cm (width × height)
	const photoWidth = 28   // 2.8cm
	const photoHeight = 35  // 3.5cm

	// Photo position - immediately after margin (top right)
	const photoBoxX = pageWidth - MARGIN - photoWidth  // Right aligned
	const photoBoxY = MARGIN  // Immediately after margin

	// Draw photo box with border (only if showHeader is true - for pre-printed sheet, box is already there)
	if (options.showHeader) {
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.5)
		doc.setFillColor(...COLORS.white)
		doc.rect(photoBoxX, photoBoxY, photoWidth, photoHeight, 'FD')
	}

	// Add student photo if available (must be base64 data URI)
	console.log('[PDF Generator] photoUrl received:', data.student.photoUrl ? `${data.student.photoUrl.substring(0, 50)}... (${data.student.photoUrl.length} chars)` : 'null/undefined')
	console.log('[PDF Generator] showPhoto option:', options.showPhoto)
	if (data.student.photoUrl && options.showPhoto !== false) {
		try {
			const photoX = photoBoxX + 2
			const photoY = photoBoxY + 2
			const imgWidth = photoWidth - 4
			const imgHeight = photoHeight - 4

			// Detect image format from base64 data URI
			let imageFormat: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
			if (data.student.photoUrl.includes('image/png')) {
				imageFormat = 'PNG'
			} else if (data.student.photoUrl.includes('image/webp')) {
				imageFormat = 'WEBP'
			}
			console.log('[PDF Generator] Adding image with format:', imageFormat)

			doc.addImage(data.student.photoUrl, imageFormat, photoX, photoY, imgWidth, imgHeight)
			console.log('[PDF Generator] Photo added successfully')
		} catch (e) {
			console.warn('[PDF Generator] Failed to add student photo:', e)
			// Show placeholder text if photo fails to load (only if showHeader)
			if (options.showHeader) {
				doc.setFont('helvetica', 'normal')
				doc.setFontSize(10)
				doc.setTextColor(150, 150, 150)
				const placeholderText = 'PHOTO'
				const pTextWidth = doc.getTextWidth(placeholderText)
				doc.text(placeholderText, photoBoxX + (photoWidth - pTextWidth) / 2, photoBoxY + photoHeight / 2)
			}
		}
	} else if (options.showHeader) {
		// Show placeholder text only for PDF with header (pre-printed sheet has the box)
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(10)
		doc.setTextColor(150, 150, 150)
		const placeholderText = 'PHOTO'
		const pTextWidth = doc.getTextWidth(placeholderText)
		doc.text(placeholderText, photoBoxX + (photoWidth - pTextWidth) / 2, photoBoxY + photoHeight / 2)
	}

	// ========== STUDENT INFORMATION TABLE (Full Width, Below Photo) ==========

	// Position below photo: Photo is 35mm tall starting at MARGIN (8mm), ends at 43mm
	// Single line gap (0.8mm) between photo and student info table
	currentY = MARGIN + 34   // Photo (35mm) + 0.8mm gap = 43.8mm from page top

	// Table layout - 4 columns, full width
	const rowHeight = 7  // JasperReports: 19pt = 7mm
	const infoTableHeight = 3 * rowHeight // 3 rows

	// Column widths from JasperReports (converted from points to mm)
	// JRXML line positions: x=134pt, x=368pt, x=456pt, total width=555pt
	// Col1: 134pt=47mm, Col2: 234pt=83mm, Col3: 88pt=31mm, Col4: 99pt=35mm
	const col1 = 46  // Label 1 (NAME OF THE CANDIDATE, REGISTER NO, PROGRAMME)
	const col2 = 79  // Value 1 (student name, regno, program)
	const col3 = 34  // Label 2 (DATE OF BIRTH, MONTH & YEAR, FOLIO NUMBER)
	const col4 = CONTENT_WIDTH - col1 - col2 - col3  // Value 2 (remaining width = 35mm)

	const infoBoxY = currentY

	// Draw thick outer border for student info table first
	doc.setDrawColor(...COLORS.black)
	doc.setLineWidth(0.5)  // Thick outer border
	doc.rect(MARGIN, infoBoxY, CONTENT_WIDTH, infoTableHeight)

	// Set border style for internal cell lines (thin)
	doc.setLineWidth(0.15)

	// Row 1: NAME OF THE | [name] | DATE OF BIRTH | [dob]
	let x = MARGIN
	let y = infoBoxY

	// NAME OF THE CANDIDATE (label - single line)
	doc.rect(x, y, col1, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text('NAME OF THE CANDIDATE', x + 2, y + 5)

	// Student Name (value)
	x += col1
	doc.rect(x, y, col2, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text(data.student.name.toUpperCase(), x + 2, y + 5)

	// DATE OF BIRTH (label)
	x += col2
	doc.rect(x, y, col3, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(7)
	doc.setTextColor(...COLORS.black)
	doc.text('DATE OF BIRTH', x + 2, y + 3.5)
	doc.text('(DD-MM-YYYY)', x + 2, y + 6)

	// DOB Value
	x += col3
	doc.rect(x, y, col4, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text(data.student.dateOfBirth || '-', x + 2, y + 5)

	// Row 2: REGISTER NO | [regno] | MONTH & YEAR | [month]
	x = MARGIN
	y += rowHeight

	doc.rect(x, y, col1, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text('REGISTER NO', x + 2, y + 5)

	x += col1
	doc.rect(x, y, col2, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text(data.student.registerNo, x + 2, y + 5)

	x += col2
	doc.rect(x, y, col3, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text('MONTH & YEAR', x + 2, y + 5)

	x += col3
	doc.rect(x, y, col4, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text(data.session.monthYear || getMonthYear(data.session), x + 2, y + 5)

	// Row 3: PROGRAMME | [program] | FOLIO NUMBER | [folio]
	x = MARGIN
	y += rowHeight

	doc.rect(x, y, col1, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text('PROGRAMME', x + 2, y + 5)

	x += col1
	doc.rect(x, y, col2, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	// Use program name only, don't fall back to program code
	const programDisplayName = data.program.name || '-'
	// Wrap text if too long for the cell width
	const programCellWidth = col2 - 4  // Available width with padding
	const programLines = doc.splitTextToSize(programDisplayName.toUpperCase(), programCellWidth)
	if (programLines.length === 1) {
		doc.text(programLines[0], x + 2, y + 5)
	} else {
		// Two lines - position to fit in row height
		doc.text(programLines[0], x + 2, y + 3)
		doc.text(programLines[1] || '', x + 2, y + 6)
	}

	x += col2
	doc.rect(x, y, col3, rowHeight, 'S')
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text('FOLIO NUMBER', x + 2, y + 5)

	x += col3
	doc.rect(x, y, col4, rowHeight, 'S')
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	doc.text(data.summary.folio || generateFolio(data.program.code, data.program.name), x + 2, y + 5)

	// Move past the table (no gap - tables are joined)
	currentY = infoBoxY + infoTableHeight

	// ========== COURSE DETAILS TABLE WITH VERTICAL HEADERS ==========

	// For UG: PART | SEMESTER | COURSE CODE | COURSE TITLE | CREDITS | MAXIMUM (ESE/CIA/TOTAL) | MARKS SECURED (ESE/CIA/TOTAL) | GRADE POINT | GRADE | RESULT
	// For PG: No PART column - SEMESTER | COURSE CODE | COURSE TITLE | CREDITS | MAXIMUM (ESE/CIA/TOTAL) | MARKS SECURED (ESE/CIA/TOTAL) | GRADE POINT | GRADE | RESULT

	// Column widths for course table - must sum to CONTENT_WIDTH (194mm)
	// UG: 14 columns with PART
	// PG: 13 columns without PART (TITLE column gets extra width)
	const colWidths = isPG
		? [6, 18, 100, 6, 6, 6, 7, 6, 6, 8, 8, 6, 10]  // PG: 13 columns = 194mm (no PART)
		: [6, 6, 18, 94, 6, 6, 6, 7, 6, 6, 8, 8, 6, 10]  // UG: 14 columns = 194mm (with PART)

	// ===== MANUALLY DRAW VERTICAL HEADER =====
	const headerHeight = 25  // Total header height (two rows)
	const row1Height = 8     // "MAXIMUM" and "MARKS SECURED" row
	const row2Height = 14    // Vertical text row

	// Draw header background (white) and outer border (black) - THICK border
	doc.setFillColor(...COLORS.white)
	doc.setDrawColor(...COLORS.black)
	doc.setLineWidth(0.5)  // Thick outer border
	doc.rect(MARGIN, currentY, CONTENT_WIDTH, headerHeight, 'FD')

	// Calculate column indices for MAXIMUM and MARKS SECURED
	// UG: PART(0), SEM(1), CODE(2), TITLE(3), CR(4), ESE(5), CIA(6), TOT(7), ESE(8), CIA(9), TOT(10), GP(11), GR(12), RES(13)
	// PG: SEM(0), CODE(1), TITLE(2), CR(3), ESE(4), CIA(5), TOT(6), ESE(7), CIA(8), TOT(9), GP(10), GR(11), RES(12)
	const maxColStartIdx = isPG ? 4 : 5  // Index where MAXIMUM columns start
	const maxColEndIdx = isPG ? 6 : 7    // Index where MAXIMUM columns end
	const securedColStartIdx = isPG ? 7 : 8  // Index where MARKS SECURED columns start
	const securedColEndIdx = isPG ? 9 : 10   // Index where MARKS SECURED columns end

	// Draw vertical lines for columns (black) - thin internal lines
	// For columns under MAXIMUM/MARKS SECURED: only draw in row 2
	// For other columns: draw full height
	doc.setDrawColor(...COLORS.black)
	doc.setLineWidth(0.15)  // Thin internal lines

	let colX = MARGIN
	for (let i = 0; i < colWidths.length; i++) {
		if (i > 0) {
			// Check if this is an internal line within MAXIMUM or MARKS SECURED sections
			const isInternalMaxLine = (i > maxColStartIdx && i <= maxColEndIdx)
			const isInternalSecLine = (i > securedColStartIdx && i <= securedColEndIdx)

			if (isInternalMaxLine || isInternalSecLine) {
				// Draw vertical line only in row 2 (below the horizontal line)
				doc.line(colX, currentY + row1Height, colX, currentY + headerHeight)
			} else {
				// Draw vertical line for full height
				doc.line(colX, currentY, colX, currentY + headerHeight)
			}
		}
		colX += colWidths[i]
	}

	// Calculate x positions for MAXIMUM section
	let maxStartX = MARGIN
	for (let i = 0; i < maxColStartIdx; i++) maxStartX += colWidths[i]
	let maxEndX = maxStartX
	for (let i = maxColStartIdx; i <= maxColEndIdx; i++) maxEndX += colWidths[i]

	// Calculate x positions for MARKS SECURED section
	let secStartX = MARGIN
	for (let i = 0; i < securedColStartIdx; i++) secStartX += colWidths[i]
	let secEndX = secStartX
	for (let i = securedColStartIdx; i <= securedColEndIdx; i++) secEndX += colWidths[i]

	// Draw horizontal line ONLY under MAXIMUM columns
	doc.line(maxStartX, currentY + row1Height, maxEndX, currentY + row1Height)
	// Draw horizontal line ONLY under MARKS SECURED columns
	doc.line(secStartX, currentY + row1Height, secEndX, currentY + row1Height)

	// Helper function to draw vertical text - MIDDLE ALIGNED & CENTERED
	// cellCenterX: horizontal center of the cell
	// cellCenterY: vertical center of the cell (or area to center in)
	const drawVerticalText = (text: string, cellCenterX: number, cellCenterY: number) => {
		doc.saveGraphicsState()
		// Get text dimensions
		const textWidth = doc.getTextWidth(text)

		// For 90 degree rotation (bottom to top):
		// After rotation, text draws upward from anchor point
		// x position: shift right by 0.5mm to center text horizontally in cell
		// y position: cell center plus half text width (so middle of text is at center)
		const x = cellCenterX + 0.5
		const y = cellCenterY + textWidth / 2

		doc.text(text, x, y, { angle: 90 })
		doc.restoreGraphicsState()
	}

	// Set text styles for header (black text on white background)
	// JRXML uses font size 9 for most headers, 8 for PART
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)

	// Column header definitions
	// UG: [PART, SEMESTER, COURSE CODE, COURSE TITLE, CREDITS, ESE, CIA, TOTAL, ESE, CIA, TOTAL, GRADE POINT, GRADE, RESULT]
	// PG: [SEMESTER, COURSE CODE, COURSE TITLE, CREDITS, ESE, CIA, TOTAL, ESE, CIA, TOTAL, GRADE POINT, GRADE, RESULT]
	const headerTexts = isPG
		? ['SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'ESE', 'CIA', 'TOTAL', 'ESE', 'CIA', 'TOTAL', 'GRADE POINT', 'GRADE', 'RESULT']
		: ['PART', 'SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'ESE', 'CIA', 'TOTAL', 'ESE', 'CIA', 'TOTAL', 'GRADE POINT', 'GRADE', 'RESULT']

	// Draw "MAXIMUM" and "MARKS SECURED" spanning headers (row 1) - font size 9 per JRXML
	const maxColStart = isPG ? 4 : 5  // Index where MAXIMUM columns start
	const securedColStart = isPG ? 7 : 8  // Index where MARKS SECURED columns start

	// Calculate x positions for MAXIMUM and MARKS SECURED headers
	let maxX = MARGIN
	for (let i = 0; i < maxColStart; i++) maxX += colWidths[i]
	const maxWidth = colWidths[maxColStart] + colWidths[maxColStart + 1] + colWidths[maxColStart + 2]

	let secX = MARGIN
	for (let i = 0; i < securedColStart; i++) secX += colWidths[i]
	const secWidth = colWidths[securedColStart] + colWidths[securedColStart + 1] + colWidths[securedColStart + 2]

	doc.setFontSize(9)
	const maxText = 'MAXIMUM'
	const maxTextWidth = doc.getTextWidth(maxText)
	doc.text(maxText, maxX + (maxWidth - maxTextWidth) / 2, currentY + 5)

	// MARKS SECURED on two lines - CENTRE aligned
	const secText1 = 'MARKS'
	const secText2 = 'SECURED'
	doc.text(secText1, secX + (secWidth - doc.getTextWidth(secText1)) / 2, currentY + 3)
	doc.text(secText2, secX + (secWidth - doc.getTextWidth(secText2)) / 2, currentY + 7)

	// Draw vertical header text for each column - CENTRE ALIGNED
	colX = MARGIN

	// Row 2 vertical center position (for centering vertical text in row 2 area)
	const row2CenterY = currentY + row1Height + (headerHeight - row1Height) / 2
	// Full header vertical center (for COURSE TITLE, COURSE CODE which span full height)
	const fullHeaderCenterY = currentY + headerHeight / 2

	for (let i = 0; i < headerTexts.length; i++) {
		const text = headerTexts[i]
		const colWidth = colWidths[i]
		const cellCenterX = colX + colWidth / 2

		// Check if this column is part of MAXIMUM or MARKS SECURED sections
		// UG: columns 5-10 (indices 5-7 for MAX, 8-10 for SECURED)
		// PG: columns 4-9 (indices 4-6 for MAX, 7-9 for SECURED)
		const isMaxOrSecuredCol = i >= maxColStartIdx && i <= securedColEndIdx
		if (isMaxOrSecuredCol) {
			// These columns already have "MAXIMUM" or "MARKS SECURED" in row 1
			// Draw vertical text for ESE, CIA, TOTAL - font size 9 per JRXML - MIDDLE ALIGN & CENTRE in row 2
			doc.setFontSize(9)
			drawVerticalText(text, cellCenterX, row2CenterY)
		} else if (text === 'COURSE TITLE') {
			// Course title uses horizontal text - font size 9 - CENTRE in full header
			doc.setFontSize(9)
			const textWidth = doc.getTextWidth(text)
			doc.text(text, cellCenterX - textWidth / 2, fullHeaderCenterY + 1.5)
		} else if (text === 'COURSE CODE') {
			// Course code uses horizontal text - font size 9 (two lines) - CENTRE in full header
			doc.setFontSize(9)
			const codeText1 = 'COURSE'
			const codeText2 = 'CODE'
			doc.text(codeText1, cellCenterX - doc.getTextWidth(codeText1) / 2, fullHeaderCenterY - 1)
			doc.text(codeText2, cellCenterX - doc.getTextWidth(codeText2) / 2, fullHeaderCenterY + 3)
		} else if (text === 'PART') {
			// PART uses font size 8 per JRXML - MIDDLE ALIGN & CENTRE in full header
			doc.setFontSize(8)
			drawVerticalText(text, cellCenterX, fullHeaderCenterY)
		} else {
			// Draw vertical text for other columns (SEMESTER, CREDITS, GRADE POINT, GRADE, RESULT) - font size 9 - MIDDLE ALIGN & CENTRE in full header
			doc.setFontSize(9)
			drawVerticalText(text, cellCenterX, fullHeaderCenterY)
		}

		colX += colWidth
	}

	// Move Y position past the header
	currentY += headerHeight

	// Now use autoTable for body only (no header)
	// We'll use empty headers since we drew them manually

	// Body rows (no header - we drew it manually above)
	// UG: 14 columns with PART
	// PG: 13 columns without PART
	const body: RowInput[] = data.courses.map(course => {
		// Use enhanced result status (handles absent, malpractice, ineligible, etc.)
		const resultStatus = getEnhancedResultStatus(course)
		const displayGradePoint = course.isAbsent ? 'AAA' : (course.gradePoint > 0 ? course.gradePoint.toFixed(1) : '0')
		const displayGrade = course.isAbsent ? 'AAA' : course.letterGrade
		// For PART column (UG only): show Roman numeral if available, otherwise "-"
		const partDisplay = course.part ? partToRoman(course.part) : '-'

		// Common columns (same for UG and PG)
		const commonCols = [
			{ content: toRoman(course.semester), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.courseCode, styles: { halign: 'left' as const, fontSize: 8 } },
			{ content: course.courseName.toUpperCase(), styles: { halign: 'left' as const, fontSize: 8 } },
			{ content: course.credits.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.eseMax.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.ciaMax.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.totalMax.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.isAbsent ? 'AAA' : course.eseMarks.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.isAbsent ? 'AAA' : course.ciaMarks.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: course.isAbsent ? 'AAA' : course.totalMarks.toString(), styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: displayGradePoint, styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: displayGrade, styles: { halign: 'center' as const, fontSize: 8 } },
			{ content: resultStatus, styles: { halign: 'center' as const, fontSize: 8 } }
		]

		// PG: no PART column (13 columns)
		// UG: include PART column at the beginning (14 columns)
		if (isPG) {
			return commonCols
		} else {
			return [
				{ content: partDisplay, styles: { halign: 'center' as const, fontSize: 8 } },
				...commonCols
			]
		}
	})

	// Empty headers since we drew them manually
	const headers: RowInput[] = []

	// Build column styles object
	// COURSE CODE and COURSE TITLE indices differ for UG vs PG
	// UG: PART(0), SEM(1), CODE(2), TITLE(3)... - CODE at 2, TITLE at 3
	// PG: SEM(0), CODE(1), TITLE(2)... - CODE at 1, TITLE at 2
	const courseCodeColIdx = isPG ? 1 : 2
	const courseTitleColIdx = isPG ? 2 : 3
	const columnStyles: Record<number, any> = {}
	colWidths.forEach((width, i) => {
		columnStyles[i] = {
			cellWidth: width,
			// CODE and TITLE columns = left aligned; rest = center
			halign: (i === courseCodeColIdx || i === courseTitleColIdx) ? 'left' : 'center',
			// Enable text wrap for COURSE TITLE column
			overflow: i === courseTitleColIdx ? 'linebreak' : 'ellipsize'
		}
	})

	// ===== DRAW FIXED HEIGHT OUTER BORDER FOR SUBJECT TABLE =====
	// Calculate height based on fixed positions to ensure 2mm gap before footnotes
	// Footnotes at fixed Y position: A4_HEIGHT - MARGIN - 35 = 254mm from top
	const footnoteYTarget = A4_HEIGHT - MARGIN - 35  // 254mm
	// GPA table must end 1mm before footnotes
	const targetGpaEndY = footnoteYTarget - 1  // 253mm
	// GPA table height is 28mm (fixed)
	const gpaTableHeight = 28
	// Subject table should end where GPA table starts
	const targetSubjectEndY = targetGpaEndY - gpaTableHeight  // 216mm
	// Calculate subject table height to reach target end position
	const subjectTableFixedHeight = Math.max(50, targetSubjectEndY - currentY)
	const subjectTableStartY = currentY

	// Draw outer border rectangle (fixed height, not based on content) - THICK border
	doc.setDrawColor(...COLORS.black)
	doc.setLineWidth(0.5)  // Thick outer border
	doc.rect(MARGIN, subjectTableStartY, CONTENT_WIDTH, subjectTableFixedHeight)

	// Draw vertical column divider lines (full height of subject table) - thin lines
	doc.setLineWidth(0.15)  // Thin internal lines
	let dividerX = MARGIN
	for (let i = 0; i < colWidths.length - 1; i++) {
		dividerX += colWidths[i]
		doc.line(dividerX, subjectTableStartY, dividerX, subjectTableStartY + subjectTableFixedHeight)
	}

	// Use autoTable with theme: 'plain' (no grid lines) to render body content
	autoTable(doc, {
		startY: currentY,
		head: headers,
		body: body,
		theme: 'plain',
		styles: {
			fontSize: 8,
			cellPadding: 0.5,  // Reduced padding for single line spacing
			lineColor: COLORS.black,
			lineWidth: 0,  // No grid lines
			textColor: COLORS.black,
			overflow: 'ellipsize',
			valign: 'middle',
			minCellHeight: 4  // Reduced from 6 to 4 for single line spacing
		},
		headStyles: {
			fillColor: COLORS.white,
			textColor: COLORS.black,
			fontSize: 7,
			fontStyle: 'bold',
			minCellHeight: 8
		},
		columnStyles: columnStyles,
		margin: { left: MARGIN, right: MARGIN, top: 0, bottom: 0 },
		tableWidth: 'wrap'
	})

	// Move past the fixed height subject table (NO GAP - tables are joined)
	currentY = subjectTableStartY + subjectTableFixedHeight

	// ========== GPA SUMMARY ==========
	// UG: Show PART, CREDITS EARNED, GPA with part-wise breakdown
	// PG: Show only CREDITS EARNED and GPA (total only, no PART column)

	if (data.partBreakdown && data.partBreakdown.length > 0) {
		// ===== GPA SUMMARY TABLE (Joined to subject table - JRXML style) =====
		// JRXML: x="3" y="633" width="548" height="80" → 80pt = ~28mm
		const gpaTableFixedHeight = 28  // Fixed height in mm (from JRXML 80pt)
		const gpaTableStartY = currentY

		// Draw outer border rectangle (fixed height) - joins with subject table above - THICK border
		doc.setDrawColor(...COLORS.black)
		doc.setLineWidth(0.5)  // Thick outer border
		doc.rect(MARGIN, gpaTableStartY, CONTENT_WIDTH, gpaTableFixedHeight)

		// Line 1: "(IN THE CURRENT SEMESTER)" title
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(8)
		doc.setTextColor(...COLORS.black)
		doc.text('(IN THE CURRENT SEMESTER)', MARGIN + 2, gpaTableStartY + 4)

		// Show PART, CREDITS EARNED, GPA for both UG and PG (PG shows "-" for PART when no value)
		const gpaHeaderY = gpaTableStartY + 8
		doc.text('PART', MARGIN + 8, gpaHeaderY)
		doc.text('CREDITS EARNED', MARGIN + 25, gpaHeaderY)
		doc.text('GPA', MARGIN + 65, gpaHeaderY)

		// Data rows - values center aligned
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		let gpaRowY = gpaHeaderY + 4

		const partsWithData = data.partBreakdown.filter(part => part.courses.length > 0)

		if (partsWithData.length > 0) {
			// Has part-wise breakdown - show each part
			partsWithData.forEach((part, idx) => {
				const rowY = gpaRowY + (idx * 4)  // 4mm row height

				// PART - centered under PART header (show "-" if no part name)
				const partText = part.partName ? partToRoman(part.partName) : '-'
				const partTextWidth = doc.getTextWidth(partText)
				doc.text(partText, MARGIN + 13 - partTextWidth / 2, rowY)

				// CREDITS EARNED
				const creditsText = part.creditsEarned.toString()
				const creditsTextWidth = doc.getTextWidth(creditsText)
				doc.text(creditsText, MARGIN + 38 - creditsTextWidth / 2, rowY)

				// GPA
				const gpaText = part.partGPA.toFixed(2)
				const gpaTextWidth = doc.getTextWidth(gpaText)
				doc.text(gpaText, MARGIN + 68 - gpaTextWidth / 2, rowY)
			})
		} else {
			// No part breakdown - show totals with "-" for PART
			const rowY = gpaRowY

			// PART - show "-"
			const partText = '-'
			const partTextWidth = doc.getTextWidth(partText)
			doc.text(partText, MARGIN + 13 - partTextWidth / 2, rowY)

			// Total CREDITS EARNED
			const creditsText = (data.summary.creditsEarned || 0).toString()
			const creditsTextWidth = doc.getTextWidth(creditsText)
			doc.text(creditsText, MARGIN + 38 - creditsTextWidth / 2, rowY)

			// GPA
			const gpaText = (data.summary.semesterGPA || 0).toFixed(2)
			const gpaTextWidth = doc.getTextWidth(gpaText)
			doc.text(gpaText, MARGIN + 68 - gpaTextWidth / 2, rowY)
		}

		// Move past the fixed height GPA summary table
		// GPA summary ends at bottom margin + 3mm
		currentY = gpaTableStartY + gpaTableFixedHeight + 3
	} else {
		currentY += 3  // Small gap if no GPA summary
	}

	// ========== FOOTNOTES ==========
	// Fixed position: bottom margin + 3.5cm (35mm from bottom margin)
	// Y = A4_HEIGHT - MARGIN - 35 = 297 - 8 - 35 = 254mm from top

	const footnoteY = A4_HEIGHT - MARGIN - 33

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(7)
	doc.setTextColor(...COLORS.black)

	// Different passing minimum for UG (40%) vs PG (50%)
	const passingMinimum = isPG ? '50%' : '40%'
	const footnote = `Passing Minimum is ${passingMinimum} of Maximum (in ESE and Total separately) P: Pass, RA: Re-Appear, AAA: Absent, ESE: End Semester Examination,CIA: Continuous Internal Assessment, GPA: Grade Points Average, ***Not Secured Passing Minimum.`
	const splitNote = doc.splitTextToSize(footnote, CONTENT_WIDTH)
	doc.text(splitNote, MARGIN, footnoteY)

	// ========== DATE (Immediately after footnote, left side at margin + 3.5cm) ==========

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(...COLORS.black)
	const dateStr = data.generatedDate || new Date().toLocaleDateString('en-IN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	})
	// Position date immediately after footnote text
	// X = MARGIN + 35 (3.5cm from margin, left side)
	// Y = footnoteY + (footnote lines * line height) + small gap
	const footnoteLineHeight = 2.5  // Font size 6 = ~2.5mm line height
	const dateY = footnoteY + (splitNote.length * footnoteLineHeight) + 4  // 1.5mm gap after footnote
	doc.text(dateStr, MARGIN + 35, dateY)

	// ========== WATERMARK (Optional) ==========

	// Only show watermark when header is enabled
	if (options.showWatermark !== false && options.showHeader) {
		// Add "JKKN" watermark in center of page
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(120)
		doc.setTextColor(240, 240, 240) // Very light gray
		const watermarkText = 'JKKN'
		const wmWidth = doc.getTextWidth(watermarkText)
		const wmX = (pageWidth - wmWidth) / 2
		const wmY = A4_HEIGHT / 2
		doc.text(watermarkText, wmX, wmY)

		// Smaller text below
		doc.setFontSize(16)
		doc.setTextColor(230, 230, 230)
		const subWatermark = 'College of Arts & Science'
		const subWmWidth = doc.getTextWidth(subWatermark)
		doc.text(subWatermark, (pageWidth - subWmWidth) / 2, wmY + 15)
	}
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

export function generateSemesterMarksheetPDF(
	data: StudentMarksheetData,
	options: MarksheetPDFOptions = {}
): string {
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	})

	addStudentMarksheetToDoc(doc, data, options)
	return doc.output('datauristring')
}

export function downloadSemesterMarksheetPDF(
	data: StudentMarksheetData,
	filename?: string,
	options: MarksheetPDFOptions = {}
): void {
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	})

	addStudentMarksheetToDoc(doc, data, options)
	const fname = filename || `Marksheet_${data.student.registerNo}_Sem${data.semester}.pdf`
	doc.save(fname)
}

export function generateBatchMarksheetPDFs(
	students: StudentMarksheetData[],
	options: MarksheetPDFOptions = {}
): string[] {
	return students.map(student => {
		const doc = new jsPDF({
			orientation: 'portrait',
			unit: 'mm',
			format: 'a4'
		})
		addStudentMarksheetToDoc(doc, student, options)
		return doc.output('datauristring')
	})
}

export function generateMergedMarksheetPDF(
	students: StudentMarksheetData[],
	options: MarksheetPDFOptions = {}
): string {
	if (students.length === 0) {
		throw new Error('No students provided for merged PDF')
	}

	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	})

	students.forEach((studentData, index) => {
		if (index > 0) {
			doc.addPage()
		}
		addStudentMarksheetToDoc(doc, studentData, options)
	})

	return doc.output('datauristring')
}

export function downloadMergedMarksheetPDF(
	students: StudentMarksheetData[],
	filename?: string,
	options: MarksheetPDFOptions = {}
): void {
	if (students.length === 0) {
		throw new Error('No students provided for merged PDF')
	}

	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	})

	students.forEach((studentData, index) => {
		if (index > 0) {
			doc.addPage()
		}
		addStudentMarksheetToDoc(doc, studentData, options)
	})

	const fname = filename || `Marksheets_Merged_${students.length}_students.pdf`
	doc.save(fname)
}

// Legacy class export for backward compatibility
export class SemesterMarksheetPDFGenerator {
	private doc: jsPDF
	private data: StudentMarksheetData
	private options: MarksheetPDFOptions

	constructor(data: StudentMarksheetData, options: MarksheetPDFOptions = {}) {
		this.doc = new jsPDF({
			orientation: 'portrait',
			unit: 'mm',
			format: 'a4'
		})
		this.data = data
		this.options = options
	}

	public generate(): string {
		addStudentMarksheetToDoc(this.doc, this.data, this.options)
		return this.doc.output('datauristring')
	}

	public download(filename?: string): void {
		addStudentMarksheetToDoc(this.doc, this.data, this.options)
		const fname = filename || `Marksheet_${this.data.student.registerNo}_Sem${this.data.semester}.pdf`
		this.doc.save(fname)
	}
}
