import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	Table,
	TableRow,
	TableCell,
	WidthType,
	AlignmentType,
	ImageRun,
	BorderStyle,
	VerticalAlign,
	TableLayoutType,
	PageBreak,
	HeightRule,
} from 'docx'
import type { PassPercentageReport } from '@/types/pass-percentage'

// UG / PG degree subtitle lines (mirror the PDF)
const UG_DEGREES = 'BA / B.Sc / B.Com / B.Com CA / BBA / BCA DEGREE EXAMINATIONS'
const PG_DEGREES = 'MA / M.Sc / M.Com / MCA / MBA DEGREE EXAMINATIONS'

const FONT = 'Times New Roman'
// Cell padding (twips) ~= the PDF's 2mm cell padding, for matching line spacing
const CELL_MARGINS = { top: 60, bottom: 60, left: 110, right: 110 }
const ROW_HEIGHT = { value: 360, rule: HeightRule.ATLEAST }

interface WordOptions {
	reports: PassPercentageReport[]
	reportType: 'board' | 'program'
	logoImage?: string
	rightLogoImage?: string
	// Kept for API compatibility — the Word export is always the course-wise summary
	summaryOnly?: boolean
}

// ─── Borders ─────────────────────────────────────────────
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const GRID_BORDERS = {
	top: LINE, bottom: LINE, left: LINE, right: LINE,
	insideHorizontal: LINE, insideVertical: LINE,
}
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = {
	top: NONE, bottom: NONE, left: NONE, right: NONE,
	insideHorizontal: NONE, insideVertical: NONE,
}

// Decode a base64 data URI to bytes for embedding (docx ImageRun needs raw bytes)
function dataUriToBytes(dataUri?: string): Uint8Array | undefined {
	if (!dataUri) return undefined
	const idx = dataUri.indexOf('base64,')
	if (idx === -1) return undefined
	try {
		const bin = atob(dataUri.slice(idx + 7))
		const arr = new Uint8Array(bin.length)
		for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
		return arr
	} catch {
		return undefined
	}
}

function buildTitle(report: PassPercentageReport): { title: string; degreeSubtitle: string } {
	if (report.board) {
		const boardType = report.board.board_type?.toUpperCase() || 'UG'
		const boardName = report.board.board_name?.toUpperCase() || ''
		return {
			title: `PASS PERCENTAGE REPORT OF ${boardType} ${boardName} BOARD`,
			degreeSubtitle: boardType === 'PG' ? `(${PG_DEGREES})` : `(${UG_DEGREES})`,
		}
	}
	return { title: 'PASS PERCENTAGE REPORT', degreeSubtitle: '' }
}

function centered(text: string, opts: { bold?: boolean; italics?: boolean; size: number }): Paragraph {
	return new Paragraph({
		alignment: AlignmentType.CENTER,
		spacing: { after: 20 },
		children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size })],
	})
}

function logoParagraph(bytes: Uint8Array | undefined, alignment: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph {
	return new Paragraph({
		alignment,
		children: bytes
			? [new ImageRun({ type: 'png', data: bytes, transformation: { width: 60, height: 60 } })]
			: [],
	})
}

// 3-column header: left logo | centered college text | right logo
function headerTable(report: PassPercentageReport, left?: Uint8Array, right?: Uint8Array): Table {
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		layout: TableLayoutType.FIXED,
		columnWidths: [1600, 7346, 1600],
		borders: NO_BORDERS,
		rows: [
			new TableRow({
				children: [
					new TableCell({ borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP, children: [logoParagraph(left, AlignmentType.LEFT)] }),
					new TableCell({
						borders: NO_BORDERS,
						verticalAlign: VerticalAlign.TOP,
						children: [
							centered('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', { bold: true, size: 24 }),
							centered('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', { italics: true, size: 13 }),
							centered('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', { bold: true, italics: true, size: 18 }),
						],
					}),
					new TableCell({ borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP, children: [logoParagraph(right, AlignmentType.RIGHT)] }),
				],
			}),
		],
	})
}

function headerCell(text: string, opts: { rowSpan?: number; columnSpan?: number } = {}): TableCell {
	return new TableCell({
		rowSpan: opts.rowSpan,
		columnSpan: opts.columnSpan,
		verticalAlign: VerticalAlign.CENTER,
		margins: CELL_MARGINS,
		children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [new TextRun({ text, bold: true, size: 18 })] })],
	})
}

function bodyCell(text: string, alignment: (typeof AlignmentType)[keyof typeof AlignmentType], keepNext = false): TableCell {
	return new TableCell({
		verticalAlign: VerticalAlign.CENTER,
		margins: CELL_MARGINS,
		children: [new Paragraph({ alignment, keepNext, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [new TextRun({ text, size: 18 })] })],
	})
}

interface SummaryRow { semester: number; code: string; name: string; stu: number; app: number; pas: number; order: number }

function aggregateCourses(report: PassPercentageReport): SummaryRow[] {
	const map = new Map<string, SummaryRow>()
	report.courses.forEach(course => {
		const key = `${course.semester}-${course.course_code}`
		const stu = course.programs.reduce((s, p) => s + p.total_students, 0)
		const app = course.programs.reduce((s, p) => s + p.appeared, 0)
		const pas = course.programs.reduce((s, p) => s + p.passed, 0)
		const existing = map.get(key)
		if (existing) {
			existing.stu += stu; existing.app += app; existing.pas += pas
		} else {
			map.set(key, { semester: course.semester, code: course.course_code, name: course.course_name, stu, app, pas, order: course.course_order ?? 999 })
		}
	})
	return Array.from(map.values()).sort((a, b) => a.semester - b.semester || a.order - b.order || a.code.localeCompare(b.code))
}

function summaryTable(rows: SummaryRow[]): Table {
	const headRow1 = new TableRow({
		tableHeader: true,
		children: [
			headerCell('Semester', { rowSpan: 2 }),
			headerCell('Course Code', { rowSpan: 2 }),
			headerCell('Name of the Course', { rowSpan: 2 }),
			headerCell('Students Strength', { columnSpan: 4 }),
		],
	})
	const headRow2 = new TableRow({
		tableHeader: true,
		children: [headerCell('Total Students'), headerCell('Appeared'), headerCell('Passed'), headerCell('Pass %')],
	})
	const bodyRows = rows.map((r, i) => {
		const pct = r.app > 0 ? Math.round((r.pas / r.app) * 100) : 0
		// Keep the LAST row glued to the signature block (avoids an orphan signature page)
		const isLast = i === rows.length - 1
		return new TableRow({
			height: ROW_HEIGHT,
			cantSplit: true,
			children: [
				bodyCell(String(r.semester), AlignmentType.CENTER, isLast),
				bodyCell(r.code, AlignmentType.CENTER, isLast),
				bodyCell(r.name, AlignmentType.LEFT, isLast),
				bodyCell(String(r.stu), AlignmentType.CENTER, isLast),
				bodyCell(String(r.app), AlignmentType.CENTER, isLast),
				bodyCell(String(r.pas), AlignmentType.CENTER, isLast),
				bodyCell(String(pct), AlignmentType.CENTER, isLast),
			],
		})
	})
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		layout: TableLayoutType.FIXED,
		columnWidths: [950, 1450, 3846, 1100, 1100, 1100, 1000],
		borders: GRID_BORDERS,
		rows: [headRow1, headRow2, ...bodyRows],
	})
}

function signatureTable(): Table {
	const sigs = ['Board Chairman', 'CoE', 'Principal', 'University Nominee']
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		layout: TableLayoutType.FIXED,
		columnWidths: [2636, 2636, 2637, 2637],
		borders: NO_BORDERS,
		rows: [
			new TableRow({
				cantSplit: true,
				children: sigs.map(role => new TableCell({
					borders: NO_BORDERS,
					children: [new Paragraph({
						alignment: AlignmentType.CENTER,
						children: [
							new TextRun({ text: 'Signature of the', bold: true, size: 18 }),
							new TextRun({ text: role, bold: true, size: 18, break: 1 }),
						],
					})],
				})),
			}),
		],
	})
}

// All elements for one board/programme (course-wise summary)
function boardChildren(report: PassPercentageReport, left?: Uint8Array, right?: Uint8Array): (Paragraph | Table)[] {
	const { title, degreeSubtitle } = buildTitle(report)
	const rows = aggregateCourses(report)
	const out: (Paragraph | Table)[] = [
		headerTable(report, left, right),
		new Paragraph({ text: '', spacing: { after: 40 } }),
		centered(title, { bold: true, size: 22 }),
	]
	if (degreeSubtitle) out.push(centered(degreeSubtitle, { size: 18 }))
	out.push(centered(`SEMESTER EXAMINATION - ${report.session.name}`, { bold: true, size: 20 }))
	out.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: 'BOARD-WISE SUMMARY', bold: true, size: 20 })] }))
	out.push(summaryTable(rows))
	// keepNext chains the gap → signature table to the last row above
	out.push(new Paragraph({ text: '', spacing: { before: 500 }, keepNext: true }))
	out.push(signatureTable())
	return out
}

// ─── Build + download a real .docx ───────────────────────
export async function generatePassPercentageWord(options: WordOptions): Promise<string> {
	const { reports, reportType, logoImage, rightLogoImage } = options
	if (!reports.length) return ''

	const left = dataUriToBytes(logoImage)
	const right = dataUriToBytes(rightLogoImage)

	const children: (Paragraph | Table)[] = []
	reports.forEach((report, idx) => {
		// Separate page per board/programme
		if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
		children.push(...boardChildren(report, left, right))
	})

	const doc = new Document({
		styles: { default: { document: { run: { font: FONT } } } },
		sections: [{
			properties: { page: { margin: { top: 680, bottom: 680, left: 680, right: 680 } } },
			children,
		}],
	})

	const blob = await Packer.toBlob(doc)
	const url = URL.createObjectURL(blob)
	const label = reportType === 'board'
		? (reports.length > 1 ? 'all-boards' : reports[0].board?.board_code || 'report')
		: (reports.length > 1 ? 'all-programs' : reports[0].program?.program_code || 'report')
	const fileName = `board-wise-summary-${label}-${new Date().toISOString().slice(0, 10)}.docx`

	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	link.click()
	URL.revokeObjectURL(url)
	return fileName
}
