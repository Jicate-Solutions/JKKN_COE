import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PacketReportRecord {
	course_code: string
	course_name: string
	board_code: string
	packet_no: string
	total_sheets: number
	dummy_range: string
	dummy_count: number
	barcode: string
}

export interface PacketReportBoard {
	board_code: string
	board_name: string
	board_type?: string
	board_order?: number
}

export interface PacketReportData {
	institutionName: string
	institutionCode: string
	sessionName: string
	sessionCode: string
	logoImage?: string
	rightLogoImage?: string
	boards: PacketReportBoard[]
	packets: PacketReportRecord[]
}

export function generateAnswerSheetPacketsReportPDF(data: PacketReportData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Group packets by board_code
	const grouped = new Map<string, PacketReportRecord[]>()
	for (const p of data.packets) {
		const board = p.board_code || 'Unknown'
		if (!grouped.has(board)) grouped.set(board, [])
		grouped.get(board)!.push(p)
	}

	// Sort boards by board_order
	const boardOrder = new Map(data.boards.map(b => [b.board_code, b.board_order ?? 999]))
	const sortedBoardCodes = [...grouped.keys()].sort((a, b) => {
		return (boardOrder.get(a) ?? 999) - (boardOrder.get(b) ?? 999)
	})

	let isFirstPage = true

	for (const boardCode of sortedBoardCodes) {
		const boardPackets = grouped.get(boardCode)!
		const boardInfo = data.boards.find(b => b.board_code === boardCode)

		if (!isFirstPage) doc.addPage()
		isFirstPage = false

		printBoardSection(doc, data, boardPackets, boardInfo, margin, pageWidth, pageHeight)
	}

	const fileName = `Answer_Sheet_Packets_Report_${data.sessionCode}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

function printBoardSection(
	doc: jsPDF,
	data: PacketReportData,
	packets: PacketReportRecord[],
	boardInfo: PacketReportBoard | undefined,
	margin: number,
	pageWidth: number,
	pageHeight: number,
) {
	const tableWidth = pageWidth - 2 * margin
	let currentY = margin

	// ========== HEADER ==========
	if (data.logoImage) {
		try {
			doc.addImage(data.logoImage, 'PNG', margin, currentY, 16, 16)
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	if (data.rightLogoImage) {
		try {
			doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
		} catch (e) {
			console.warn('Failed to add right logo:', e)
		}
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 8, { align: 'center' })

	currentY += 11

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	// Report title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text('ANSWER SHEET PACKETS REPORT', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	// Session
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`Examination Session: ${data.sessionName}`, pageWidth / 2, currentY, { align: 'center' })

	currentY += 6

	// Board info
	const boardLabel = boardInfo
		? `${boardInfo.board_code} - ${boardInfo.board_name}${boardInfo.board_type ? ` (${boardInfo.board_type})` : ''}`
		: packets[0]?.board_code || 'Unknown'

	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`Board: ${boardLabel}`, margin, currentY)

	currentY += 6

	// ========== TABLE ==========
	// Group by course, then list packets within each course
	const courseMap = new Map<string, PacketReportRecord[]>()
	for (const p of packets) {
		if (!courseMap.has(p.course_code)) courseMap.set(p.course_code, [])
		courseMap.get(p.course_code)!.push(p)
	}

	// Build table data with S.No across all courses
	const tableData: (string | number)[][] = []
	let sno = 1

	for (const [courseCode, coursePackets] of courseMap) {
		const totalPacketsForCourse = coursePackets.length
		for (const p of coursePackets) {
			tableData.push([
				sno++,
				p.course_code,
				p.course_name,
				totalPacketsForCourse,
				p.packet_no,
				p.total_sheets,
				p.dummy_range,
			])
		}
	}

	autoTable(doc, {
		startY: currentY,
		head: [['S.No', 'Course Code', 'Course Name', 'Total\nPackets', 'Packet\nNo', 'Total\nSheets', 'Dummy Numbers']],
		body: tableData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 8,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: 1.5,
			valign: 'middle',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 8,
			fillColor: [220, 220, 220],
			textColor: [0, 0, 0],
			halign: 'center',
		},
		bodyStyles: {
			font: 'times',
			fontSize: 8,
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },  // S.No
			1: { halign: 'center', cellWidth: 25 },  // Course Code
			2: { halign: 'left', cellWidth: 'auto' }, // Course Name
			3: { halign: 'center', cellWidth: 18 },   // Total Packets
			4: { halign: 'center', cellWidth: 18 },   // Packet No
			5: { halign: 'center', cellWidth: 16 },   // Total Sheets
			6: { halign: 'center', cellWidth: 40 },   // Dummy Numbers
		},
		margin: { left: margin, right: margin },
		tableWidth: tableWidth,
		didDrawPage: () => {
			// Footer
			const footerY = pageHeight - margin
			const now = new Date()
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
			const hours = now.getHours()
			const ampm = hours >= 12 ? 'PM' : 'AM'
			const hours12 = hours % 12 || 12
			const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`

			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(100, 100, 100)
			doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

			const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber
			doc.text(`Page ${pageNum}`, pageWidth - margin, footerY, { align: 'right' })

			doc.text(`Board: ${boardInfo?.board_code || ''} | Total Packets: ${packets.length}`, pageWidth / 2, footerY, { align: 'center' })
		},
	})
}
