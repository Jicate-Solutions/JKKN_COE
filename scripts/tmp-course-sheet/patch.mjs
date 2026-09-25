import { readFileSync, writeFileSync } from 'node:fs'
const f = 'lib/utils/generate-course-assessment-sheet-pdf.ts'
let s = readFileSync(f, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b) }

rep(` * Portrait A4. The blank attendance sheet comes first, the blank mark entry
 * sheet (assessment components + total + signatories) follows in the same PDF.
 * The college header repeats on every page.
 */`,
` * Portrait A4. The blank attendance sheet comes first, the blank mark entry
 * sheet (assessment components + total) follows in the same PDF. Both sheets
 * end with the signatory row. The college header repeats on every page; the
 * exam session line is shown on the mark entry sheet only.
 */`)

rep(`function drawHeader(doc: jsPDF, data: CourseSheetData, program: CourseSheetProgram): void {`,
`function drawHeader(doc: jsPDF, data: CourseSheetData, program: CourseSheetProgram, showSession = true): void {`)

rep(`	// Exam session line, e.g. END SEMESTER EXAMINATION - NOV-DEC-2026
	doc.setFont('times', 'bold')
	doc.setFontSize(10.5)
	doc.text(\`END SEMESTER EXAMINATION - \${(data.session_name || data.session_code || '').toUpperCase()}\`, pageWidth / 2, y + 25, { align: 'center' })

	// Class on the left, course code & name on the right; a long title wraps under itself
	doc.setFont('times', 'bold')
	doc.setFontSize(10.5)
	const lineY = y + 35`,
`	// Exam session line, e.g. END SEMESTER EXAMINATION - NOV-DEC-2026 (mark entry sheet only)
	doc.setFont('times', 'bold')
	doc.setFontSize(10.5)
	if (showSession) {
		doc.text(\`END SEMESTER EXAMINATION - \${(data.session_name || data.session_code || '').toUpperCase()}\`, pageWidth / 2, y + 25, { align: 'center' })
	}

	// Class on the left, course code & name on the right; a long title wraps under itself
	const lineY = showSession ? y + 35 : y + 31`)

rep(`		didDrawPage: () => drawHeader(doc, data, program),
	})
}

// ========================================================================
// MARK ENTRY SHEET`,
`		didDrawPage: () => drawHeader(doc, data, program, false),
	})

	drawSignatories(doc, data, program, options, false)
}

// ========================================================================
// MARK ENTRY SHEET`)

rep(`		rowPageBreak: 'avoid',
		didDrawPage: () => drawHeader(doc, data, program),
	})

	// Signatories - keep them on the sheet, move to a fresh page only when there is no room
	const signatories = options.signatories.map(s => s.trim()).filter(Boolean)
	if (signatories.length === 0) return

	let signY = ((doc as any).lastAutoTable.finalY as number) + SIGNATURE_GAP
	if (signY > pageHeight - TABLE_BOTTOM - 8) {
		doc.addPage()
		drawHeader(doc, data, program)
		signY = HEADER_END_Y + SIGNATURE_GAP
	}
`,
`		rowPageBreak: 'avoid',
		didDrawPage: () => drawHeader(doc, data, program),
	})

	drawSignatories(doc, data, program, options, true)
}

// ========================================================================
// SIGNATORIES - under the table on both sheets
// ========================================================================

// Keep them on the sheet, move to a fresh page only when there is no room
function drawSignatories(
	doc: jsPDF,
	data: CourseSheetData,
	program: CourseSheetProgram,
	options: CourseSheetPdfOptions,
	showSession: boolean
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const usableWidth = pageWidth - 2 * MARGIN
	const signatories = options.signatories.map(s => s.trim()).filter(Boolean)
	if (signatories.length === 0) return

	let signY = ((doc as any).lastAutoTable.finalY as number) + SIGNATURE_GAP
	if (signY > pageHeight - TABLE_BOTTOM - 8) {
		doc.addPage()
		drawHeader(doc, data, program, showSession)
		signY = HEADER_END_Y + SIGNATURE_GAP
	}
`)

// pageHeight no longer used in mark entry sheet
rep(`	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const components = options.components.filter(c => c.label.trim())`,
`	const pageWidth = doc.internal.pageSize.getWidth()
	const components = options.components.filter(c => c.label.trim())`)

if (crlf) s = s.replace(/\n/g, '\r\n')
writeFileSync(f, s)
console.log('patched')
