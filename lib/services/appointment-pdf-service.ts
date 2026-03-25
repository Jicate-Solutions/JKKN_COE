import jsPDF from 'jspdf'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'

interface AppointmentLetterData {
	examinerName: string
	examinerDesignation: string
	examinerInstitution: string
	boardName: string
	examName: string
	appointmentType: string
	appointmentDate: string
	reportingTime: string
	venue: string
	subjectName?: string
	institutionName: string
	institutionCode: string
}

/**
 * Generate appointment letter PDF
 */
export async function generateAppointmentLetterPdf(data: AppointmentLetterData): Promise<Buffer> {
	// Get PDF settings
	const settings = await getPdfSettingsWithFallback(data.institutionCode, 'default')

	// Create PDF
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4',
	})

	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 20
	let y = margin

	// Header
	doc.setFontSize(14)
	doc.setFont('helvetica', 'bold')
	doc.text(data.institutionName.toUpperCase(), pageWidth / 2, y, { align: 'center' })
	y += 6

	doc.setFontSize(10)
	doc.setFont('helvetica', 'normal')
	doc.text('KOMARAPALAYAM - 638183', pageWidth / 2, y, { align: 'center' })
	y += 8

	// Office of Controller of Examinations
	doc.setFontSize(11)
	doc.setFont('helvetica', 'bold')
	doc.text('OFFICE OF THE CONTROLLER OF EXAMINATIONS', pageWidth / 2, y, { align: 'center' })
	y += 10

	// Line separator
	doc.setLineWidth(0.5)
	doc.line(margin, y, pageWidth - margin, y)
	y += 10

	// Title based on appointment type
	let title = 'APPOINTMENT ORDER'
	if (data.appointmentType === 'UG_VALUATION') {
		title = 'APPOINTMENT ORDER - UG VALUATION'
	} else if (data.appointmentType === 'PG_VALUATION') {
		title = 'APPOINTMENT ORDER - PG VALUATION'
	} else if (data.appointmentType === 'PRACTICAL') {
		title = 'APPOINTMENT ORDER - PRACTICAL EXAMINATION'
	} else if (data.appointmentType === 'SCRUTINY') {
		title = 'APPOINTMENT ORDER - SCRUTINY'
	}

	doc.setFontSize(12)
	doc.setFont('helvetica', 'bold')
	doc.text(title, pageWidth / 2, y, { align: 'center' })
	y += 15

	// Date
	doc.setFontSize(10)
	doc.setFont('helvetica', 'normal')
	const formattedDate = new Date().toLocaleDateString('en-IN', {
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	})
	doc.text(`Date: ${formattedDate}`, pageWidth - margin, y, { align: 'right' })
	y += 15

	// To
	doc.setFont('helvetica', 'bold')
	doc.text('To,', margin, y)
	y += 6

	doc.setFont('helvetica', 'normal')
	doc.text(data.examinerName, margin, y)
	y += 5

	if (data.examinerDesignation) {
		doc.text(data.examinerDesignation, margin, y)
		y += 5
	}

	if (data.examinerInstitution) {
		const institutionLines = doc.splitTextToSize(data.examinerInstitution, pageWidth - 2 * margin)
		institutionLines.forEach((line: string) => {
			doc.text(line, margin, y)
			y += 5
		})
	}
	y += 10

	// Subject
	doc.setFont('helvetica', 'bold')
	doc.text('Subject:', margin, y)
	doc.setFont('helvetica', 'normal')
	const subjectText = `Appointment as Examiner for ${data.examName} - ${data.boardName}`
	const subjectLines = doc.splitTextToSize(subjectText, pageWidth - 2 * margin - 20)
	doc.text(subjectLines, margin + 20, y)
	y += subjectLines.length * 5 + 10

	// Reference
	doc.setFont('helvetica', 'bold')
	doc.text('Ref:', margin, y)
	doc.setFont('helvetica', 'normal')
	doc.text(`Examination Schedule ${data.examName}`, margin + 12, y)
	y += 10

	// Body
	doc.text('Sir/Madam,', margin, y)
	y += 8

	const bodyPara1 = `With reference to the above, you are hereby appointed as an Examiner for the ${data.boardName} ${getAppointmentTypeLabel(data.appointmentType)} for the examination "${data.examName}".`
	const para1Lines = doc.splitTextToSize(bodyPara1, pageWidth - 2 * margin)
	para1Lines.forEach((line: string) => {
		doc.text(line, margin, y)
		y += 5
	})
	y += 5

	// Details table
	doc.setFont('helvetica', 'bold')
	doc.text('Details:', margin, y)
	y += 8

	const appointmentDateFormatted = new Date(data.appointmentDate).toLocaleDateString('en-IN', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	})

	doc.setFont('helvetica', 'normal')
	const details = [
		['Date', appointmentDateFormatted],
		['Reporting Time', data.reportingTime],
		['Venue', data.venue],
	]

	if (data.subjectName) {
		details.push(['Subject', data.subjectName])
	}

	details.forEach(([label, value]) => {
		doc.setFont('helvetica', 'bold')
		doc.text(`${label}:`, margin + 5, y)
		doc.setFont('helvetica', 'normal')
		doc.text(value, margin + 45, y)
		y += 6
	})
	y += 5

	// Instructions
	const bodyPara2 = 'You are requested to report to the venue at the specified time. Please bring this letter along with your original ID proof for verification.'
	const para2Lines = doc.splitTextToSize(bodyPara2, pageWidth - 2 * margin)
	para2Lines.forEach((line: string) => {
		doc.text(line, margin, y)
		y += 5
	})
	y += 10

	doc.text('Thanking you,', margin, y)
	y += 15

	// Signature
	doc.text('Yours faithfully,', margin, y)
	y += 20

	doc.setFont('helvetica', 'bold')
	doc.text('Controller of Examinations', margin, y)
	y += 5
	doc.setFont('helvetica', 'normal')
	doc.text(data.institutionName, margin, y)

	// Footer note
	y = pageHeight - 25
	doc.setFontSize(8)
	doc.setFont('helvetica', 'italic')
	doc.text('Note: This is a computer-generated document and does not require a physical signature.', pageWidth / 2, y, { align: 'center' })
	y += 4
	doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, y, { align: 'center' })

	// Get PDF as buffer
	const arrayBuffer = doc.output('arraybuffer')
	return Buffer.from(arrayBuffer)
}

function getAppointmentTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		UG_VALUATION: 'UG Valuation',
		PG_VALUATION: 'PG Valuation',
		PRACTICAL: 'Practical Examination',
		SCRUTINY: 'Scrutiny Work',
		CHIEF_EXAMINER: 'Chief Examiner Duty',
		EXTERNAL_EXAMINER: 'External Examiner Duty',
	}
	return labels[type] || type
}

/**
 * Generate valuation appointment letter (specific format)
 */
export async function generateValuationAppointmentPdf(data: AppointmentLetterData): Promise<Buffer> {
	return generateAppointmentLetterPdf(data)
}

/**
 * Generate practical examination appointment letter
 */
export async function generatePracticalAppointmentPdf(data: AppointmentLetterData): Promise<Buffer> {
	return generateAppointmentLetterPdf(data)
}

/**
 * Generate scrutiny appointment letter
 */
export async function generateScrutinyAppointmentPdf(data: AppointmentLetterData): Promise<Buffer> {
	return generateAppointmentLetterPdf(data)
}
