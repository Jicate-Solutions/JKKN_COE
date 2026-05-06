import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getProgramDisplayName } from './program-name-mapper'

interface StudentRecord {
	register_number: string
	student_name: string
	attendance_status: 'PRESENT' | 'ABSENT'
	program_code: string
	program_name: string
	semester: string
}

interface CourseData {
	course_code: string
	course_title: string
	program_code: string
	program_name: string
	program_order: number
	semester: string
	students: StudentRecord[]
}

interface SheetMetadata {
	exam_date: string
	session: string
	session_name: string
	institution_name: string
	institution_code: string
	regulation_code: string
}

interface AttendanceSheet {
	metadata: SheetMetadata
	courses: CourseData[]
}

/**
 * Institution PDF Settings - configurable header/footer settings
 * These settings come from the pdf_institution_settings table
 */
interface InstitutionPdfSettings {
	// Institution details
	institution_name: string
	institution_code: string
	accreditation_text?: string
	address?: string

	// Logo settings
	logo_url?: string
	logo_width?: string
	logo_height?: string
	secondary_logo_url?: string
	secondary_logo_width?: string
	secondary_logo_height?: string

	// Color scheme
	primary_color?: string
	secondary_color?: string

	// Font settings
	font_family?: string
	font_size_heading?: string
	font_size_body?: string
}

interface StudentAttendanceSheetData {
	sheets: AttendanceSheet[]
	logoImage?: string
	rightLogoImage?: string
	/** Optional: Institution PDF settings from database */
	institutionSettings?: InstitutionPdfSettings
}

export function generateStudentAttendanceSheetPDF(data: StudentAttendanceSheetData): string {
	// Create a single PDF document for all sheets
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm

	// Get institution settings or use defaults
	const settings = data.institutionSettings
	const defaultInstitutionName = 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)'
	const defaultAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	const defaultAddress = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'

	// Process each sheet (grouped by exam_date, session)
	data.sheets.forEach((sheet, sheetIndex) => {
		// Add new page for each sheet (except the first one)
		if (sheetIndex > 0) {
			doc.addPage()
		}

		// Process each course within the sheet
		sheet.courses.forEach((course, courseIndex) => {
			// Add new page for each course (except the first course of first sheet)
			if (sheetIndex > 0 || courseIndex > 0) {
				doc.addPage()
			}

			let currentY = margin

			// ========== HEADER SECTION ==========

			// Parse logo dimensions from settings (convert px to mm)
			const parsePxToMm = (value?: string): number => {
				if (!value) return 20 // default 20mm
				const px = parseInt(value.replace('px', ''), 10)
				return isNaN(px) ? 20 : px * 0.264583 // px to mm conversion
			}

			const logoWidth = parsePxToMm(settings?.logo_width)
			const logoHeight = parsePxToMm(settings?.logo_height)
			const secondaryLogoWidth = parsePxToMm(settings?.secondary_logo_width)
			const secondaryLogoHeight = parsePxToMm(settings?.secondary_logo_height)

			// College Logo (left side)
			if (data.logoImage) {
				try {
					doc.addImage(data.logoImage, 'PNG', margin, currentY, logoWidth, logoHeight)
				} catch (e) {
					console.warn('Failed to add logo to PDF:', e)
				}
			}

			// College Logo (right side - secondary logo)
			if (data.rightLogoImage) {
				try {
					doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - secondaryLogoWidth, currentY, secondaryLogoWidth, secondaryLogoHeight)
				} catch (e) {
					console.warn('Failed to add right logo to PDF:', e)
				}
			}

			// Get text color from settings or use black
			const parseHexColor = (hex?: string): [number, number, number] => {
				if (!hex || !hex.startsWith('#')) return [0, 0, 0]
				const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
				return result
					? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
					: [0, 0, 0]
			}

			const primaryColor = parseHexColor(settings?.primary_color)
			const secondaryColor = parseHexColor(settings?.secondary_color)

			// Institution name (centered between logos)
			const institutionName = settings?.institution_name || sheet.metadata.institution_name || defaultInstitutionName
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
			doc.text(institutionName.toUpperCase(), pageWidth / 2, currentY + 5, { align: 'center' })

			// Accreditation text
			const accreditationText = settings?.accreditation_text || defaultAccreditation
			doc.setFont('times', 'normal')
			doc.setFontSize(8)
			doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])

			// Split accreditation text into lines if it contains newline
			const accreditationLines = accreditationText.split('\n')
			let accreditationY = currentY + 10
			accreditationLines.forEach((line) => {
				doc.text(line, pageWidth / 2, accreditationY, { align: 'center' })
				accreditationY += 4
			})

			// Address
			const address = settings?.address || defaultAddress
			doc.setFont('times', 'bold')
			doc.setFontSize(9)
			doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
			doc.text(address, pageWidth / 2, currentY + 19, { align: 'center' })

			// Report Title
			doc.setFont('times', 'bold')
			doc.setFontSize(11)
			doc.setTextColor(0, 0, 0)
			doc.text('Student Attendance Sheet', pageWidth / 2, currentY + 25, { align: 'center' })

			currentY += 37

			// ========== COURSE INFORMATION SECTION ==========

			doc.setFont('times', 'bold')
			doc.setFontSize(9)

			const infoY = currentY
			const col1X = margin + 2
			const col2X = pageWidth * 0.65

			// Calculate total students for this course
			const totalStudents = course.students.length
			const presentCount = course.students.filter(s => s.attendance_status === 'PRESENT').length
			const absentCount = course.students.filter(s => s.attendance_status === 'ABSENT').length

			// Left side - Program code & Name
			doc.text('Program code & Name', col1X, infoY)
			doc.setFont('times', 'normal')
			const displayProgramName = getProgramDisplayName(course.program_code, course.program_name)
			doc.text(`: ${course.program_code} - ${displayProgramName}`, col1X + 45, infoY)

			// Right side - Examination
			doc.setFont('times', 'bold')
			doc.text('Examination', col2X, infoY)
			doc.setFont('times', 'normal')
			doc.text(`: ${sheet.metadata.session_name}`, col2X + 25, infoY)

			currentY += 5

			// Subject (with text wrapping for long course titles)
			doc.setFont('times', 'bold')
			doc.text('Subject Code & Name', col1X, currentY)
			doc.setFont('times', 'normal')

			// Calculate available width for subject text
			const subjectTextMaxWidth = col2X - (col1X + 45) - 5
			const subjectText = `: ${course.course_code} - ${course.course_title}`
			const subjectLines = doc.splitTextToSize(subjectText, subjectTextMaxWidth)
			doc.text(subjectLines, col1X + 45, currentY)

			// Total Students (aligned to the first line of subject)
			doc.setFont('times', 'bold')
			doc.text('Total Students :', col2X, currentY)
			doc.setFont('times', 'normal')
			doc.text(totalStudents.toString(), col2X + 30, currentY)

			// Adjust currentY based on subject text height
			if (subjectLines.length > 1) {
				currentY += (subjectLines.length - 1) * 4
			}

			currentY += 5

			// Date & Session
			doc.setFont('times', 'bold')
			doc.text('Date & Session', col1X, currentY)
			doc.setFont('times', 'normal')
			doc.text(`: ${sheet.metadata.exam_date} & ${sheet.metadata.session}`, col1X + 45, currentY)

			// Present/Absent counts
			doc.setFont('times', 'bold')
			doc.text('Present :', col2X, currentY)
			doc.setFont('times', 'normal')
			doc.text(presentCount.toString(), col2X + 17, currentY)

			doc.setFont('times', 'bold')
			doc.text('Absent :', col2X + 25, currentY)
			doc.setFont('times', 'normal')
			doc.text(absentCount.toString(), col2X + 38, currentY)

			currentY += 3

			// Horizontal line
			doc.setLineWidth(0.5)
			doc.setDrawColor(0, 0, 0)
			doc.line(margin, currentY, pageWidth - margin, currentY)

			currentY += 5

			// ========== STUDENT ATTENDANCE TABLE ==========

			const tableData = course.students.map((student, index) => {
				return [
					(index + 1).toString(),
					student.register_number,
					student.student_name,
					student.attendance_status
				]
			})

			autoTable(doc, {
				startY: currentY,
				head: [
					[
						'S.No',
						'Register Number',
						'Student Name',
						'Attendance Status'
					]
				],
				body: tableData,
				theme: 'grid',
				styles: {
					font: 'times',
					fontStyle: 'normal',
					fontSize: 9,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 2
				},
				headStyles: {
					font: 'times',
					fontStyle: 'bold',
					fontSize: 10,
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0],
					halign: 'center',
					valign: 'middle',
					lineWidth: 0.3
				},
				bodyStyles: {
					font: 'times',
					fontSize: 9
				},
				columnStyles: {
					0: { halign: 'center', cellWidth: 15 }, // S.No
					1: { halign: 'center', cellWidth: 35 }, // Register Number
					2: { halign: 'left', cellWidth: 80 }, // Student Name
					3: { halign: 'center', cellWidth: 35 } // Attendance Status
				},
				margin: { left: margin, right: margin },
				didParseCell: (data) => {
					// Highlight PRESENT in green, ABSENT in red
					if (data.column.index === 3 && data.section === 'body') {
						if (data.cell.text[0] === 'PRESENT') {
							data.cell.styles.textColor = [0, 128, 0] // Green
							data.cell.styles.fontStyle = 'bold'
						} else if (data.cell.text[0] === 'ABSENT') {
							data.cell.styles.textColor = [255, 0, 0] // Red
							data.cell.styles.fontStyle = 'bold'
						}
					}
				},
				didDrawPage: (data) => {
					// Add footer with page number and timestamp
					const pageCount = (doc as any).internal.getNumberOfPages()
					const currentPageNumber = (doc as any).internal.getCurrentPageInfo().pageNumber

					// Page number (centered)
					doc.setFont('times', 'normal')
					doc.setFontSize(9)
					doc.setTextColor(0, 0, 0)
					const footerText = `Page ${currentPageNumber} of ${pageCount}`
					doc.text(footerText, pageWidth / 2, pageHeight - margin + 5, { align: 'center' })

					// Date & time (right-aligned)
					doc.setFont('times', 'italic')
					doc.setFontSize(8)
					doc.setTextColor(80, 80, 80)
					const timestamp = new Date().toLocaleString('en-GB', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					})
					doc.text(`Generated on: ${timestamp}`, pageWidth - margin, pageHeight - margin + 5, { align: 'right' })
				}
			})
		})
	})

	// Save the combined PDF with a single filename
	const fileName = `Student_Attendance_Sheets_${data.sheets[0]?.metadata.session_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
