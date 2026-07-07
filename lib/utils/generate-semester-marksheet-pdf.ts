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
 * Arrear Papers Support:
 * - Includes BOTH current semester courses AND arrear papers from previous semesters
 * - Example: Semester II marksheet shows Semester II courses + failed Semester I papers
 * - Courses sorted by semester ASC, then course_order ASC (arrears appear first)
 * - Each course shows its actual semester number in the SEMESTER column (I, II, III, etc.)
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
	semester: number         // Actual semester of the course (I, II, III, etc.)
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
	// Result type classification
	resultType?: string      // 'Mark' | 'Status' | 'comment' | 'credit'
	passStatus?: string      // e.g. 'Pass', 'Re-Appear', 'Credit' for Status courses
	creditValue?: number     // Assigned credit value for credit-type courses
	// Enhanced status flags (from JasperReports decode)
	assessmentType?: string  // Theory, Practical, Project, etc.
	passMarks?: number       // Explicit pass marks threshold
	isAbsent?: boolean       // Student was absent
	isMalpractice?: boolean  // Malpractice case
	isIneligible?: boolean   // Ineligible to appear
	isTermFail?: boolean     // Failed in term
	isFinalFail?: boolean    // Final fail status
	isArrear?: boolean       // True if this is an arrear paper from a previous semester
	monthYear?: string       // Per-course examination MONTH & YEAR (consolidated layout only)
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
	semester: number             // Current semester being examined (e.g., II for Semester II)
	semesterName?: string        // studSemName
	semesterCode?: string        // studSemCode
	session: {
		id: string
		name: string
		monthYear: string        // exam_session.month_year column
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
	// IMPORTANT: Include BOTH current semester courses AND arrear papers from previous semesters
	// Example: For Semester II marksheet, include Semester II courses + any failed Semester I papers
	// Each course shows its actual semester number in the SEMESTER column
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
		cumulativeGrade?: string  // Cumulative CGPA-based letter grade (consolidated marksheet)
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
	// Consolidated marksheet layout:
	//   - MAXIMUM / MARKS SECURED collapse from ESE|CIA|TOTAL to a single TOTAL column
	//   - RESULT column is replaced by a per-course MONTH & YEAR column
	//   - PART column is hidden for PG (kept for UG)
	consolidatedLayout?: boolean
}

// ============================================================
// CONSTANTS - A4 DIMENSIONS AND LAYOUT
// ============================================================

const A4_WIDTH = 210  // mm
const A4_HEIGHT = 297 // mm
const MARGIN = 10     // 10mm (1.0cm) left/right margins
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN  // 190mm

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
 * Convert common Google Drive share-URL forms to the direct-download form
 * that image fetchers can actually load. MyJKKN sometimes stores photos as
 * Drive share links and the raw URL won't render as an image.
 *
 *   https://drive.google.com/file/d/{ID}/view?...   → https://drive.google.com/uc?export=view&id={ID}
 *   https://drive.google.com/open?id={ID}            → https://drive.google.com/uc?export=view&id={ID}
 *
 * Same logic the /pre-exam/hall-tickets page uses for student photos.
 */
function convertGoogleDriveUrl(url: string): string {
	if (!url) return url
	const fileIdMatch = url.match(/\/file\/d\/([^\/?#]+)/)
	if (fileIdMatch) {
		return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`
	}
	const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
	if (openMatch) {
		return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`
	}
	return url
}

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

		// Normalise Google Drive share links to direct-download form so the
		// image API can actually fetch the bytes.
		url = convertGoogleDriveUrl(url)

		// Use server-side API to fetch and convert image (bypasses CORS)
		const apiUrl = `/api/utils/image-to-base64?url=${encodeURIComponent(url)}`

		// Retry on 429 (rate limit). Batch reports fetch many photos; if any layer
		// throttles, back off and retry instead of silently dropping the photo.
		const MAX_ATTEMPTS = 4
		let response: Response | null = null
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			response = await fetch(apiUrl)

			if (response.status !== 429) break

			// Honour Retry-After when present, else exponential backoff (0.5s, 1s, 2s)
			const retryAfterHeader = response.headers.get('Retry-After')
			const retryAfterMs = retryAfterHeader
				? Number(retryAfterHeader) * 1000
				: 500 * Math.pow(2, attempt)
			console.warn(`Image fetch rate-limited (429), retry ${attempt + 1}/${MAX_ATTEMPTS} in ${retryAfterMs}ms`)
			await new Promise(resolve => setTimeout(resolve, retryAfterMs))
		}

		if (!response || !response.ok) {
			console.warn('Failed to fetch image via API:', response?.status)
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
 * Generate folio number placeholder (used when folio is not assigned from database)
 * NOTE: Folio numbers should be assigned from database via folio_sequences table.
 * This function is kept for backward compatibility but should show a placeholder.
 * @deprecated Use database-assigned folio numbers instead
 */
function generateFolioPlaceholder(): string {
	return '-'  // Show dash when folio not assigned from database
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
export function addStudentMarksheetToDoc(
	doc: jsPDF,
	data: StudentMarksheetData,
	options: MarksheetPDFOptions = {}
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	let currentY = MARGIN

	// Determine if this is a PG program — used for passing minimum (50% vs 40%)
	const isPG = data.program.isPG || isPGProgram(data.program.code, data.program.name)

	// Consolidated layout: single MAXIMUM / MARKS SECURED columns + MONTH & YEAR column.
	const consolidated = options.consolidatedLayout === true

	// PG marksheets (both semester and consolidated) drop the PART column entirely.
	// UG keeps Part I-V.
	const hidePartColumn = isPG

	// ========== OFFICIAL JKKN HEADER (Optional) ==========

	// Only show header if showHeader option is true
	if (options.showHeader) {
		// College Logo (left side) - 16x16mm
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', MARGIN, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}

		// Institution name (centered, bold) - Times font
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

		// Accreditation text (2 lines) - Times font
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

		currentY += 13

		// Address - Times bold
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

		currentY += 5

		// CHOICE BASED CREDIT SYSTEM - Line 1
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text('CHOICE BASED CREDIT SYSTEM', pageWidth / 2, currentY, { align: 'center' })

		currentY += 4

		// Regulation info - Line 2
		const regulationText = data.regulation?.name ? `(${data.regulation.name})` : ''
		if (regulationText) {
			doc.setFont('times', 'normal')
			doc.setFontSize(9)
			doc.text(regulationText, pageWidth / 2, currentY, { align: 'center' })
			currentY += 4
		}

		// GRADE CARD title
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.text('GRADE CARD', pageWidth / 2, currentY, { align: 'center' })

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
	const photoWidth = 27   // 2.8cm
	const photoHeight = 32  // 3.5cm

	// Photo position - immediately after margin (top right)
	const photoBoxX = pageWidth - MARGIN - photoWidth  // Right aligned
	const photoBoxY = MARGIN  // Immediately after margin

	// No photo border - photo is displayed directly without a box frame

	// Add student photo if available (must be base64 data URI)
	// Photo fills the entire area without border
	console.log('[PDF Generator] photoUrl received:', data.student.photoUrl ? `${data.student.photoUrl.substring(0, 50)}... (${data.student.photoUrl.length} chars)` : 'null/undefined')
	console.log('[PDF Generator] showPhoto option:', options.showPhoto)
	if (data.student.photoUrl && options.showPhoto !== false) {
		try {
			// Photo fills the entire box (no padding)
			const photoX = photoBoxX + 1  // 1mm right nudge
			const photoY = photoBoxY - 1  // 1mm up nudge
			const imgWidth = photoWidth
			const imgHeight = photoHeight

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
	currentY = MARGIN + 35 - 2   // Photo (35mm) + gap, shifted 2mm up

	// Table layout - 4 columns, full width
	const rowHeight = 7  // JasperReports: 19pt = 7mm
	const infoTableHeight = 3 * rowHeight // 3 rows

	// Column widths from JasperReports (converted from points to mm)
	// JRXML line positions: x=134pt, x=368pt, x=456pt, total width=555pt
	// Col1: 134pt=47mm, Col2: 234pt=83mm, Col3: 88pt=31mm, Col4: 99pt=35mm
	const col1 = 46  // Label 1 (NAME OF THE CANDIDATE, REGISTER NO, PROGRAMME)
	const col2 = 75  // Value 1 (student name, regno, program)
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
	doc.text(data.summary.folio || generateFolioPlaceholder(), x + 2, y + 5)

	// Move past the table (no gap - tables are joined)
	currentY = infoBoxY + infoTableHeight

	// ========== COURSE DETAILS TABLE WITH VERTICAL HEADERS ==========

	// For UG: PART | SEMESTER | COURSE CODE | COURSE TITLE | CREDITS | MAXIMUM (ESE/CIA/TOTAL) | MARKS SECURED (ESE/CIA/TOTAL) | GRADE POINT | GRADE | RESULT
	// For PG: No PART column - SEMESTER | COURSE CODE | COURSE TITLE | CREDITS | MAXIMUM (ESE/CIA/TOTAL) | MARKS SECURED (ESE/CIA/TOTAL) | GRADE POINT | GRADE | RESULT

	// Column widths for course table - must sum to CONTENT_WIDTH (194mm)
	// UG: 14 columns with PART
	// PG: 13 columns without PART (TITLE column gets extra width)
	const colWidths = consolidated
		? (hidePartColumn
			? [8, 20, 93, 7, 12, 12, 12, 12, 14]        // PG consolidated: 9 cols (no PART)
			: [8, 8, 20, 85, 7, 12, 12, 12, 12, 14])    // UG consolidated: 10 cols (with PART)
		: (hidePartColumn
			? [6, 20, 95, 6, 6, 6, 7, 7, 7, 7, 7, 7, 9]  // 13 columns = 190mm (no PART)
			: [6, 6, 20, 89, 6, 6, 6, 7, 7, 7, 7, 7, 7, 9])  // 14 columns = 190mm (with PART)

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
	// Consolidated layout has NO split sub-columns, so these sentinels (-1)
	// disable the "internal line" and spanning-header logic below.
	const maxColStartIdx = consolidated ? -1 : (hidePartColumn ? 4 : 5)  // Index where MAXIMUM columns start
	const maxColEndIdx = consolidated ? -1 : (hidePartColumn ? 6 : 7)    // Index where MAXIMUM columns end
	const securedColStartIdx = consolidated ? -1 : (hidePartColumn ? 7 : 8)  // Index where MARKS SECURED columns start
	const securedColEndIdx = consolidated ? -1 : (hidePartColumn ? 9 : 10)   // Index where MARKS SECURED columns end

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

	// Draw horizontal line ONLY under MAXIMUM / MARKS SECURED columns.
	// Consolidated layout uses single columns, so there is no spanning sub-header.
	if (!consolidated) {
		doc.line(maxStartX, currentY + row1Height, maxEndX, currentY + row1Height)
		doc.line(secStartX, currentY + row1Height, secEndX, currentY + row1Height)
	}

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
	// Semester UG: [PART, SEMESTER, COURSE CODE, COURSE TITLE, CREDITS, ESE, CIA, TOTAL, ESE, CIA, TOTAL, GRADE POINT, GRADE, RESULT]
	// Semester PG: same without PART
	// Consolidated: MAXIMUM MARK + MARKS SECURED are single columns; RESULT → MONTH & YEAR
	const headerTexts = consolidated
		? (hidePartColumn
			? ['SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'MAXIMUM MARK', 'MARKS SECURED', 'GRADE POINT', 'GRADE', 'MONTH & YEAR']
			: ['PART', 'SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'MAXIMUM MARK', 'MARKS SECURED', 'GRADE POINT', 'GRADE', 'MONTH & YEAR'])
		: (hidePartColumn
			? ['SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'ESE', 'CIA', 'TOTAL', 'ESE', 'CIA', 'TOTAL', 'GRADE POINT', 'GRADE', 'RESULT']
			: ['PART', 'SEMESTER', 'COURSE CODE', 'COURSE TITLE', 'CREDITS', 'ESE', 'CIA', 'TOTAL', 'ESE', 'CIA', 'TOTAL', 'GRADE POINT', 'GRADE', 'RESULT'])

	// Draw "MAXIMUM" and "MARKS SECURED" spanning headers (row 1) — semester layout only.
	// Consolidated layout uses single columns, so these span-labels are skipped.
	if (!consolidated) {
		const maxColStart = hidePartColumn ? 4 : 5  // Index where MAXIMUM columns start
		const securedColStart = hidePartColumn ? 7 : 8  // Index where MARKS SECURED columns start

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
	}

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
		} else if (consolidated && (text === 'MAXIMUM MARK' || text === 'MARKS SECURED')) {
			// Consolidated: two rotated (bottom-to-top) lines side by side
			// e.g. "MAXIMUM" | "MARK",  "MARKS" | "SECURED"
			doc.setFontSize(8)
			const words = text.split(' ')
			const line1 = words[0]
			const line2 = words.slice(1).join(' ')
			drawVerticalText(line1, cellCenterX - 2, fullHeaderCenterY)
			drawVerticalText(line2, cellCenterX + 2, fullHeaderCenterY)
		} else if (text === 'PART') {
			// PART uses font size 8 per JRXML - MIDDLE ALIGN & CENTRE in full header
			doc.setFontSize(8)
			drawVerticalText(text, cellCenterX, fullHeaderCenterY)
		} else {
			// Draw vertical text for other columns (SEMESTER, CREDITS, GRADE POINT, GRADE, RESULT/MONTH & YEAR)
			// Consolidated labels (MAXIMUM MARK / MARKS SECURED / MONTH & YEAR) are longer, so drop to
			// font size 8 to keep the rotated text within the 25mm header band.
			doc.setFontSize(consolidated && text.length > 9 ? 8 : 9)
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
	// IMPORTANT: Courses from different semesters are supported (current + arrear papers)
	const body: RowInput[] = data.courses.map(course => {
		// Use enhanced result status (handles absent, malpractice, ineligible, etc.)
		const resultStatus = getEnhancedResultStatus(course)
		const displayGradePoint = course.isAbsent ? '0' : (course.gradePoint > 0 ? course.gradePoint.toFixed(1) : '0')
		const displayGrade = course.isAbsent ? 'AAA' : course.letterGrade
		// PART column:
		//   UG with Part I-V → roman numeral (I, II, III, IV, V)
		//   PG with Part A/B → letter (A, B)
		//   Otherwise → "-"
		const partDisplay = course.part ? partToRoman(course.part) : '-'

		// All courses display with white background (no visual distinction for arrears)
		// Sorting ensures arrears appear first, grouped by semester
		const baseStyles = {
			halign: 'center' as const,
			fontSize: 8
		}
		const leftAlignStyles = {
			halign: 'left' as const,
			fontSize: 8
		}

		// For comment/status/credit result types: merge the 9 mark columns (ESE_MAX through RESULT)
		// into a single cell showing the grade text
		const isSpecialType = course.resultType === 'comment' || course.resultType === 'credit' || course.resultType === 'Status'
		if (isSpecialType) {
			// Determine display text
			let mergedText: string
			if (course.resultType === 'comment') {
				mergedText = course.letterGrade || '-'
			} else if (course.resultType === 'credit') {
				// Credit-type courses (e.g. Extension Activity): the credit is already shown
				// in the CREDITS column, so blank the mark area with "-" on both the semester
				// and consolidated marksheets.
				mergedText = '-'
			} else {
				// Status
				mergedText = course.passStatus || course.letterGrade || '-'
			}

			const mergedCell = {
				content: mergedText,
				// Consolidated: merge only the 4 mark cols (MAX MARK, SECURED, GP, GRADE) so the
				// MONTH & YEAR column stays separate; semester keeps the 9 split mark columns.
				colSpan: consolidated ? 4 : 9,
				styles: {
					halign: 'center' as const,
					fontSize: 8,
					fillColor: [255, 255, 255] as [number, number, number]
				}
			}

			const specialCommonCols = [
				{ content: toRoman(course.semester), styles: baseStyles },
				{ content: course.courseCode, styles: leftAlignStyles },
				{ content: course.courseName.toUpperCase(), styles: leftAlignStyles },
				{ content: course.credits.toString(), styles: baseStyles },
				mergedCell,
				// Consolidated keeps the per-course MONTH & YEAR alongside the merged status cell.
				...(consolidated ? [{ content: course.monthYear || '-', styles: baseStyles }] : [])
			]

			if (hidePartColumn) {
				return specialCommonCols
			} else {
				return [
					{ content: partDisplay, styles: baseStyles },
					...specialCommonCols
				]
			}
		}

		// CIA-only (internal-only) courses have no ESE component; ESE-only courses have no CIA.
		// Show "-" for the non-applicable component instead of "0" in both MAXIMUM and SECURED.
		const isCiaOnly = course.eseMax === 0 && course.ciaMax > 0
		const isEseOnly = course.ciaMax === 0 && course.eseMax > 0

		const eseMaxText = isCiaOnly ? '-' : course.eseMax.toString()
		const ciaMaxText = isEseOnly ? '-' : course.ciaMax.toString()
		const eseSecuredText = isCiaOnly ? '-' : (course.isAbsent ? 'AAA' : course.eseMarks.toString())
		const ciaSecuredText = isEseOnly ? '-' : course.ciaMarks.toString()

		const commonCols = consolidated
			? [
				{ content: toRoman(course.semester), styles: baseStyles },
				{ content: course.courseCode, styles: leftAlignStyles },
				{ content: course.courseName.toUpperCase(), styles: leftAlignStyles },
				{ content: course.credits.toString(), styles: baseStyles },
				// MAXIMUM MARK — single TOTAL value
				{ content: course.totalMax.toString(), styles: baseStyles },
				// MARKS SECURED — single TOTAL value
				{ content: course.isAbsent ? 'AAA' : course.totalMarks.toString(), styles: baseStyles },
				{ content: displayGradePoint, styles: baseStyles },
				{ content: displayGrade, styles: baseStyles },
				// MONTH & YEAR (per-course examination session) replaces RESULT
				{ content: course.monthYear || '-', styles: baseStyles }
			]
			: [
				{ content: toRoman(course.semester), styles: baseStyles },
				{ content: course.courseCode, styles: leftAlignStyles },
				{ content: course.courseName.toUpperCase(), styles: leftAlignStyles },
				{ content: course.credits.toString(), styles: baseStyles },
				{ content: eseMaxText, styles: baseStyles },
				{ content: ciaMaxText, styles: baseStyles },
				{ content: course.totalMax.toString(), styles: baseStyles },
				{ content: eseSecuredText, styles: baseStyles },
				{ content: ciaSecuredText, styles: baseStyles },
				{ content: course.isAbsent ? 'AAA' : course.totalMarks.toString(), styles: baseStyles },
				{ content: displayGradePoint, styles: baseStyles },
				{ content: displayGrade, styles: baseStyles },
				{ content: resultStatus, styles: baseStyles }
			]

		// Hide PART column when there's no part data (typical PG semester case),
		// else include it at the beginning (UG + PG-consolidated case).
		if (hidePartColumn) {
			return commonCols
		} else {
			return [
				{ content: partDisplay, styles: baseStyles },
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
	const courseCodeColIdx = hidePartColumn ? 1 : 2
	const courseTitleColIdx = hidePartColumn ? 2 : 3
	const columnStyles: Record<number, any> = {}
	colWidths.forEach((width, i) => {
		columnStyles[i] = {
			cellWidth: width,
			// CODE and TITLE columns = left aligned; rest = center
			halign: (i === courseCodeColIdx || i === courseTitleColIdx) ? 'left' : 'center',
			// Enable text wrap for COURSE CODE and COURSE TITLE columns (so long codes never truncate)
			overflow: (i === courseCodeColIdx || i === courseTitleColIdx) ? 'linebreak' : 'ellipsize'
		}
	})

	// ===== DRAW FIXED HEIGHT OUTER BORDER FOR SUBJECT TABLE =====
	// Calculate height based on fixed positions to ensure 2mm gap before footnotes
	// Footnotes at fixed Y position: A4_HEIGHT - MARGIN - 33 = 254mm from top (increased 2mm)
	const footnoteYTarget = A4_HEIGHT - MARGIN - 32  // 254mm
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
		startY: currentY + 2,  // 2mm gap before first course row
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
			minCellHeight: 3  // Reduced from 6 to 4 for single line spacing
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
		tableWidth: 'wrap',
		// Merged status/comment/credit cells (e.g. "Highly Commended", "-") span several
		// columns. The subject-table column dividers are drawn full-height BEFORE the body,
		// so they show through the merged cell. Paint white over the cell interior (leaving
		// its left/right borders intact) just before the label is drawn, hiding those
		// internal divider segments.
		willDrawCell: (hookData: any) => {
			if (hookData.section === 'body' && hookData.cell?.colSpan > 1) {
				const c = hookData.cell
				doc.setFillColor(255, 255, 255)
				doc.rect(c.x + 0.4, c.y, c.width - 0.8, c.height, 'F')
			}
		}
	})

	// "END OF THE STATEMENT" marker centred below the last course row
	// (shown on both the semester and consolidated marksheets).
	{
		const finalY = (doc as any).lastAutoTable?.finalY ?? (currentY + 4)
		const endText = '--- END OF THE STATEMENT ---'
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(8)
		doc.setTextColor(...COLORS.black)
		doc.text(endText, MARGIN + CONTENT_WIDTH / 2, finalY + 4, { align: 'center' })
	}

	// Move past the fixed height subject table (NO GAP - tables are joined)
	currentY = subjectTableStartY + subjectTableFixedHeight

	// ========== GPA SUMMARY ==========
	// UG: Show PART, CREDITS EARNED, GPA with part-wise breakdown
	// PG: Show only CREDITS EARNED and GPA (total only, no PART column)

	if (data.partBreakdown && data.partBreakdown.length > 0) {
		// ===== GPA SUMMARY TABLE (Joined to subject table - JRXML style) =====
		// JRXML: x="3" y="633" width="548" height="80" → 80pt = ~28mm
		const gpaTableFixedHeight = 29  // Fixed height in mm (from JRXML 80pt)
		const gpaTableStartY = currentY

		// Draw outer border rectangle (fixed height) - joins with subject table above - THICK border
		doc.setDrawColor(...COLORS.black)
		doc.setLineWidth(0.5)  // Thick outer border
		doc.rect(MARGIN, gpaTableStartY, CONTENT_WIDTH, gpaTableFixedHeight)

		// Line 1: summary title — consolidated shows whole-programme performance,
		// semester shows the current-semester performance.
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(8)
		doc.setTextColor(...COLORS.black)
		doc.text(consolidated ? 'PERFORMANCE IN THE PROGRAMME' : '(IN THE CURRENT SEMESTER)', MARGIN + 2, gpaTableStartY + 4)

		// Show PART, CREDITS EARNED, GPA (consolidated omits the GPA column)
		const gpaHeaderY = gpaTableStartY + 8
		doc.text('PART', MARGIN + 8, gpaHeaderY)
		doc.text('CREDITS EARNED', MARGIN + 25, gpaHeaderY)
		if (!consolidated) doc.text('GPA', MARGIN + 65, gpaHeaderY)

		// Data rows - values center aligned
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		let gpaRowY = gpaHeaderY + 4

		const partsWithData = data.partBreakdown.filter(part => part.courses.length > 0)

		if (partsWithData.length > 0) {
			// Has part-wise breakdown - show each part
			partsWithData.forEach((part, idx) => {
				const rowY = gpaRowY + (idx * 4)  // 4mm row height

				// PART - centered under PART header
				//   UG with Part I-V → roman numeral (I, II, III, IV, V)
				//   PG with Part A/B → letter (A, B)
				//   Otherwise → "-"
				const partText = part.partName ? partToRoman(part.partName) : '-'
				const partTextWidth = doc.getTextWidth(partText)
				doc.text(partText, MARGIN + 13 - partTextWidth / 2, rowY)

				// CREDITS EARNED
				const creditsText = part.creditsEarned.toString()
				const creditsTextWidth = doc.getTextWidth(creditsText)
				doc.text(creditsText, MARGIN + 38 - creditsTextWidth / 2, rowY)

				// GPA (omitted on the consolidated marksheet)
				if (!consolidated) {
					const gpaText = part.partGPA.toFixed(2)
					const gpaTextWidth = doc.getTextWidth(gpaText)
					doc.text(gpaText, MARGIN + 68 - gpaTextWidth / 2, rowY)
				}
			})

			// ===== TOTAL ROW (after the last part) =====
			// Sums credits earned across all parts (e.g. Part A 82 + Part B 10 = 92).
			// The GPA column shows CGPA to 3 decimals (no per-part GPA for the total).
			// The semester marksheet omits this Total row entirely — it is only
			// shown on the consolidated marksheet (where it carries the CGPA).
			const totalRowY = gpaRowY + (partsWithData.length * 4)
			const totalCredits = partsWithData.reduce((sum, part) => sum + (part.creditsEarned || 0), 0)
			const cgpaValue = (data.summary.cgpa ?? data.summary.semesterGPA ?? 0)

			if (consolidated) {
				doc.setFont('helvetica', 'bold')

				// PART column → "Total"
				doc.text('Total', MARGIN + 8, totalRowY)

				// Total CREDITS EARNED
				const totalCreditsText = totalCredits.toString()
				const totalCreditsWidth = doc.getTextWidth(totalCreditsText)
				doc.text(totalCreditsText, MARGIN + 38 - totalCreditsWidth / 2, totalRowY)

				// Consolidated: overall CGPA shown as a labelled value to the right,
				// vertically level with the first data row (Part A) — e.g. "CGPA: 6.000"
				doc.setFontSize(9)
				doc.text(`CGPA: ${cgpaValue.toFixed(3)}`, MARGIN + 85, gpaRowY)

				// Cumulative GRADE + CLASSIFICATION (from cgpa_grade_system) below the CGPA
				const cumGrade = (data.summary.cumulativeGrade || '').trim()
				const cumClass = (data.summary.classGrade || '').trim()
				if (cumGrade || cumClass) {
					doc.setFontSize(8)
					const gradeLine = cumGrade
						? `CUMULATIVE GRADE: ${cumGrade}${cumClass ? '  —  ' + cumClass.toUpperCase() : ''}`
						: cumClass.toUpperCase()
					doc.text(gradeLine, MARGIN + 85, gpaRowY + 5)
				}

				doc.setFont('helvetica', 'normal')
			}
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

			// GPA (omitted on the consolidated marksheet)
			if (!consolidated) {
				const gpaText = (data.summary.semesterGPA || 0).toFixed(2)
				const gpaTextWidth = doc.getTextWidth(gpaText)
				doc.text(gpaText, MARGIN + 68 - gpaTextWidth / 2, rowY)
			}
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

	const footnoteY = A4_HEIGHT - MARGIN - 28

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(7)
	doc.setTextColor(...COLORS.black)

	// Different passing minimum for UG (40%) vs PG (50%)
	const passingMinimum = isPG ? '50%' : '40%'
	const footnote = `Passing Minimum is ${passingMinimum} of Maximum (in ESE and Total separately) P: Pass, RA: Re-Appear, AAA: Absent, ESE: End Semester Examination,CIA: Continuous Internal Assessment, GPA: Grade Points Average, ***Not Secured Passing Minimum.`
	const splitNote = doc.splitTextToSize(footnote, CONTENT_WIDTH)
	// The consolidated marksheet omits this passing-minimum legend.
	if (!consolidated) {
		doc.text(splitNote, MARGIN, footnoteY)
	}

	// ========== DATE (Only for PDF without header - pre-printed sheets have the date field) ==========

	if (!options.showHeader) {
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
		const dateY = footnoteY + (splitNote.length * footnoteLineHeight) + 6  // 1.5mm gap after footnote
		doc.text(dateStr, MARGIN + 31, dateY)
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
