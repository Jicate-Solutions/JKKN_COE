import jsPDF from 'jspdf'

/**
 * Shared JKKN PDF header for Central Valuation reports.
 * Mirrors the layout used by lib/utils/generate-hall-ticket-pdf.ts so that
 * pass-percentage / examiner-valuation / panel-of-examiners PDFs look consistent.
 */

export interface CvReportHeaderInput {
	doc: jsPDF
	pageWidth: number
	startY: number
	margin: number
	logoLeft?: string | null
	logoRight?: string | null
	sessionName: string
	reportTitle: string
	subtitle?: string | null
	dateText?: string | null
}

export function drawCvReportHeader(opts: CvReportHeaderInput): number {
	const { doc, pageWidth, startY, margin, logoLeft, logoRight, sessionName, reportTitle, subtitle, dateText } = opts
	let y = startY

	// Logos (16x16mm)
	if (logoLeft) {
		try { doc.addImage(logoLeft, 'PNG', margin, y, 16, 16) } catch (e) { console.warn('left logo:', e) }
	}
	if (logoRight) {
		try { doc.addImage(logoRight, 'PNG', pageWidth - margin - 16, y, 16, 16) } catch (e) { console.warn('right logo:', e) }
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, y + 4, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, y + 8, { align: 'center' })
	y += 11

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 4

	// Session
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(sessionName, pageWidth / 2, y, { align: 'center' })
	y += 5

	// Report title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text(reportTitle, pageWidth / 2, y, { align: 'center' })
	y += 5

	// Optional subtitle (e.g. board name)
	if (subtitle) {
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		const lines = doc.splitTextToSize(subtitle, pageWidth - margin * 2)
		doc.text(lines, pageWidth / 2, y, { align: 'center' })
		y += lines.length * 5
	}

	// Date on the right
	if (dateText) {
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.text(`Date: ${dateText}`, pageWidth - margin, y, { align: 'right' })
		y += 5
	} else {
		y += 1
	}

	return y
}

export function drawCvReportFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number, currentPage: number, totalPages: number): void {
	const footerY = pageHeight - margin
	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
	const hours = now.getHours()
	const ampm = hours >= 12 ? 'PM' : 'AM'
	const hours12 = hours % 12 || 12
	const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.setTextColor(100, 100, 100)
	doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)
	doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
}

export function todayDateStr(): string {
	const now = new Date()
	return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
}
