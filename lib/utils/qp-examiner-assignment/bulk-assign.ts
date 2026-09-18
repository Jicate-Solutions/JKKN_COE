// Bulk examiner assignment for End-Semester question papers — the Excel side.
//
// ONE ROW PER PAPER, by subject code. The workbook is built around the papers
// the CoE has filtered to (regulation, semester, department, subject,
// assignment status), so a download never silently drops or doubles up an
// appointment:
//
//   Assignments   one row per paper in the filter: the examiner, the
//                 assignment type, the fees, the willingness (optional), the
//                 access period and whether to e-mail the order
//   Examiners     who can be appointed, with the e-mail to use
//   How to fill   the rules, and what the filter was
//
// On upload each row becomes ONE of:
//
//   assign            paper has no examiner → appoint
//   assign_new_set    paper is held by SOMEONE ELSE → the previous appointment
//                     is never touched; this examiner gets a fresh set (B, C …)
//   (unchanged)       the row names the examiner who already holds the paper
//                     — nothing to do, counted and skipped
//
// Question content never travels in this file. The examiner writes the paper
// (and, if accepted, the answer key) in the portal.
//
// Everything here is pure: no fetch, no state. The tab owns the network and the
// screens; this file owns the workbook shape and the row → action mapping.

import XLSX from '@/lib/utils/excel-compat'
import type { PaperRow, ExaminerOpt } from '@/app/(coe)/pre-exam/qp-examiner-assignment/shared'
import {
	parseAssignmentType, QP_ASSIGNMENT_TYPE_LABELS,
	type QpExaminerKind, type QpAssignmentType,
} from '@/types/qp-examiner-assignment'
import { componentsForType } from '@/lib/qp-portal/fees'

// ── Column headings (the upload accepts these with or without the " *") ─────

export const BULK_COLUMNS = {
	regulation: 'Regulation',
	courseCode: 'Subject Code *',
	subject: 'Subject Name',
	set: 'Set',
	program: 'Programme',
	semester: 'Semester',
	email: 'Examiner Email *',
	type: 'Assignment Type *',
	qpFee: 'Question Paper Setting (₹)',
	akFee: 'Answer Key (₹)',
	qpWilling: 'Question Paper Willing',
	akWilling: 'Answer Key Willing',
	from: 'Date From (IST) *',
	to: 'Date To (IST) *',
	notes: 'Notes',
	sendEmail: 'Send Order Email',
	status: 'Status',
} as const

export const ASSIGN_SHEET = 'Assignments'
export const EXAMINERS_SHEET = 'Examiners'
export const HELP_SHEET = 'How to fill'

/** The three assignment types as they appear in the dropdown. */
export const TYPE_CELL_VALUES: Record<QpAssignmentType, string> = {
	question_paper: 'Question Paper',
	answer_key: 'Answer Key',
	both: 'Both',
}
const yesNo = (v: boolean | null | undefined) => (v == null ? '' : v ? 'Yes' : 'No')

/** Default clock times when a date is typed without one. */
const DEFAULT_FROM_TIME = '09:00'
const DEFAULT_TO_TIME = '17:00'

const STATUS_LABEL: Record<string, string> = {
	assigned: 'Assigned',
	in_progress: 'In Progress',
	submitted: 'Submitted',
	returned: 'Returned',
	accepted: 'Accepted',
	cancelled: 'Cancelled',
}

/** How a paper reads in the Status column of the template. */
export function paperStatusText(paper: PaperRow, siblings: PaperRow[]): string {
	const history = paper.assignment_history || []
	if (paper.assignment) {
		const who = paper.assignment.examiner_name || paper.assignment.examiner_email || 'an examiner'
		return history.length > 1
			? `Reassigned — now ${who}`
			: `Assigned to ${who} (${STATUS_LABEL[paper.assignment.status] || paper.assignment.status})`
	}
	if (paper.cancelled_assignment_id) {
		return 'Cancelled assignment on record — remove it in Assignments before appointing'
	}
	const other = siblings.find(s => s.paper_id !== paper.paper_id && s.assignment)
	if (other) {
		const who = other.assignment!.examiner_name || other.assignment!.examiner_email || 'another examiner'
		return `Existing Assignment Found — ${who}${other.set_label ? ` (Set ${other.set_label})` : ''}. A second examiner gets a new set.`
	}
	return 'Not assigned'
}

// ── Template ────────────────────────────────────────────────────────────────

export interface TemplateInput {
	sessionCode: string
	sessionName: string
	institutionCode: string
	/** What the filters are set to, printed on the How to fill sheet. */
	filterSummary: string
	/** The papers the filter selected. */
	papers: PaperRow[]
	/** Every paper of the session, so a sibling set's examiner can be named. */
	allPapers: PaperRow[]
	external: ExaminerOpt[]
	internal: ExaminerOpt[]
	/** The applicable fees from Fee Details, pre-filled per row. */
	fees: { qp: number | null; ak: number | null }
	/** A suggested window to pre-fill, as `datetime-local` IST strings. */
	defaultFrom: string
	defaultTo: string
}

/** "2026-09-10T09:00" → "2026-09-10 09:00" — what a person types into Excel. */
const localToCell = (local: string) => local.replace('T', ' ').slice(0, 16)

/** An ISO instant → the IST wall-clock cell text ("2026-09-10 09:00"). */
function isoToCell(iso: string): string {
	const d = new Date(iso)
	if (isNaN(d.getTime())) return ''
	const shifted = new Date(d.getTime() + 330 * 60_000)
	return shifted.toISOString().slice(0, 16).replace('T', ' ')
}

const sortPapers = (a: PaperRow, b: PaperRow) =>
	(a.regulation_code || '').localeCompare(b.regulation_code || '') ||
	a.program_code.localeCompare(b.program_code) ||
	a.semester - b.semester ||
	a.course_code.localeCompare(b.course_code) ||
	a.set_number - b.set_number

// Column letters (single letters only — excel-compat validates by one letter):
//   A Regulation  B Subject Code  C Subject Name  D Set  E Programme  F Semester
//   G Examiner    H Type  I QP fee  J AK fee  K QP willing  L AK willing
//   M Date From   N Date To  O Notes  P Send Email  Q Status
const WIDTHS = [
	{ wch: 11 }, { wch: 14 }, { wch: 36 }, { wch: 6 }, { wch: 11 }, { wch: 9 },
	{ wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
	{ wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 52 },
]

function assignmentRow(paper: PaperRow, input: TemplateInput, siblings: PaperRow[]) {
	const live = paper.assignment
	const type: QpAssignmentType = live?.assignment_type || 'question_paper'
	const c = componentsForType(type)
	return {
		[BULK_COLUMNS.regulation]: paper.regulation_code || '',
		[BULK_COLUMNS.courseCode]: paper.course_code,
		[BULK_COLUMNS.subject]: paper.subject_title,
		[BULK_COLUMNS.set]: paper.set_label || '',
		[BULK_COLUMNS.program]: paper.program_code,
		[BULK_COLUMNS.semester]: paper.semester,
		[BULK_COLUMNS.email]: live?.examiner_email || '',
		[BULK_COLUMNS.type]: TYPE_CELL_VALUES[type],
		[BULK_COLUMNS.qpFee]: c.qp ? input.fees.qp ?? '' : 0,
		[BULK_COLUMNS.akFee]: c.ak ? input.fees.ak ?? '' : 0,
		[BULK_COLUMNS.qpWilling]: live ? yesNo(live.qp_willing) : '',
		[BULK_COLUMNS.akWilling]: live ? yesNo(live.ak_willing) : '',
		[BULK_COLUMNS.from]: live ? isoToCell(live.valid_from) : localToCell(input.defaultFrom),
		[BULK_COLUMNS.to]: live ? isoToCell(live.valid_to) : localToCell(input.defaultTo),
		[BULK_COLUMNS.notes]: '',
		[BULK_COLUMNS.sendEmail]: 'Yes',
		[BULK_COLUMNS.status]: paperStatusText(paper, siblings),
	}
}

function blankRow(status: string) {
	const row: Record<string, any> = {}
	for (const key of Object.values(BULK_COLUMNS)) row[key] = ''
	row[BULK_COLUMNS.sendEmail] = 'Yes'
	row[BULK_COLUMNS.status] = status
	return row
}

export async function downloadBulkAssignTemplate(input: TemplateInput): Promise<void> {
	const wb = XLSX.utils.book_new()

	const byCode = new Map<string, PaperRow[]>()
	for (const p of input.allPapers) {
		const list = byCode.get(p.course_code) || []
		list.push(p)
		byCode.set(p.course_code, list)
	}

	// ── Sheet 1: Assignments — one row per paper ────────────────────────────
	const rows = [...input.papers]
		.sort(sortPapers)
		.map(p => assignmentRow(p, input, byCode.get(p.course_code) || []))
	if (rows.length === 0) rows.push(blankRow('No papers match the current filter'))

	const ws = XLSX.utils.json_to_sheet(rows)
	ws['!cols'] = WIDTHS
	ws['!wrapCols'] = [16]

	const last = Math.max(rows.length + 1, 200)
	const emails = [...new Set([...input.external, ...input.internal].map(e => e.email).filter(Boolean))].sort()
	const validations: any[] = []
	// E-mail addresses never contain a comma, so the list is safe to join.
	if (emails.length > 0) {
		validations.push({
			type: 'list',
			sqref: `G2:G${last}`,
			formula1: `"${emails.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Unknown examiner',
			error: `Pick an e-mail from the ${EXAMINERS_SHEET} sheet`,
		})
	}
	validations.push({
		type: 'list',
		sqref: `H2:H${last}`,
		formula1: `"${Object.values(TYPE_CELL_VALUES).join(',')}"`,
		showDropDown: true,
		showErrorMessage: true,
		errorTitle: 'Invalid assignment type',
		error: 'Question Paper, Answer Key or Both',
	})
	for (const col of ['K', 'L', 'P']) {
		validations.push({
			type: 'list',
			sqref: `${col}2:${col}${last}`,
			formula1: '"Yes,No"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid value',
			error: col === 'P' ? 'Yes or No' : 'Yes or No — or leave blank for the examiner to confirm in the portal',
		})
	}
	ws['!dataValidation'] = validations
	XLSX.utils.book_append_sheet(wb, ws, ASSIGN_SHEET)

	// ── Sheet 2: who can be appointed ───────────────────────────────────────
	const examinerRows: Record<string, any>[] = []
	const pushSection = (title: string) =>
		examinerRows.push({
			'Examiner Type': `═══ ${title} ═══`,
			Name: '',
			'Email (use this in Assignments)': '',
			'Mobile Number': '',
			Designation: '',
			Department: '',
			Institution: '',
			'Live assignments': '',
		})
	const pushExaminer = (e: ExaminerOpt) =>
		examinerRows.push({
			'Examiner Type': e.kind === 'internal' ? 'Internal' : 'External',
			Name: e.full_name,
			'Email (use this in Assignments)': e.email,
			// Text, so a leading zero or +91 survives and Excel never shows 9.57E+09.
			'Mobile Number': e.mobile ? String(e.mobile) : '',
			Designation: e.designation || '',
			Department: e.department || '',
			Institution: e.institution_name || '',
			'Live assignments': e.active_assignments || 0,
		})
	pushSection('EXTERNAL — Examiner Panel, approved, Question Paper Setter')
	input.external.forEach(pushExaminer)
	pushSection('INTERNAL — teaching staff of this institution')
	input.internal.forEach(pushExaminer)
	const wsEx = XLSX.utils.json_to_sheet(examinerRows)
	wsEx['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 36 }, { wch: 16 }, { wch: 22 }, { wch: 26 }, { wch: 30 }, { wch: 16 }]
	XLSX.utils.book_append_sheet(wb, wsEx, EXAMINERS_SHEET)

	// ── Sheet 3: how to fill it in ──────────────────────────────────────────
	const help = [
		['Session', `${input.sessionName} (${input.sessionCode})`],
		['Institution', input.institutionCode],
		['Filter', input.filterSummary],
		['Papers in this file', String(input.papers.length)],
		['', ''],
		['═══ HOW TO FILL ═══', ''],
		['Subject Code / Set', 'Pre-filled. Leave them as given; they are how a row finds its paper. Set matters only when a subject has more than one set.'],
		['Examiner Email *', 'Pick from the dropdown or copy from the Examiners sheet. Matching is by e-mail.'],
		['Assignment Type *', 'Question Paper, Answer Key or Both. The fee columns are filled from Fee Details for information — the server resolves them again by the W.E.F. date.'],
		['Question Paper Willing / Answer Key Willing', 'Yes or No when the examiner has already confirmed on paper; leave BLANK and they confirm in the portal. The claim is only for the parts accepted.'],
		['Date From / Date To *', 'IST. Type YYYY-MM-DD HH:mm, e.g. 2026-11-04 09:00. A date with no time uses 09:00 for From and 17:00 for To.'],
		['Send Order Email', 'Yes e-mails the Examiner Order as soon as the appointment is made. No leaves it for the Assignments tab.'],
		['', ''],
		['═══ WHAT HAPPENS ON UPLOAD ═══', ''],
		['Not assigned', 'The examiner is appointed to the paper.'],
		['Existing Assignment Found', 'The earlier examiner is NOT replaced. The new e-mail gets their own set of the subject (Set B, C …) and the two work independently.'],
		['Already assigned to this e-mail', 'Nothing changes — the row is counted as unchanged and skipped.'],
		['Rows to skip', 'Leave Examiner Email blank and the row is ignored. Delete rows freely; the order does not matter.'],
	].map(([k, v]) => ({ Field: k, 'How to fill': v }))
	const wsHelp = XLSX.utils.json_to_sheet(help)
	wsHelp['!cols'] = [{ wch: 40 }, { wch: 120 }]
	XLSX.utils.book_append_sheet(wb, wsHelp, HELP_SHEET)

	const stamp = new Date().toISOString().slice(0, 10)
	await XLSX.writeFile(wb, `qp_examiner_bulk_assign_${input.sessionCode || 'session'}_${stamp}.xlsx`)
}

// ── Upload: parse ───────────────────────────────────────────────────────────

/** One row of the uploaded sheet, as typed — nothing resolved yet. */
export interface RawBulkRow {
	/** Excel row number (header is row 1). */
	row: number
	regulation: string
	course_code: string
	set_label: string
	email: string
	type_text: string
	qp_willing_text: string
	ak_willing_text: string
	from_text: string
	to_text: string
	notes: string
	send_email_text: string
}

const pick = (row: Record<string, unknown>, ...keys: string[]): unknown => {
	for (const k of keys) {
		if (row[k] !== undefined && row[k] !== null) return row[k]
		const bare = k.replace(/\s*\*$/, '')
		if (row[bare] !== undefined && row[bare] !== null) return row[bare]
	}
	return undefined
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim())

/**
 * A cell value that is meant to be an IST date-time, as the `datetime-local`
 * string the API expects ("YYYY-MM-DDTHH:mm"). ExcelJS hands a real date cell
 * back as a JS Date whose UTC fields carry the typed wall-clock time, so those
 * are read as-is rather than converted through the browser zone.
 */
function cellToIstLocal(v: unknown, defaultTime: string): string | null {
	if (v == null || v === '') return null
	if (v instanceof Date) {
		if (isNaN(v.getTime())) return null
		const p = (n: number) => String(n).padStart(2, '0')
		const hasTime = v.getUTCHours() !== 0 || v.getUTCMinutes() !== 0
		const time = hasTime ? `${p(v.getUTCHours())}:${p(v.getUTCMinutes())}` : defaultTime
		return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}T${time}`
	}
	const text = String(v).trim()
	if (!text) return null

	// YYYY-MM-DD[ T]HH:mm[:ss]
	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(text)
	if (m) {
		const [, y, mo, d, h, mi] = m
		const time = h != null ? `${h.padStart(2, '0')}:${mi}` : defaultTime
		return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`
	}
	// DD-MM-YYYY or DD/MM/YYYY, optional time
	m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(text)
	if (m) {
		const [, d, mo, y, h, mi] = m
		const time = h != null ? `${h.padStart(2, '0')}:${mi}` : defaultTime
		return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`
	}
	return null
}

const isValidLocal = (local: string | null): local is string => {
	if (!local) return false
	return !isNaN(new Date(`${local}:00+05:30`).getTime())
}

/** "Yes" / "No" / blank → true / false / null. */
function parseYesNo(v: string): boolean | null {
	const t = v.trim().toLowerCase()
	if (!t) return null
	if (/^(y|yes|true|1|accepted|willing)$/.test(t)) return true
	if (/^(n|no|false|0|declined|not willing)$/.test(t)) return false
	return null
}

/** Rows of the Assignments sheet of an uploaded workbook, header row stripped. */
export async function parseBulkAssignFile(file: File): Promise<RawBulkRow[]> {
	const data = await file.arrayBuffer()
	const wb = await XLSX.read(data)
	// Prefer the sheet we wrote; fall back to the first one for hand-made files.
	const name = wb.SheetNames.includes(ASSIGN_SHEET) ? ASSIGN_SHEET : wb.SheetNames[0]
	const ws = wb.Sheets[name]
	if (!ws) return []
	const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

	return json.map((r, i) => ({
		row: i + 2,
		regulation: str(pick(r, BULK_COLUMNS.regulation, 'regulation_code')),
		course_code: str(pick(r, BULK_COLUMNS.courseCode, 'Course Code *', 'course_code')).toUpperCase(),
		set_label: str(pick(r, BULK_COLUMNS.set, 'set_label')).toUpperCase(),
		email: str(pick(r, BULK_COLUMNS.email, 'Examiner', 'examiner_email', 'email')).toLowerCase(),
		type_text: str(pick(r, BULK_COLUMNS.type, 'assignment_type', 'Type')),
		qp_willing_text: str(pick(r, BULK_COLUMNS.qpWilling, 'qp_willing', 'QP Willing')),
		ak_willing_text: str(pick(r, BULK_COLUMNS.akWilling, 'ak_willing', 'AK Willing')),
		from_text: (() => {
			const v = pick(r, BULK_COLUMNS.from, 'valid_from')
			return v instanceof Date ? cellToIstLocal(v, DEFAULT_FROM_TIME) || '' : str(v)
		})(),
		to_text: (() => {
			const v = pick(r, BULK_COLUMNS.to, 'valid_to')
			return v instanceof Date ? cellToIstLocal(v, DEFAULT_TO_TIME) || '' : str(v)
		})(),
		notes: str(pick(r, BULK_COLUMNS.notes, 'notes')),
		send_email_text: str(pick(r, BULK_COLUMNS.sendEmail, 'send_email')),
	}))
}

// ── Upload: resolve + validate ──────────────────────────────────────────────

export type BulkAction = 'assign' | 'assign_new_set'

export const BULK_ACTION_LABELS: Record<BulkAction, string> = {
	assign: 'Assign',
	assign_new_set: 'Assign as new set',
}

/** One row of the sheet, checked against the live papers and examiners. */
export interface BulkAssignItem {
	row: number
	course_code: string
	set_label: string
	subject_title: string
	regulation: string
	examiner_email: string
	examiner_name: string
	kind: QpExaminerKind | null
	action: BulkAction | null
	assignment_type: QpAssignmentType
	/** Willingness recorded in the sheet; null = the examiner confirms in the portal. */
	qp_willing: boolean | null
	ak_willing: boolean | null
	valid_from: string
	valid_to: string
	notes: string
	send_email: boolean
	/** Who holds the paper now, when the action is a new set. */
	existing_examiner: string | null
	/** Resolved targets — present only when `errors` is empty. */
	paper: PaperRow | null
	examiner: ExaminerOpt | null
	errors: string[]
}

export interface BulkValidationInput {
	rows: RawBulkRow[]
	papers: PaperRow[]
	external: ExaminerOpt[]
	internal: ExaminerOpt[]
}

export interface BulkValidationResult {
	items: BulkAssignItem[]
	ready: BulkAssignItem[]
	invalid: BulkAssignItem[]
	/** Rows with no e-mail — deliberately left alone, per the template's own rule. */
	skipped: number
	/** Rows naming the examiner who already holds the paper — nothing to do. */
	unchanged: number
}

export function validateBulkAssignRows(input: BulkValidationInput): BulkValidationResult {
	const { rows, papers, external, internal } = input

	const byEmail = new Map<string, ExaminerOpt>()
	for (const e of external) if (e.email) byEmail.set(e.email.toLowerCase(), e)
	for (const e of internal) if (e.email) byEmail.set(e.email.toLowerCase(), e)

	const byCode = new Map<string, PaperRow[]>()
	for (const p of papers) {
		const k = p.course_code.toUpperCase()
		const list = byCode.get(k) || []
		list.push(p)
		byCode.set(k, list)
	}
	for (const list of byCode.values()) list.sort((a, b) => a.set_number - b.set_number)

	// Which papers this file has already handed out, so a second examiner on the
	// same paper becomes a new set rather than a clash at the server; and which
	// (examiner, subject) pairs are taken, so the same person is not listed twice.
	const claimedPaper = new Set<string>()
	const claimedSubjectByExaminer = new Set<string>()

	const items: BulkAssignItem[] = []
	let skipped = 0
	let unchanged = 0

	for (const r of rows) {
		if (!r.email) {
			skipped++
			continue
		}

		const errors: string[] = []
		const item: BulkAssignItem = {
			row: r.row,
			course_code: r.course_code,
			set_label: r.set_label,
			subject_title: '',
			regulation: r.regulation,
			examiner_email: r.email,
			examiner_name: '',
			kind: null,
			action: null,
			assignment_type: 'question_paper',
			qp_willing: null,
			ak_willing: null,
			valid_from: '',
			valid_to: '',
			notes: r.notes,
			send_email: r.send_email_text === '' ? true : /^y(es)?$|^true$|^1$/i.test(r.send_email_text),
			existing_examiner: null,
			paper: null,
			examiner: null,
			errors,
		}

		// ── Examiner ──
		const examiner = byEmail.get(r.email)
		if (!examiner) {
			errors.push(`No eligible examiner has the e-mail ${r.email}. Use an address from the ${EXAMINERS_SHEET} sheet.`)
		} else {
			item.examiner = examiner
			item.examiner_name = examiner.full_name
			item.kind = examiner.kind
		}

		// ── Paper ──
		let paper: PaperRow | undefined
		if (!r.course_code) {
			errors.push('Subject Code is required.')
		} else {
			const candidates = byCode.get(r.course_code) || []
			if (candidates.length === 0) {
				errors.push(`No generated question paper for ${r.course_code} in this session. Generate it first.`)
			} else if (r.set_label) {
				paper = candidates.find(p => (p.set_label || '').toUpperCase() === r.set_label)
				if (!paper) errors.push(`${r.course_code} has no Set ${r.set_label}.`)
			} else {
				// No set given: the paper this examiner already holds, else the first
				// free one, else the first paper (which then becomes "new set").
				paper =
					candidates.find(p => p.assignment?.examiner_email?.toLowerCase() === r.email) ||
					candidates.find(p => !p.assignment && !claimedPaper.has(p.paper_id)) ||
					candidates.find(p => !p.assignment) ||
					candidates[0]
			}
			if (paper && r.regulation && paper.regulation_code && r.regulation !== paper.regulation_code) {
				errors.push(`Regulation ${r.regulation} does not match the paper's regulation ${paper.regulation_code}.`)
			}
		}

		// ── Action ──
		if (paper) {
			item.subject_title = paper.subject_title
			item.set_label = paper.set_label || ''
			const label = `${paper.course_code}${paper.set_label ? ` Set ${paper.set_label}` : ''}`
			const holderEmail = paper.assignment?.examiner_email?.toLowerCase() || null

			if (paper.assignment && holderEmail === r.email) {
				// Already theirs — the row is the template echoing the record back.
				unchanged++
				continue
			} else if (paper.assignment) {
				// Held by someone else: never overwrite — this examiner gets a new set.
				item.action = 'assign_new_set'
				item.existing_examiner = paper.assignment.examiner_name || paper.assignment.examiner_email || 'another examiner'
				item.paper = paper
			} else if (paper.cancelled_assignment_id) {
				errors.push(`${label} has a cancelled assignment on record. Remove it from the Assignments tab first.`)
			} else if (claimedPaper.has(paper.paper_id)) {
				item.action = 'assign_new_set'
				item.existing_examiner = 'an examiner earlier in this file'
				item.paper = paper
			} else {
				item.action = 'assign'
				item.paper = paper
			}
		}

		// ── Assignment type + willingness ──
		const typed = r.type_text ? parseAssignmentType(r.type_text) : 'question_paper'
		if (!typed) {
			errors.push(`Assignment Type “${r.type_text}” is not Question Paper, Answer Key or Both.`)
		} else {
			item.assignment_type = typed
		}
		const comp = componentsForType(item.assignment_type)
		const qpW = parseYesNo(r.qp_willing_text)
		const akW = parseYesNo(r.ak_willing_text)
		if (r.qp_willing_text && qpW == null) errors.push(`Question Paper Willing must be Yes, No or blank (got “${r.qp_willing_text}”).`)
		if (r.ak_willing_text && akW == null) errors.push(`Answer Key Willing must be Yes, No or blank (got “${r.ak_willing_text}”).`)
		item.qp_willing = comp.qp ? qpW : null
		item.ak_willing = comp.ak ? akW : null
		if (comp.qp && comp.ak && qpW === false && akW === false) {
			errors.push('Both parts are marked as declined — there is nothing to appoint. Leave the row out, or let the examiner decide in the portal.')
		}
		if (item.assignment_type === 'question_paper' && akW === true) {
			errors.push('Answer Key Willing is Yes but the Assignment Type is Question Paper. Choose Both or Answer Key.')
		}

		// ── Window ──
		const from = cellToIstLocal(r.from_text, DEFAULT_FROM_TIME)
		const to = cellToIstLocal(r.to_text, DEFAULT_TO_TIME)
		if (!isValidLocal(from)) errors.push('Date From is missing or not a date (use YYYY-MM-DD HH:mm).')
		if (!isValidLocal(to)) errors.push('Date To is missing or not a date (use YYYY-MM-DD HH:mm).')
		if (isValidLocal(from) && isValidLocal(to)) {
			if (new Date(`${to}:00+05:30`) <= new Date(`${from}:00+05:30`)) {
				errors.push('Date To must be after Date From.')
			}
			item.valid_from = from
			item.valid_to = to
		}

		// ── The same person, twice for one subject ──
		if (item.paper && item.examiner) {
			const subjectKey = `${item.examiner.id}|${r.course_code}`
			if (claimedSubjectByExaminer.has(subjectKey)) {
				errors.push(`${item.examiner.full_name} is listed for ${r.course_code} more than once. One examiner sets one paper per subject.`)
			} else {
				claimedSubjectByExaminer.add(subjectKey)
			}
			const otherSet = (byCode.get(r.course_code) || []).find(
				p => p.paper_id !== item.paper!.paper_id && p.assignment?.examiner_email?.toLowerCase() === r.email
			)
			if (otherSet) {
				errors.push(
					`${item.examiner.full_name} already holds ${r.course_code}${otherSet.set_label ? ` Set ${otherSet.set_label}` : ''}. One examiner sets one paper per subject.`
				)
			}
		}

		if (errors.length === 0 && item.paper) claimedPaper.add(item.paper.paper_id)
		items.push(item)
	}

	return {
		items,
		ready: items.filter(i => i.errors.length === 0),
		invalid: items.filter(i => i.errors.length > 0),
		skipped,
		unchanged,
	}
}

// ── Payload ─────────────────────────────────────────────────────────────────

/** The POST body for one validated row — identical to what the sheet sends. */
export function bulkItemToAssignPayload(
	item: BulkAssignItem,
	ctx: { institutionsId: string; institutionCode: string; sessionId: string }
) {
	const ex = item.examiner!
	const kind = ex.kind
	return {
		institutions_id: ctx.institutionsId,
		institution_code: ctx.institutionCode,
		examination_session_id: ctx.sessionId,
		paper_id: item.paper!.paper_id,
		create_additional_set: item.action === 'assign_new_set',
		examiner_kind: kind,
		examiner_id: kind === 'external' ? ex.id : ex.already_mirrored ? ex.id : undefined,
		staff:
			kind === 'internal'
				? {
						myjkkn_staff_id: ex.myjkkn_staff_id || ex.id,
						full_name: ex.full_name,
						email: ex.email,
						mobile: ex.mobile || null,
						designation: ex.designation || null,
						department: ex.department || null,
					}
				: undefined,
		valid_from: item.valid_from,
		valid_to: item.valid_to,
		remuneration: null,
		notes: item.notes || null,
		assignment_type: item.assignment_type,
		qp_willing: item.qp_willing,
		ak_willing: item.ak_willing,
	}
}

/** "Both" etc., for the preview. */
export const assignmentTypeLabel = (t: QpAssignmentType) => QP_ASSIGNMENT_TYPE_LABELS[t]
