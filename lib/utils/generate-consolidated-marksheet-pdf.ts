/**
 * Consolidated Mark Sheet PDF Generator
 *
 * Reuses the EXACT same A4 portrait layout as the semester marksheet —
 * photo top-right, three-row header grid, course table with split
 * MAXIMUM / MARKS SECURED (ESE | CIA | TOTAL) columns, and a
 * part-wise CREDITS EARNED / GPA footer table.
 *
 * Differences vs semester:
 * - Folio shows the consolidated folio (CJU24UC0001 / CAP26PC0001 etc.)
 * - MONTH & YEAR shows the LAST APPEARANCE session
 * - Course list includes EVERY semester (not just one)
 * - Footer GPA labels read "GPA" but the values are cumulative
 * - Optional QR code embedded for share-link verification
 *
 * The semester layout already handles multi-semester course tables
 * (it includes arrear papers from previous semesters), so the same
 * function works for fully-consolidated data.
 */

import jsPDF from 'jspdf'
import {
	addStudentMarksheetToDoc,
	fetchImageAsBase64,
	type StudentMarksheetData,
	type MarksheetCourse,
	type PartBreakdown as SemPartBreakdown,
	type MarksheetPDFOptions
} from './generate-semester-marksheet-pdf'

// Re-export the image helper so consumers don't have to import two modules
export { fetchImageAsBase64 }

// ============================================================
// TYPES — consolidated-specific data shape
// ============================================================

export interface ConsolidatedMarksheetCourse {
	courseCode: string
	courseName: string
	part: string
	partDescription?: string
	semester: number
	semesterCode?: string
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
	monthYear?: string
	resultType?: string
	passStatus?: string
}

export interface ConsolidatedPartBreakdown {
	partName: string
	partDescription: string
	courses: ConsolidatedMarksheetCourse[]
	totalCredits: number
	totalCreditPoints: number
	partCGPA: number
	creditsEarned: number
	classification: string
}

export interface ConsolidatedStudentMarksheetData {
	student: {
		id: string
		name: string
		registerNo: string
		dateOfBirth?: string
		photoUrl?: string
		firstName?: string
		lastName?: string
		fatherName?: string
		motherName?: string
		gender?: string
		admissionYear?: string
	}
	program: {
		code: string
		name: string
		isPG?: boolean
	}
	lastAppearance?: {
		sessionId?: string | null
		sessionName?: string
		monthYear?: string
		month?: string
		year?: string
	}
	institution?: {
		name: string
		code: string
	}
	courses: ConsolidatedMarksheetCourse[]
	partBreakdown: ConsolidatedPartBreakdown[]
	summary: {
		totalCourses: number
		totalCredits: number
		creditsEarned: number
		totalCreditPoints: number
		cgpa: number
		overallResult: string
		classification: string
		formattedFolio?: string | null
	}
	logoImage?: string
	generatedDate?: string
	qrCode?: string
	shareUrl?: string
}

export interface ConsolidatedMarksheetPDFOptions {
	showHeader?: boolean
	showPhoto?: boolean
	showQRCode?: boolean
}

// ============================================================
// ADAPTER — map consolidated data to the semester PDF data shape
// ============================================================

function toSemesterData(c: ConsolidatedStudentMarksheetData): StudentMarksheetData {
	const lastMonthYear = c.lastAppearance?.monthYear
		|| (c.lastAppearance?.month && c.lastAppearance?.year
			? `${c.lastAppearance.month}-${c.lastAppearance.year}`
			: '')

	const highestSemester = c.courses.reduce(
		(max, crs) => (crs.semester > max ? crs.semester : max),
		0
	)

	const mappedCourses: MarksheetCourse[] = c.courses.map(crs => ({
		courseCode: crs.courseCode,
		courseName: crs.courseName,
		part: crs.part,
		partDescription: crs.partDescription,
		semester: crs.semester,
		courseOrder: crs.courseOrder,
		credits: crs.credits,
		eseMax: crs.eseMax,
		ciaMax: crs.ciaMax,
		totalMax: crs.totalMax,
		eseMarks: crs.eseMarks,
		ciaMarks: crs.ciaMarks,
		totalMarks: crs.totalMarks,
		percentage: crs.percentage,
		gradePoint: crs.gradePoint,
		letterGrade: crs.letterGrade,
		creditPoints: crs.creditPoints,
		isPassing: crs.isPassing,
		result: crs.result,
		resultType: crs.resultType,
		passStatus: crs.passStatus,
		creditValue: crs.credits,
		monthYear: crs.monthYear   // per-course examination MONTH & YEAR (consolidated column)
	}))

	// Map consolidated part breakdown → semester PartBreakdown shape
	// The semester layout reads `partGPA` (not `partCGPA`) — supply both names.
	const mappedPartBreakdown = c.partBreakdown.map(p => {
		const adapted: SemPartBreakdown & { partCGPA?: number } = {
			partName: p.partName,
			partDescription: p.partDescription,
			courses: p.courses.map(crs => ({
				courseCode: crs.courseCode,
				courseName: crs.courseName,
				part: crs.part,
				semester: crs.semester,
				courseOrder: crs.courseOrder,
				credits: crs.credits,
				eseMax: crs.eseMax,
				ciaMax: crs.ciaMax,
				totalMax: crs.totalMax,
				eseMarks: crs.eseMarks,
				ciaMarks: crs.ciaMarks,
				totalMarks: crs.totalMarks,
				percentage: crs.percentage,
				gradePoint: crs.gradePoint,
				letterGrade: crs.letterGrade,
				creditPoints: crs.creditPoints,
				isPassing: crs.isPassing,
				result: crs.result
			})),
			totalCredits: p.totalCredits,
			totalCreditPoints: p.totalCreditPoints,
			partGPA: p.partCGPA,         // semester layout reads partGPA
			partCGPA: p.partCGPA,        // kept for reference
			creditsEarned: p.creditsEarned
		} as any
		return adapted
	})

	return {
		student: c.student,
		semester: highestSemester || 1,
		session: {
			id: c.lastAppearance?.sessionId || '',
			name: c.lastAppearance?.sessionName || 'CONSOLIDATED',
			monthYear: lastMonthYear
		},
		program: c.program,
		institution: c.institution,
		courses: mappedCourses,
		partBreakdown: mappedPartBreakdown,
		summary: {
			totalCourses: c.summary.totalCourses,
			totalCredits: c.summary.totalCredits,
			creditsEarned: c.summary.creditsEarned,
			totalCreditPoints: c.summary.totalCreditPoints,
			// In the consolidated card the GPA/CGPA in every row is cumulative.
			semesterGPA: c.summary.cgpa,
			cgpa: c.summary.cgpa,
			passedCount: c.courses.filter(crs => crs.isPassing).length,
			failedCount: c.courses.filter(crs => !crs.isPassing).length,
			overallResult: c.summary.overallResult,
			folio: c.summary.formattedFolio || '',
			classGrade: c.summary.classification
		},
		qrCode: c.qrCode,
		logoImage: c.logoImage,
		generatedDate: c.generatedDate
	}
}

// ============================================================
// PUBLIC API — same surface as before, now delegates to semester layout
// ============================================================

export function generateConsolidatedMarksheetPDF(
	data: ConsolidatedStudentMarksheetData,
	options: ConsolidatedMarksheetPDFOptions = {}
): string {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const semData = toSemesterData(data)
	const semOptions: MarksheetPDFOptions = {
		showHeader: options.showHeader,
		showPhoto: options.showPhoto !== false,
		showQRCode: options.showQRCode !== false,
		consolidatedLayout: true
	}
	addStudentMarksheetToDoc(doc, semData, semOptions)
	return doc.output('datauristring')
}

export function downloadConsolidatedMarksheetPDF(
	data: ConsolidatedStudentMarksheetData,
	filename?: string,
	options: ConsolidatedMarksheetPDFOptions = {}
): void {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const semData = toSemesterData(data)
	const semOptions: MarksheetPDFOptions = {
		showHeader: options.showHeader,
		showPhoto: options.showPhoto !== false,
		showQRCode: options.showQRCode !== false,
		consolidatedLayout: true
	}
	addStudentMarksheetToDoc(doc, semData, semOptions)
	const fname = filename || `Consolidated_Marksheet_${data.student.registerNo}.pdf`
	doc.save(fname)
}

export function generateMergedConsolidatedMarksheetPDF(
	students: ConsolidatedStudentMarksheetData[],
	options: ConsolidatedMarksheetPDFOptions = {}
): string {
	if (students.length === 0) {
		throw new Error('No learners provided for merged consolidated PDF')
	}
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const semOptions: MarksheetPDFOptions = {
		showHeader: options.showHeader,
		showPhoto: options.showPhoto !== false,
		showQRCode: options.showQRCode !== false,
		consolidatedLayout: true
	}
	students.forEach((c, index) => {
		if (index > 0) doc.addPage()
		addStudentMarksheetToDoc(doc, toSemesterData(c), semOptions)
	})
	return doc.output('datauristring')
}

export function downloadMergedConsolidatedMarksheetPDF(
	students: ConsolidatedStudentMarksheetData[],
	filename?: string,
	options: ConsolidatedMarksheetPDFOptions = {}
): void {
	if (students.length === 0) {
		throw new Error('No learners provided for merged consolidated PDF')
	}
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const semOptions: MarksheetPDFOptions = {
		showHeader: options.showHeader,
		showPhoto: options.showPhoto !== false,
		showQRCode: options.showQRCode !== false,
		consolidatedLayout: true
	}
	students.forEach((c, index) => {
		if (index > 0) doc.addPage()
		addStudentMarksheetToDoc(doc, toSemesterData(c), semOptions)
	})
	const fname = filename || `Consolidated_Marksheets_Merged_${students.length}_learners.pdf`
	doc.save(fname)
}
