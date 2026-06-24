import ExcelJS from 'exceljs'

interface LearnerRecord {
	register_number: string
	learner_name: string
	dob: string
	email?: string
	phone?: string
}

interface MarksheetDistributionData {
	institutionName: string
	institutionCode: string
	programName: string
	programCode: string
	programDuration?: number // Number of semesters (6 for UG, 4 for PG)
	batchYear?: string
	logoImage?: string // base64 data URL
	rightLogoImage?: string // base64 data URL
	learners: LearnerRecord[]
}

// 7 columns: S.No | Reg. No/Name/DOB | Original Mark Sheets | Issue Date | Signature | Arrears Certificate Issue Date | Signature
const LAST_COL = 'G'
const TOTAL_COLS = 7

function getOrdinalSuffix(n: number): string {
	if (n === 1) return 'st'
	if (n === 2) return 'nd'
	if (n === 3) return 'rd'
	return 'th'
}

const thinBorder: Partial<ExcelJS.Borders> = {
	top: { style: 'thin', color: { argb: 'FF000000' } },
	left: { style: 'thin', color: { argb: 'FF000000' } },
	bottom: { style: 'thin', color: { argb: 'FF000000' } },
	right: { style: 'thin', color: { argb: 'FF000000' } }
}

export async function generateMarksheetDistributionExcel(
	data: MarksheetDistributionData
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	const sheet = workbook.addWorksheet('Distribution List', {
		pageSetup: {
			paperSize: 9, // A4
			orientation: 'portrait',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
			horizontalCentered: true,
			margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
		}
	})

	sheet.headerFooter.oddFooter = '&C&"Times New Roman"&9&P/&N'

	const programLabel = `${data.programCode} - ${data.programName}`

	// UG (code starts with 'U') runs 6 semesters; PG (starts with 'P') runs 4
	const isPG = (data.programCode || '').trim().toUpperCase().startsWith('P')
	const programDuration = data.programDuration || (isPG ? 4 : 6)

	const semesterLabels: string[] = []
	for (let i = 1; i <= programDuration; i++) {
		semesterLabels.push(`${i}${getOrdinalSuffix(i)} Semester`)
	}
	semesterLabels.push('Con.Marksheet')
	const certificateRows = ['Provisional certificate', 'Degree certificate', 'Transfer certificate']
	const marksheetRows = [...semesterLabels, ...certificateRows]
	const rowsPerLearner = marksheetRows.length

	// Column widths
	sheet.getColumn(1).width = 6   // S.No
	sheet.getColumn(2).width = 26  // Reg. No/Name/DOB
	sheet.getColumn(3).width = 18  // Original Mark Sheets
	sheet.getColumn(4).width = 14  // Issue Date
	sheet.getColumn(5).width = 18  // Signature
	sheet.getColumn(6).width = 16  // Arrears Certificate Issue Date
	sheet.getColumn(7).width = 18  // Signature

	let row = 1

	// ---- Title block ----
	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const nameCell = sheet.getCell(`A${row}`)
	nameCell.value = 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)'
	nameCell.font = { name: 'Times New Roman', bold: true, size: 13 }
	nameCell.alignment = { horizontal: 'center', vertical: 'middle' }
	sheet.getRow(row).height = 20
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const accCell = sheet.getCell(`A${row}`)
	accCell.value = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	accCell.font = { name: 'Times New Roman', size: 8 }
	accCell.alignment = { horizontal: 'center', vertical: 'middle' }
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const addrCell = sheet.getCell(`A${row}`)
	addrCell.value = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'
	addrCell.font = { name: 'Times New Roman', bold: true, size: 9 }
	addrCell.alignment = { horizontal: 'center', vertical: 'middle' }
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const titleCell = sheet.getCell(`A${row}`)
	titleCell.value = 'MARKSHEET DISTRIBUTION'
	titleCell.font = { name: 'Times New Roman', bold: true, size: 12 }
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
	sheet.getRow(row).height = 18
	row++

	// Program (left) | Batch (right)
	sheet.mergeCells(`A${row}:E${row}`)
	const progCell = sheet.getCell(`A${row}`)
	progCell.value = `Program Code & Name : ${programLabel}`
	progCell.font = { name: 'Times New Roman', bold: true, size: 10 }
	progCell.alignment = { horizontal: 'left', vertical: 'middle' }

	sheet.mergeCells(`F${row}:${LAST_COL}${row}`)
	const batchCell = sheet.getCell(`F${row}`)
	batchCell.value = `Batch: ${data.batchYear || ''}`
	batchCell.font = { name: 'Times New Roman', bold: true, size: 10 }
	batchCell.alignment = { horizontal: 'right', vertical: 'middle' }
	row++

	// Optional logos floating over the title block
	const addLogo = (dataUrl: string | undefined, anchorCol: number) => {
		if (!dataUrl) return
		try {
			const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
			const imgId = workbook.addImage({ base64, extension: 'png' })
			sheet.addImage(imgId, {
				tl: { col: anchorCol, row: 0.1 } as any,
				ext: { width: 52, height: 52 }
			})
		} catch (e) {
			console.warn('Failed to add logo to Excel:', e)
		}
	}
	addLogo(data.logoImage, 0.1)
	addLogo(data.rightLogoImage, 6.2)

	// ---- Table header ----
	const headerRowNum = row
	const headers = [
		'S.No', 'Reg. No/Name/ DOB', 'Original Mark Sheets',
		'Issue Date', 'Signature', 'Arrears Certificate Issue Date', 'Signature'
	]
	const headerRow = sheet.getRow(headerRowNum)
	headers.forEach((h, idx) => {
		const cell = headerRow.getCell(idx + 1)
		cell.value = h
		cell.font = { name: 'Times New Roman', bold: true, size: 10 }
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
		cell.border = thinBorder
	})
	headerRow.height = 30
	row++

	sheet.pageSetup.printTitlesRow = `${headerRowNum}:${headerRowNum}`

	// ---- Learner blocks ----
	data.learners.forEach((learner, index) => {
		const blockStart = row

		for (let i = 0; i < marksheetRows.length; i++) {
			const r = sheet.getRow(row)
			r.height = 20

			const snoCell = r.getCell(1)
			const regCell = r.getCell(2)

			if (i === 0) {
				snoCell.value = index + 1
				regCell.value = `${learner.register_number}\n${learner.learner_name}\n${learner.dob}`
			}

			snoCell.font = { name: 'Times New Roman', size: 10 }
			snoCell.alignment = { horizontal: 'center', vertical: 'middle' }
			regCell.font = { name: 'Times New Roman', bold: true, size: 10 }
			regCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

			// Original Mark Sheets label
			const omsCell = r.getCell(3)
			omsCell.value = marksheetRows[i]
			omsCell.font = { name: 'Times New Roman', size: 10 }
			omsCell.alignment = { horizontal: 'left', vertical: 'middle' }

			// Blank columns for manual entry
			for (let c = 4; c <= TOTAL_COLS; c++) {
				r.getCell(c).value = ''
			}

			// Borders on every cell in the row
			for (let c = 1; c <= TOTAL_COLS; c++) {
				r.getCell(c).border = thinBorder
			}

			row++
		}

		const blockEnd = row - 1

		// Vertically merge the identity columns across the learner's block
		if (blockEnd > blockStart) {
			sheet.mergeCells(`A${blockStart}:A${blockEnd}`) // S.No
			sheet.mergeCells(`B${blockStart}:B${blockEnd}`) // Reg. No/Name/DOB
		}

		// Page break after every 2nd learner -> 2 learners per printed page
		if ((index + 1) % 2 === 0 && index !== data.learners.length - 1) {
			try {
				;(sheet.getRow(blockEnd) as any).addPageBreak()
			} catch {
				// addPageBreak unavailable — fit settings still apply
			}
		}
	})

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

/**
 * Download Excel file helper (for browser)
 */
export function downloadDistributionExcel(buffer: Buffer, filename: string) {
	const blob = new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	})
	const url = window.URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	window.URL.revokeObjectURL(url)
}
