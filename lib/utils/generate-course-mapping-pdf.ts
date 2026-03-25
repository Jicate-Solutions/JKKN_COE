import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface CourseMapping {
	id: string
	semester_code: string
	semester_name: string
	semester_number: number
	display_order: number
	part_name: string
	course_code: string
	course_title: string
	course_category?: string
	course_type?: string
	course_group?: string
	evaluation_pattern?: string
	credits?: number
	exam_hours?: number
	course_order?: number
	sort_order?: number
	internal_max_mark?: number
	internal_pass_mark?: number
	internal_converted_mark?: number
	external_max_mark?: number
	external_pass_mark?: number
	external_converted_mark?: number
	total_max_mark?: number
	total_pass_mark?: number
}

interface ReportData {
	institutionName: string
	institutionAddress?: string
	programName: string
	programCode?: string
	degreeName: string
	regulationName?: string
	regulationCode?: string
	logoImage?: string
	rightLogoImage?: string
	mappings: CourseMapping[]
}

export function generateCourseMappingPDF(data: ReportData) {
	// Debug: Log the data structure
	console.log('PDF Generation Data:', {
		institutionName: data.institutionName,
		programName: data.programName,
		regulationCode: data.regulationCode,
		regulationName: data.regulationName,
		mappingsCount: data.mappings?.length || 0,
		sampleMapping: data.mappings?.[0]
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
				const logoSize = 20
				doc.addImage(data.logoImage, 'PNG', margin, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side - JKKN text logo)
		if (data.rightLogoImage) {
			try {
				const logoSize = 20
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
			}
		}

		// College name and details (centered between logos)
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 10, { align: 'center' })

		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 15, { align: 'center' })

		currentY += 25

		// Program and Regulation info (horizontal layout)
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('Program:', margin + 10, currentY)

		doc.setFont('times', 'normal')
		doc.setFontSize(12)
		doc.text(data.programName, margin + 35, currentY)

		// Regulation on the right side
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		const regulationLabel = 'REGULATION:'
		const regulationLabelWidth = doc.getTextWidth(regulationLabel)
		doc.text(regulationLabel, pageWidth - margin - 70, currentY)

		doc.setFont('times', 'normal')
		doc.setFontSize(12)
		const regulationText = data.regulationCode || data.regulationName || 'N/A'
		doc.text(regulationText, pageWidth - margin - 70 + regulationLabelWidth + 5, currentY)

		currentY += 5

		// Horizontal line
		doc.setLineWidth(0.5)
		doc.setDrawColor(0, 0, 0)
		doc.line(margin, currentY, pageWidth - margin, currentY)

		return currentY + 5
	}

	// Add initial header
	let startY = addHeader()

	// Group mappings by semester
	const semesterGroups = data.mappings.reduce((acc, mapping) => {
		const semKey = mapping.semester_number || mapping.semester_code
		if (!acc[semKey]) {
			acc[semKey] = {
				semesterName: mapping.semester_name,
				semesterNumber: mapping.semester_number,
				courses: []
			}
		}
		acc[semKey].courses.push(mapping)
		return acc
	}, {} as Record<string, { semesterName: string; semesterNumber: number; courses: CourseMapping[] }>)

	// Sort semesters by number
	const sortedSemesters = Object.keys(semesterGroups).sort((a, b) => {
		const semA = semesterGroups[a].semesterNumber || 0
		const semB = semesterGroups[b].semesterNumber || 0
		return semA - semB
	})

	// Generate table for each semester
	sortedSemesters.forEach((semKey, index) => {
		const semester = semesterGroups[semKey]

		// Sort courses by course_order
		const sortedCourses = semester.courses.sort((a, b) => {
			const orderA = a.course_order || 0
			const orderB = b.course_order || 0
			return orderA - orderB
		})

		// Prepare table data
		const tableData = sortedCourses.map((course, courseIndex) => {
			// Use part_name from course (already fetched from courses table)
			const part = course.part_name || '-'

			// Extract just the number from semester_code (e.g., "UCS-1" -> "1")
			let semValue = '-'
			const semCode = course.semester_code || semester.semesterNumber?.toString() || ''
			const semMatch = semCode.match(/(\d+)$/)
			if (semMatch) {
				semValue = semMatch[1]
			} else if (semester.semesterNumber) {
				semValue = semester.semesterNumber.toString()
			}

			return [
				semValue, // Semester number (e.g., "1", "2")
				part, // Part (from courses.course_part_master)
				course.course_code || '-',
				course.course_title || '-',
				course.course_type || '-',
				course.evaluation_pattern || '-',
				course.credits?.toString() || '-',
				course.exam_hours?.toString() || '-',
				// Internal marks (MAX, PASS, CONV)
				course.internal_max_mark?.toString() || '0',
				course.internal_pass_mark?.toString() || '0',
				course.internal_converted_mark?.toString() || '0',
				// ESE marks (MAX, PASS, CONV)
				course.external_max_mark?.toString() || '0',
				course.external_pass_mark?.toString() || '0',
				course.external_converted_mark?.toString() || '0',
				// Total marks (MAX, MIN)
				course.total_max_mark?.toString() || '0',
				course.total_pass_mark?.toString() || '0'
			]
		})

		// Add spacing between semesters
		if (index > 0) {
			startY += 7
		}

		autoTable(doc, {
			startY: startY,
			head: [
				[
					{ content: 'Sem', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Part', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Course\nCode', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Course Name', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Course\nType', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Evaluation\nPattern', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Credit', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Exam\nHRS', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Internal Marks', colSpan: 3, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'ESE Marks', colSpan: 3, styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Total', colSpan: 2, styles: { halign: 'center', valign: 'middle' } }
				],
				[
					'Max', 'Pass', 'Conv', // Internal
					'Max', 'Pass', 'Conv', // ESE
					'Max', 'Pass' // Total
				]
			],
			body: tableData,
			theme: 'grid',
			styles: {
				font: 'times',
				fontStyle: 'normal',
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.3
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fontSize: 11,
				textColor: [0, 0, 0],
				fillColor: [255, 255, 255],
				halign: 'center',
				valign: 'middle',
				lineWidth: 0.3,
				lineColor: [0, 0, 0],
				cellPadding: 1.5
			},
			bodyStyles: {
				font: 'times',
				fontStyle: 'normal',
				fontSize: 11,
				textColor: [0, 0, 0],
				fillColor: [255, 255, 255],
				valign: 'middle',
				lineWidth: 0.3,
				lineColor: [0, 0, 0],
				cellPadding: 1.5
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: 18 }, // SEM
				1: { halign: 'center', cellWidth: 18 }, // PART
				2: { halign: 'center', cellWidth: 28 }, // COURSE CODE
				3: { halign: 'left', cellWidth: 95 }, // COURSE TITLE
				4: { halign: 'center', cellWidth: 18 }, // COURSE TYPE
				5: { halign: 'center', cellWidth: 22 }, // EVALUATION PATTERN
				6: { halign: 'center', cellWidth: 14 }, // CREDIT
				7: { halign: 'center', cellWidth: 14 }, // EXAM HRS
				8: { halign: 'center', cellWidth: 13 }, // INT MAX
				9: { halign: 'center', cellWidth: 13 }, // INT PASS
				10: { halign: 'center', cellWidth: 13 }, // INT CONV
				11: { halign: 'center', cellWidth: 13 }, // ESE MAX
				12: { halign: 'center', cellWidth: 13 }, // ESE PASS
				13: { halign: 'center', cellWidth: 13 }, // ESE CONV
				14: { halign: 'center', cellWidth: 13 }, // TOTAL MAX
				15: { halign: 'center', cellWidth: 13 } // TOTAL MIN
			},
			margin: { left: margin, right: margin, top: margin, bottom: margin },
			tableWidth: 'wrap',
			didDrawPage: (data) => {
				// Add footer with page number and timestamp on all pages
				const currentPageNumber = doc.internal.pages.length - 1 // Get actual page number

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
				const now = new Date()
				const day = String(now.getDate()).padStart(2, '0')
				const month = String(now.getMonth() + 1).padStart(2, '0')
				const year = now.getFullYear()
				const hours = now.getHours()
				const minutes = String(now.getMinutes()).padStart(2, '0')
				const seconds = String(now.getSeconds()).padStart(2, '0')
				const ampm = hours >= 12 ? 'PM' : 'AM'
				const hour12 = hours % 12 || 12
				const timestamp = `${day}/${month}/${year}, ${hour12}:${minutes}:${seconds} ${ampm}`
				doc.text(timestamp, pageWidth - margin, pageHeight - margin + 10, { align: 'right' })
			}
		})

		// Update startY for next table
		startY = (doc as any).lastAutoTable.finalY + 8

		// Add page break after each semester (except the last one)
		if (index < sortedSemesters.length - 1) {
			doc.addPage()
			startY = margin + 5
		}
	})

	// Add signature section at the end of the last page
	const finalY = (doc as any).lastAutoTable.finalY + 20

	// Check if we need a new page for signatures
	if (finalY > pageHeight - 40) {
		doc.addPage()
		startY = margin + 10
	} else {
		startY = finalY
	}

	// Signature section
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)

	// Three signature columns
	const col1X = margin + 20
	const col2X = pageWidth / 2
	const col3X = pageWidth - margin - 60

	doc.text('Signature of the', col1X, startY, { align: 'center' })
	doc.text('Signature of the', col2X, startY, { align: 'center' })
	doc.text('Signature of the', col3X, startY, { align: 'center' })

	doc.text('Class In-charge', col1X, startY + 5, { align: 'center' })
	doc.text('HOD', col2X, startY + 5, { align: 'center' })
	doc.text('Principal', col3X, startY + 5, { align: 'center' })

	// Save the PDF
	const fileName = `${data.programName.replace(/\s+/g, '_')}_${data.regulationCode || 'Regulation'}.pdf`
	doc.save(fileName)
}
