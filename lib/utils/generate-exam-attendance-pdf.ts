import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface AttendanceRecord {
	exam_date: string // Format: DD-MM-YYYY
	exam_session: string // Morning/Afternoon/Evening
	course_code: string
	course_name: string
	course_category?: string
	total_students: number
	present_count: number
	absent_count: number
	attendance_percentage: number
}

interface AttendanceReportData {
	institutionName: string
	institutionCode: string
	institutionAddress?: string
	sessionCode: string
	sessionName?: string
	logoImage?: string
	rightLogoImage?: string
	records: AttendanceRecord[]
}

export function generateExamAttendancePDF(data: AttendanceReportData) {
	// Debug: Log the data structure
	console.log('PDF Generation Data:', {
		institutionName: data.institutionName,
		sessionCode: data.sessionCode,
		recordsCount: data.records?.length || 0,
		sampleRecord: data.records?.[0]
	})

	// Legal size Landscape with 0.5 inch (12.7mm) margins
	const doc = new jsPDF('landscape', 'mm', 'legal')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm
	const contentWidth = pageWidth - (2 * margin)

	// Helper function to add header to each page
	const addHeader = () => {
		let currentY = margin

		// College Logo (left side)
		if (data.logoImage) {
			try {
				const logoSize = 22
				doc.addImage(data.logoImage, 'PNG', margin, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side - JKKN text logo)
		if (data.rightLogoImage) {
			try {
				const logoSize = 22
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
			}
		}

		// College name and details (centered)
		doc.setFont('times', 'bold')
		doc.setFontSize(16)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 6, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 12, { align: 'center' })

		currentY += 18

		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

		currentY += 8

		// Report Title (slightly different from Student Sheet)
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.text('Summary Report', pageWidth / 2, currentY, { align: 'center' })

		currentY += 7

		// Session info
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('EXAMINATION SESSION:', margin + 10, currentY)

		doc.setFont('times', 'normal')
		doc.setFontSize(12)
		const sessionText = data.sessionName || data.sessionCode
		doc.text(sessionText, margin + 70, currentY)

		currentY += 5

		// Horizontal line
		doc.setLineWidth(0.5)
		doc.setDrawColor(0, 0, 0)
		doc.line(margin, currentY, pageWidth - margin, currentY)

		return currentY + 5
	}

	// Add initial header
	let startY = addHeader()

	// Group records by exam date
	const dateGroups = data.records.reduce((acc, record) => {
		const dateKey = record.exam_date
		if (!acc[dateKey]) {
			acc[dateKey] = []
		}
		acc[dateKey].push(record)
		return acc
	}, {} as Record<string, AttendanceRecord[]>)

	// Sort dates chronologically (DD-MM-YYYY format)
	const sortedDates = Object.keys(dateGroups).sort((a, b) => {
		const parseDate = (dateStr: string) => {
			const [day, month, year] = dateStr.split('-').map(Number)
			return new Date(year, month - 1, day).getTime()
		}
		return parseDate(a) - parseDate(b)
	})

	// Calculate overall statistics
	const totalStudents = data.records.reduce((sum, r) => sum + r.total_students, 0)
	const totalPresent = data.records.reduce((sum, r) => sum + r.present_count, 0)
	const totalAbsent = data.records.reduce((sum, r) => sum + r.absent_count, 0)
	const overallPercentage = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(2) : '0.00'

	// Add summary box
	const summaryData = [
		['Total Exams Conducted', data.records.length.toString()],
		['Total Student Registrations', totalStudents.toString()],
		['Total Present', totalPresent.toString()],
		['Total Absent', totalAbsent.toString()],
		['Overall Attendance %', `${overallPercentage}%`]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 11,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.3
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 12,
			fillColor: [220, 220, 220],
			halign: 'center',
			textColor: [0, 0, 0]
		},
		bodyStyles: {
			font: 'times',
			fontStyle: 'normal'
		},
		columnStyles: {
			0: { fontStyle: 'bold', cellWidth: 80 },
			1: { halign: 'right', cellWidth: 50 }
		},
		margin: { left: margin, right: margin }
	})

	startY = (doc as any).lastAutoTable.finalY + 10

	// Generate table for each exam date
	sortedDates.forEach((dateKey, dateIndex) => {
		const dateRecords = dateGroups[dateKey]

		// Group by session within each date
		const sessionGroups = dateRecords.reduce((acc, record) => {
			const sessionKey = record.exam_session
			if (!acc[sessionKey]) {
				acc[sessionKey] = []
			}
			acc[sessionKey].push(record)
			return acc
		}, {} as Record<string, AttendanceRecord[]>)

		// Sort sessions (Morning, Afternoon, Evening)
		const sessionOrder = ['Morning', 'Afternoon', 'Evening', 'FN', 'AN']
		const sortedSessions = Object.keys(sessionGroups).sort((a, b) => {
			const indexA = sessionOrder.indexOf(a)
			const indexB = sessionOrder.indexOf(b)
			if (indexA === -1 && indexB === -1) return a.localeCompare(b)
			if (indexA === -1) return 1
			if (indexB === -1) return -1
			return indexA - indexB
		})

		sortedSessions.forEach((sessionKey) => {
			const sessionRecords = sessionGroups[sessionKey]

			// Add page break if needed
			if (startY > pageHeight - 60) {
				doc.addPage()
				startY = addHeader()
			}

			// Session header
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.setFillColor(240, 240, 240)
			doc.rect(margin, startY - 5, contentWidth, 8, 'F')
			doc.text(`Date: ${dateKey} | Session: ${sessionKey}`, margin + 5, startY)
			startY += 8

			// Prepare table data
			const tableData = sessionRecords.map((record, index) => {
				return [
					(index + 1).toString(),
					record.course_code || '-',
					record.course_name || '-',
					record.course_category || '-',
					record.total_students.toString(),
					record.present_count.toString(),
					record.absent_count.toString(),
					`${record.attendance_percentage.toFixed(2)}%`
				]
			})

			// Add session totals row
			const sessionTotal = sessionRecords.reduce((sum, r) => sum + r.total_students, 0)
			const sessionPresent = sessionRecords.reduce((sum, r) => sum + r.present_count, 0)
			const sessionAbsent = sessionRecords.reduce((sum, r) => sum + r.absent_count, 0)
			const sessionPercentage = sessionTotal > 0 ? ((sessionPresent / sessionTotal) * 100).toFixed(2) : '0.00'

			tableData.push([
				'',
				'',
				'Session Total',
				'',
				sessionTotal.toString(),
				sessionPresent.toString(),
				sessionAbsent.toString(),
				`${sessionPercentage}%`
			])

			autoTable(doc, {
				startY: startY,
				head: [
					[
						'S.No',
						'Course Code',
						'Course Title',
						'Category',
						'Total\nStudents',
						'Present',
						'Absent',
						'Attendance\n%'
					]
				],
				body: tableData,
				theme: 'grid',
				styles: {
					font: 'times',
					fontStyle: 'normal',
					fontSize: 10,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 2
				},
				headStyles: {
					font: 'times',
					fontStyle: 'bold',
					fontSize: 11,
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0],
					halign: 'center',
					valign: 'middle',
					lineWidth: 0.3
				},
				bodyStyles: {
					font: 'times',
					fontSize: 10
				},
				columnStyles: {
					0: { halign: 'center', cellWidth: 15 }, // S.No
					1: { halign: 'center', cellWidth: 25 }, // Course Code
					2: { halign: 'left', cellWidth: 80 }, // Course Title
					3: { halign: 'center', cellWidth: 25 }, // Category
					4: { halign: 'center', cellWidth: 22 }, // Total Students
					5: { halign: 'center', cellWidth: 20 }, // Present
					6: { halign: 'center', cellWidth: 20 }, // Absent
					7: { halign: 'center', cellWidth: 25 } // Attendance %
				},
				margin: { left: margin, right: margin },
				didParseCell: (data) => {
					// Bold the totals row
					if (data.row.index === tableData.length - 1) {
						data.cell.styles.fontStyle = 'bold'
						data.cell.styles.fillColor = [245, 245, 245]
					}
				},
				didDrawPage: (data) => {
					// Add footer with page number and timestamp
					const currentPageNumber = doc.internal.pages.length - 1

					// Page number (centered)
					doc.setFont('times', 'normal')
					doc.setFontSize(10)
					doc.setTextColor(0, 0, 0)
					const footerText = `Page ${currentPageNumber}`
					doc.text(footerText, pageWidth / 2, pageHeight - margin + 10, { align: 'center' })

					// Date & time (right-aligned)
					doc.setFont('times', 'italic')
					doc.setFontSize(9)
					doc.setTextColor(80, 80, 80)
					const timestamp = new Date().toLocaleString('en-GB', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					})
					doc.text(`Generated on: ${timestamp}`, pageWidth - margin, pageHeight - margin + 10, { align: 'right' })
				}
			})

			// Update startY for next table
			startY = (doc as any).lastAutoTable.finalY + 8
		})
	})

	// Save the PDF
	const fileName = `Exam_Attendance_Report_${data.sessionCode.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
