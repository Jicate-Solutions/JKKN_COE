import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface AbsentStudent {
	register_number: string
	student_name: string
	is_regular: boolean
	program_code: string
}

interface AbsentCourse {
	course_code: string
	course_name: string
	program_code: string
	students: AbsentStudent[]
}

interface AbsentListData {
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	exam_date: string // DD-MM-YYYY
	session_type: string // FN or AN
	courses: AbsentCourse[]
	total_absent: number
	logoImage?: string
	rightLogoImage?: string
}

export function generateAbsentListPDF(data: AbsentListData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7
	const contentWidth = pageWidth - 2 * margin

	const addHeader = () => {
		let currentY = margin

		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, 22, 22)
			} catch (e) {
				console.warn('Failed to add left logo:', e)
			}
		}

		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 22, currentY, 22, 22)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 6, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(7)
		doc.text(
			'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
			pageWidth / 2,
			currentY + 11,
			{ align: 'center' }
		)

		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 16, { align: 'center' })

		currentY += 24

		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.text('ABSENT LIST (COURSE-WISE)', pageWidth / 2, currentY, { align: 'center' })

		currentY += 6

		// Session / Date / FN-AN row
		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		const sessionText = data.session_name || data.session_code
		doc.text(`Session: ${sessionText}`, margin, currentY)
		doc.text(`Date: ${data.exam_date}`, pageWidth / 2, currentY, { align: 'center' })
		doc.text(`Session (FN/AN): ${data.session_type}`, pageWidth - margin, currentY, { align: 'right' })

		currentY += 3

		doc.setLineWidth(0.5)
		doc.setDrawColor(0, 0, 0)
		doc.line(margin, currentY, pageWidth - margin, currentY)

		return currentY + 5
	}

	let startY = addHeader()

	if (!data.courses || data.courses.length === 0) {
		doc.setFont('times', 'italic')
		doc.setFontSize(11)
		doc.text('No absent learners found for the selected criteria.', pageWidth / 2, startY + 20, { align: 'center' })
		const fileName = `Absent_List_${data.session_code.replace(/\s+/g, '_')}_${data.exam_date.replace(/-/g, '')}_${data.session_type}.pdf`
		doc.save(fileName)
		return fileName
	}

	// Summary
	autoTable(doc, {
		startY,
		head: [['Summary', '']],
		body: [
			['Total Courses', data.courses.length.toString()],
			['Total Absent Learners', data.total_absent.toString()]
		],
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 11,
			fillColor: [220, 220, 220],
			halign: 'center',
			textColor: [0, 0, 0]
		},
		columnStyles: {
			0: { fontStyle: 'bold', cellWidth: 80 },
			1: { halign: 'right', cellWidth: 40 }
		},
		margin: { left: margin, right: margin }
	})

	startY = (doc as any).lastAutoTable.finalY + 6

	data.courses.forEach((course, courseIndex) => {
		if (startY > pageHeight - 40) {
			doc.addPage()
			startY = addHeader()
		}

		// Course header banner
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.setFillColor(240, 240, 240)
		doc.rect(margin, startY - 4, contentWidth, 8, 'F')
		doc.setTextColor(0, 0, 0)
		doc.text(
			`${course.course_code} - ${course.course_name}${course.program_code && course.program_code !== '-' ? `  (Program: ${course.program_code})` : ''}`,
			margin + 2,
			startY + 1
		)
		doc.text(`Absent: ${course.students.length}`, pageWidth - margin - 2, startY + 1, { align: 'right' })
		startY += 8

		const tableData = course.students.map((s, i) => [
			(i + 1).toString(),
			s.register_number || '-',
			s.student_name || '-',
			s.program_code || '-',
			s.is_regular ? 'Regular' : 'Arrear'
		])

		autoTable(doc, {
			startY,
			head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Type']],
			body: tableData,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 9.5,
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				cellPadding: 1.8
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
			columnStyles: {
				0: { halign: 'center', cellWidth: 12 },
				1: { halign: 'center', cellWidth: 32 },
				2: { halign: 'left', cellWidth: 'auto' },
				3: { halign: 'center', cellWidth: 24 },
				4: { halign: 'center', cellWidth: 22 }
			},
			margin: { left: margin, right: margin },
			didDrawPage: () => {
				const currentPageNumber = doc.internal.pages.length - 1
				doc.setFont('times', 'normal')
				doc.setFontSize(9)
				doc.setTextColor(0, 0, 0)
				doc.text(`Page ${currentPageNumber}`, pageWidth / 2, pageHeight - margin + 8, { align: 'center' })

				doc.setFont('times', 'italic')
				doc.setFontSize(8)
				doc.setTextColor(80, 80, 80)
				const timestamp = new Date().toLocaleString('en-GB', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
				doc.text(`Generated on: ${timestamp}`, pageWidth - margin, pageHeight - margin + 8, { align: 'right' })
			}
		})

		startY = (doc as any).lastAutoTable.finalY + 6
	})

	const fileName = `Absent_List_${data.session_code.replace(/\s+/g, '_')}_${data.exam_date.replace(/-/g, '')}_${data.session_type}.pdf`
	doc.save(fileName)
	return fileName
}
