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
	institutionCode?: string
	institutionName: string
	institutionSubHeadings?: string[]
	accreditationText?: string
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
		doc.text(data.institutionName, pageWidth / 2, currentY + 5, { align: 'center' })

		let headerY = currentY + 10

		// Optional sub-headings (e.g., "An Autonomous Institution", "Managed by ...")
		if (data.institutionSubHeadings && data.institutionSubHeadings.length > 0) {
			doc.setFont('times', 'normal')
			doc.setFontSize(10)
			data.institutionSubHeadings.forEach((line) => {
				doc.text(line, pageWidth / 2, headerY, { align: 'center' })
				headerY += 4.5
			})
		}

		// Accreditation / affiliation
		if (data.accreditationText) {
			doc.setFont('times', 'normal')
			doc.setFontSize(10)
			doc.text(data.accreditationText, pageWidth / 2, headerY, { align: 'center' })
			headerY += 5
		}

		// Address
		if (data.institutionAddress) {
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.text(data.institutionAddress, pageWidth / 2, headerY, { align: 'center' })
			headerY += 5
		}

		currentY = Math.max(currentY + 25, headerY + 2)

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

		// CET-specific layout: show Internal Marks as single column (weightage)
		const isCET = (data.institutionCode || '').toUpperCase() === 'CET'

		// Prepare table data (Part column removed for all institutions)
		const tableData = sortedCourses.map((course, courseIndex) => {
			// Extract just the number from semester_code (e.g., "UCS-1" -> "1")
			let semValue = '-'
			const semCode = course.semester_code || semester.semesterNumber?.toString() || ''
			const semMatch = semCode.match(/(\d+)$/)
			if (semMatch) {
				semValue = semMatch[1]
			} else if (semester.semesterNumber) {
				semValue = semester.semesterNumber.toString()
			}

			const baseCols: string[] = [
				semValue,
				course.course_code || '-',
				course.course_title || '-',
				course.course_type || '-',
				course.evaluation_pattern || '-',
				course.credits?.toString() || '-',
				course.exam_hours?.toString() || '-',
			]

			if (isCET) {
				// Single Internal Marks column (weightage = converted mark)
				baseCols.push(course.internal_converted_mark?.toString() || '0')
			} else {
				// Internal marks (MAX, PASS, CONV)
				baseCols.push(
					course.internal_max_mark?.toString() || '0',
					course.internal_pass_mark?.toString() || '0',
					course.internal_converted_mark?.toString() || '0',
				)
			}

			baseCols.push(
				// ESE marks (MAX, PASS, CONV)
				course.external_max_mark?.toString() || '0',
				course.external_pass_mark?.toString() || '0',
				course.external_converted_mark?.toString() || '0',
				// Total marks (MAX, MIN)
				course.total_max_mark?.toString() || '0',
				course.total_pass_mark?.toString() || '0'
			)

			return baseCols
		})

		// Add spacing between semesters
		if (index > 0) {
			startY += 7
		}

		const headRow1: any[] = [
			{ content: 'Sem', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
		]
		headRow1.push(
			{ content: 'Course\nCode', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Course Name', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Course\nType', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Evaluation\nPattern', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Credit', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Exam\nHRS', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
		)
		if (isCET) {
			headRow1.push({ content: 'Internal Marks', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } })
		} else {
			headRow1.push({ content: 'Internal Marks', colSpan: 3, styles: { halign: 'center', valign: 'middle' } })
		}
		headRow1.push(
			{ content: 'ESE Marks', colSpan: 3, styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Total', colSpan: 2, styles: { halign: 'center', valign: 'middle' } }
		)

		const headRow2: string[] = []
		if (!isCET) headRow2.push('Max', 'Pass', 'Conv') // Internal sub-headers only when not CET
		headRow2.push('Max', 'Pass', 'Conv') // ESE
		headRow2.push('Max', 'Pass') // Total

		autoTable(doc, {
			startY: startY,
			head: [headRow1, headRow2],
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
			columnStyles: (() => {
				// Fixed widths for every column except Course Name (which absorbs remaining space)
				const semW = 18
				const codeW = 28
				const typeW = 18
				const evalW = 22
				const creditW = 14
				const examW = 14
				const internalW = isCET ? 20 : 13 * 3 // single col vs Max/Pass/Conv
				const eseW = 13 * 3 // Max/Pass/Conv
				const totalW = 13 * 2 // Max/Pass
				const fixedTotal = semW + codeW + typeW + evalW + creditW + examW + internalW + eseW + totalW
				const nameW = Math.max(60, contentWidth - fixedTotal) // fill remaining space

				const styles: Record<number, any> = {}
				let i = 0
				styles[i++] = { halign: 'center', cellWidth: semW } // SEM
				styles[i++] = { halign: 'center', cellWidth: codeW } // COURSE CODE
				styles[i++] = { halign: 'left', cellWidth: nameW } // COURSE TITLE (flexes)
				styles[i++] = { halign: 'center', cellWidth: typeW } // COURSE TYPE
				styles[i++] = { halign: 'center', cellWidth: evalW } // EVALUATION PATTERN
				styles[i++] = { halign: 'center', cellWidth: creditW } // CREDIT
				styles[i++] = { halign: 'center', cellWidth: examW } // EXAM HRS
				if (isCET) {
					styles[i++] = { halign: 'center', cellWidth: internalW } // INTERNAL MARKS (single)
				} else {
					styles[i++] = { halign: 'center', cellWidth: 13 } // INT MAX
					styles[i++] = { halign: 'center', cellWidth: 13 } // INT PASS
					styles[i++] = { halign: 'center', cellWidth: 13 } // INT CONV
				}
				styles[i++] = { halign: 'center', cellWidth: 13 } // ESE MAX
				styles[i++] = { halign: 'center', cellWidth: 13 } // ESE PASS
				styles[i++] = { halign: 'center', cellWidth: 13 } // ESE CONV
				styles[i++] = { halign: 'center', cellWidth: 13 } // TOTAL MAX
				styles[i++] = { halign: 'center', cellWidth: 13 } // TOTAL MIN
				return styles
			})(),
			margin: { left: margin, right: margin, top: margin, bottom: margin },
			tableWidth: contentWidth,
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
