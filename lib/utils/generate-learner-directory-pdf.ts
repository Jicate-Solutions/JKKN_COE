import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getInstitutionHeader } from './institution-header'

/**
 * Generate Learner Directory PDF
 *
 * Follows the Exam Attendance Sheet house style: A4 outline border on every
 * page, logos left and right, centered institution letterhead (name,
 * accreditation, address), bold report title, Times throughout, and a bordered
 * grid table with the date and page number printed below the border. The
 * letterhead comes from `institution-header.ts`, keyed by institution_code, so
 * each college prints on its own.
 *
 * Landscape rather than the attendance sheet's portrait — the directory has
 * eleven columns (email and batch included) and they do not read at portrait
 * width. Learner photos are deliberately omitted: a full roster runs to
 * thousands of rows, and embedding a thumbnail per row makes the file unusable.
 *
 * Rows are grouped by program, each program starting on a fresh page with its
 * code and name in the running header, so a printed directory can be split and
 * handed to departments.
 */

const MARGIN = 6.35 // 0.25 inch narrow margin, same as the attendance sheet
const FOOTER_HEIGHT = 10
// Gap between the rule under the header and the first table row.
const HEADER_TABLE_GAP = 2.5

export interface LearnerDirectoryPdfRow {
	register_number?: string
	roll_number?: string
	learner_name?: string
	program_code?: string
	program_name?: string
	current_semester?: number | null
	admission_year?: number | null
	batch_name?: string
	date_of_birth?: string
	email?: string
	phone?: string
	lifecycle_status?: string
}

export interface LearnerDirectoryPdfFilters {
	status: string
	program: string
	semester: string
	search?: string
}

export interface LearnerDirectoryPdfData {
	learners: LearnerDirectoryPdfRow[]
	/** Institution the roster is scoped to; drives the letterhead. */
	institutionCode?: string
	/** Overrides the letterhead name — used for a multi-institution roster. */
	institutionName?: string
	filters: LearnerDirectoryPdfFilters
	/** Base64 data URLs; the header simply skips a logo that failed to load. */
	logoImage?: string | null
	rightLogoImage?: string | null
}

interface ProgramGroup {
	code: string
	name: string
	rows: LearnerDirectoryPdfRow[]
}

export function generateLearnerDirectoryPDF(data: LearnerDirectoryPdfData): void {
	const doc = buildDocument(data)
	const stamp = new Date().toISOString().split('T')[0]
	doc.save(`learner_directory_${stamp}.pdf`)
}

export function generateLearnerDirectoryPDFBlob(data: LearnerDirectoryPdfData): Blob {
	return buildDocument(data).output('blob')
}

function buildDocument(data: LearnerDirectoryPdfData): jsPDF {
	// compress: zlib the content streams. A full-roster export is ~250 pages of
	// dense text; uncompressed that is ~18 MB, compressed it is a fraction of it.
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const innerMargin = MARGIN + 2
	const tableWidth = pageWidth - 2 * innerMargin

	// Column widths as fractions of the table, so the layout survives a different
	// paper size without re-tuning every number. Name gets the most room — long
	// Tamil names were wrapping while email sat half empty.
	const weights = [10, 27, 58, 20, 9, 12, 24, 20, 48, 22, 22]
	const weightTotal = weights.reduce((sum, w) => sum + w, 0)
	const colWidths = weights.map(w => (w / weightTotal) * tableWidth)

	const groups = groupByProgram(data.learners)
	const total = data.learners.length

	// The letterhead is a different number of lines per institution (CET carries
	// an autonomy line and a trust line, CAS does not), so the band the table has
	// to clear is measured from the same code that draws it rather than guessed.
	// Every group renders the same header shape, so one measurement covers all.
	const headerHeight = layoutHeader(doc, data, groups[0], total, pageWidth, false) + HEADER_TABLE_GAP

	groups.forEach((group, groupIndex) => {
		autoTable(doc, {
			startY: headerHeight,
			// Every program starts its own page, so a department only gets its own rows.
			pageBreak: groupIndex === 0 ? 'auto' : 'always',
			head: [[
				'S.No.', 'Register / Roll No.', 'Name of the Learner', 'Program', 'Sem',
				'Year', 'Batch', 'Date of Birth', 'Email', 'Mobile', 'Status',
			]],
			body: group.rows.length > 0
				? group.rows.map((learner, index) => [
					String(index + 1),
					learner.register_number || learner.roll_number || '-',
					learner.learner_name || '-',
					learner.program_code || '-',
					learner.current_semester ? String(learner.current_semester) : '-',
					learner.admission_year ? String(learner.admission_year) : '-',
					learner.batch_name || '-',
					formatDate(learner.date_of_birth),
					learner.email || '-',
					learner.phone || '-',
					formatLifecycleLabel(learner.lifecycle_status),
				])
				: [['', '', 'No learners match the selected filters.', '', '', '', '', '', '', '', '']],
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 8,
				textColor: [0, 0, 0],
				lineColor: [90, 90, 90],
				lineWidth: 0.1,
				cellPadding: { top: 1.4, right: 1.2, bottom: 1.4, left: 1.2 },
				valign: 'middle',
				overflow: 'linebreak',
				minCellHeight: 6,
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fontSize: 8,
				fillColor: [226, 232, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				valign: 'middle',
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				minCellHeight: 8,
			},
			// Zebra striping — the eye loses the row across eleven columns otherwise.
			alternateRowStyles: { fillColor: [245, 247, 250] },
			columnStyles: {
				0: { halign: 'center', cellWidth: colWidths[0] },
				1: { halign: 'center', cellWidth: colWidths[1] },
				2: { halign: 'left', cellWidth: colWidths[2] },
				3: { halign: 'center', cellWidth: colWidths[3] },
				4: { halign: 'center', cellWidth: colWidths[4] },
				5: { halign: 'center', cellWidth: colWidths[5] },
				6: { halign: 'center', cellWidth: colWidths[6] },
				7: { halign: 'center', cellWidth: colWidths[7] },
				8: { halign: 'left', cellWidth: colWidths[8], fontSize: 7.5 },
				9: { halign: 'center', cellWidth: colWidths[9] },
				10: { halign: 'center', cellWidth: colWidths[10] },
			},
			margin: { top: headerHeight, bottom: FOOTER_HEIGHT, left: innerMargin, right: innerMargin },
			tableWidth,
			// Runs for every page autoTable creates, so the border + header repeat.
			didDrawPage: () => {
				drawPageFrame(doc, pageWidth, pageHeight)
				layoutHeader(doc, data, group, total, pageWidth, true)
			},
		})
	})

	stampFooters(doc, pageWidth, pageHeight)
	return doc
}

/** Caption for learners MyJKKN has not mapped to a program. */
const UNMAPPED_PROGRAM = 'Programme not mapped'

/** One group per program code, alphabetical; unmapped rows get their own group. */
function groupByProgram(learners: LearnerDirectoryPdfRow[]): ProgramGroup[] {
	if (learners.length === 0) {
		return [{ code: '', name: '', rows: [] }]
	}

	const byCode = new Map<string, ProgramGroup>()
	for (const learner of learners) {
		const code = learner.program_code || UNMAPPED_PROGRAM
		let group = byCode.get(code)
		if (!group) {
			group = { code, name: '', rows: [] }
			byCode.set(code, group)
		}
		// MyJKKN repeats the code as the name for a few programs — don't print "BDS - BDS".
		if (!group.name && learner.program_name && learner.program_name !== code) {
			group.name = learner.program_name
		}
		group.rows.push(learner)
	}

	return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

// ========================================================================
// PAGE FRAME + HEADER
// ========================================================================

function drawPageFrame(doc: jsPDF, pageWidth: number, pageHeight: number) {
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.5)
	doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)
}

/**
 * Lay out the running page header.
 *
 * One function does both jobs: with `draw` false it only walks the geometry and
 * returns the Y the header ends at, which is what the table's top margin has to
 * clear; with `draw` true it paints. Keeping measurement and painting in the
 * same code means a letterhead with extra lines can never silently overlap the
 * table — which is exactly what a hard-coded band did.
 *
 * @returns Y of the rule under the header, in mm.
 */
function layoutHeader(
	doc: jsPDF,
	data: LearnerDirectoryPdfData,
	group: ProgramGroup | undefined,
	total: number,
	pageWidth: number,
	draw: boolean
): number {
	const header = getInstitutionHeader(data.institutionCode)
	const centerX = pageWidth / 2
	let y = MARGIN + 2

	if (draw) {
		// The alias argument matters: without it jsPDF re-embeds the logo bitmap on
		// every page, which on a 200-page roster is tens of megabytes of duplicate
		// image data. With it the image is stored once and referenced per page.
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', MARGIN + 2, y, 16, 16, 'directory-logo-left')
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - MARGIN - 18, y, 16, 16, 'directory-logo-right')
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}
		doc.setTextColor(0, 0, 0)
	}

	// Institution name
	y += 4
	if (draw) {
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text((data.institutionName || header.name).toUpperCase(), centerX, y, { align: 'center' })
	}

	// Autonomy / trust lines, when the institution has them
	for (const line of [header.subtitle, header.trust_line].filter(Boolean) as string[]) {
		y += 3.4
		if (draw) {
			doc.setFont('times', 'normal')
			doc.setFontSize(7.5)
			doc.text(line, centerX, y, { align: 'center' })
		}
	}

	// Accreditation + affiliation
	if (header.accreditation) {
		y += 3.6
		if (draw) {
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.text(header.accreditation, centerX, y, { align: 'center' })
		}
	}

	// Address
	if (header.address) {
		y += 3.8
		if (draw) {
			doc.setFont('times', 'bold')
			doc.setFontSize(8.5)
			doc.text(header.address, centerX, y, { align: 'center' })
		}
	}

	// Title
	y += 5.5
	if (draw) {
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text('LEARNER DIRECTORY', centerX, y, { align: 'center' })
	}

	// Which program this page belongs to — the report is grouped, so the running
	// header names the group rather than repeating it in every row.
	if (group?.code) {
		y += 4.5
		if (draw) {
			doc.setFont('times', 'bold')
			doc.setFontSize(8.5)
			const label = group.name ? `${group.code} - ${group.name}` : group.code
			doc.text(label, centerX, y, { align: 'center' })
		}
	}

	// Applied filters on the left, counts on the right — so a printed copy says
	// which slice of the roster it is.
	y += 4.5
	if (draw) {
		const { status, program, semester, search } = data.filters
		const parts = [`Status: ${status}`, `Program: ${program}`, `Semester: ${semester}`]
		if (search) parts.push(`Search: "${search}"`)

		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(parts.join('   |   '), MARGIN + 2, y)

		const counts = group && group.rows.length !== total
			? `${group.rows.length.toLocaleString()} in this program  |  ${total.toLocaleString()} total`
			: `Total Learners: ${total.toLocaleString()}`
		doc.text(counts, pageWidth - MARGIN - 2, y, { align: 'right' })
	}

	// Rule under the header
	y += 1.5
	if (draw) {
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(MARGIN + 2, y, pageWidth - MARGIN - 2, y)
	}

	return y
}

// ========================================================================
// FOOTER — needs the final page count, so it is stamped after the table
// ========================================================================

function stampFooters(doc: jsPDF, pageWidth: number, pageHeight: number) {
	const totalPages = doc.getNumberOfPages()
	const footerY = pageHeight - MARGIN + 4

	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`

	for (let page = 1; page <= totalPages; page++) {
		doc.setPage(page)
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(0, 0, 0)
		doc.text(`Generated on ${dateStr}`, MARGIN + 2, footerY)
		doc.text(`Page ${page}/${totalPages}`, pageWidth - MARGIN - 2, footerY, { align: 'right' })
	}
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

function formatDate(dateStr?: string): string {
	if (!dateStr) return '-'
	try {
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) return dateStr
		const day = date.getDate().toString().padStart(2, '0')
		const month = (date.getMonth() + 1).toString().padStart(2, '0')
		return `${day}-${month}-${date.getFullYear()}`
	} catch {
		return dateStr
	}
}

function formatLifecycleLabel(status?: string): string {
	if (!status) return 'Unknown'
	return status
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}
