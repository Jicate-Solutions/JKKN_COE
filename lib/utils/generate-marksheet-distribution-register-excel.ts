import ExcelJS from 'exceljs'

interface LearnerRecord {
	register_number: string
	learner_name: string
	dob: string
	email?: string
	phone?: string
}

interface MarksheetDistributionRegisterData {
	institutionName: string
	institutionCode: string
	programName: string
	programCode: string
	programDuration?: number // Number of semesters (e.g., 6 for UG, 4 for PG)
	batchYear?: string
	logoImage?: string // base64 data URL
	rightLogoImage?: string // base64 data URL
	learners: LearnerRecord[]
}

// 9 columns: S.No | Programme | Register No. | Name | Original Mark Sheets | Marksheet No. | Folio No. | Date of print | Remarks
const LAST_COL = 'I'
const TOTAL_COLS = 9

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

export async function generateMarksheetDistributionRegisterExcel(
	data: MarksheetDistributionRegisterData
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	const sheet = workbook.addWorksheet('Distribution Register', {
		pageSetup: {
			paperSize: 5, // Legal
			orientation: 'landscape',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
			horizontalCentered: true,
			margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
		}
	})

	// Footer page numbering: 1/4 style
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
	// Three extra blank rows for handwritten entry (Provisional / Degree / Transfer certificate)
	const marksheetRows = [...semesterLabels, '', '', '']
	const rowsPerLearner = marksheetRows.length

	// Column widths (Excel character units, tuned to mirror the PDF proportions)
	sheet.getColumn(1).width = 6   // S.No
	sheet.getColumn(2).width = 30  // Programme
	sheet.getColumn(3).width = 16  // Register No.
	sheet.getColumn(4).width = 28  // Name of the Students
	sheet.getColumn(5).width = 18  // Original Mark Sheets
	sheet.getColumn(6).width = 18  // Marksheet No.
	sheet.getColumn(7).width = 15  // Folio No.
	sheet.getColumn(8).width = 14  // Date of print
	sheet.getColumn(9).width = 22  // Remarks

	let row = 1

	// ---- Title block ----
	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const nameCell = sheet.getCell(`A${row}`)
	nameCell.value = 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)'
	nameCell.font = { name: 'Times New Roman', bold: true, size: 14 }
	nameCell.alignment = { horizontal: 'center', vertical: 'middle' }
	sheet.getRow(row).height = 20
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const accCell = sheet.getCell(`A${row}`)
	accCell.value = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	accCell.font = { name: 'Times New Roman', size: 9 }
	accCell.alignment = { horizontal: 'center', vertical: 'middle' }
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const addrCell = sheet.getCell(`A${row}`)
	addrCell.value = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'
	addrCell.font = { name: 'Times New Roman', bold: true, size: 10 }
	addrCell.alignment = { horizontal: 'center', vertical: 'middle' }
	row++

	sheet.mergeCells(`A${row}:${LAST_COL}${row}`)
	const titleCell = sheet.getCell(`A${row}`)
	titleCell.value = 'MARKSHEET DISTRIBUTION REGISTER'
	titleCell.font = { name: 'Times New Roman', bold: true, size: 13 }
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
	sheet.getRow(row).height = 20
	row++

	// Program (left) | Batch (right)
	sheet.mergeCells(`A${row}:F${row}`)
	const progCell = sheet.getCell(`A${row}`)
	progCell.value = `Program Code & Name : ${programLabel}`
	progCell.font = { name: 'Times New Roman', bold: true, size: 11 }
	progCell.alignment = { horizontal: 'left', vertical: 'middle' }

	sheet.mergeCells(`G${row}:${LAST_COL}${row}`)
	const batchCell = sheet.getCell(`G${row}`)
	batchCell.value = `Batch: ${data.batchYear || ''}`
	batchCell.font = { name: 'Times New Roman', bold: true, size: 11 }
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
				ext: { width: 58, height: 58 }
			})
		} catch (e) {
			console.warn('Failed to add logo to Excel:', e)
		}
	}
	addLogo(data.logoImage, 0.1)
	addLogo(data.rightLogoImage, 8.15)

	// ---- Table header ----
	const headerRowNum = row
	const headers = [
		'S.No', 'Programme', 'Register No.', 'Name of the Students',
		'Original Mark Sheets', 'Marksheet No.', 'Folio No.', 'Date of print', 'Remarks'
	]
	const headerRow = sheet.getRow(headerRowNum)
	headers.forEach((h, idx) => {
		const cell = headerRow.getCell(idx + 1)
		cell.value = h
		cell.font = { name: 'Times New Roman', bold: true, size: 11 }
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
		cell.border = thinBorder
	})
	headerRow.height = 26
	row++

	// Repeat the header row on every printed page
	sheet.pageSetup.printTitlesRow = `${headerRowNum}:${headerRowNum}`

	// ---- Learner blocks ----
	data.learners.forEach((learner, index) => {
		const blockStart = row

		for (let i = 0; i < marksheetRows.length; i++) {
			const r = sheet.getRow(row)
			r.height = 20

			// Merged identity columns rendered on the first row of the block
			const snoCell = r.getCell(1)
			const progmCell = r.getCell(2)
			const regCell = r.getCell(3)
			const nameC = r.getCell(4)

			if (i === 0) {
				snoCell.value = index + 1
				progmCell.value = programLabel
				regCell.value = learner.register_number
				nameC.value = learner.learner_name
			}

			snoCell.font = { name: 'Times New Roman', size: 10 }
			snoCell.alignment = { horizontal: 'center', vertical: 'middle' }
			progmCell.font = { name: 'Times New Roman', size: 10 }
			progmCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
			regCell.font = { name: 'Times New Roman', size: 10 }
			regCell.alignment = { horizontal: 'center', vertical: 'middle' }
			nameC.font = { name: 'Times New Roman', bold: true, size: 10 }
			nameC.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

			// Original Mark Sheets label
			const omsCell = r.getCell(5)
			omsCell.value = marksheetRows[i]
			omsCell.font = { name: 'Times New Roman', size: 10 }
			omsCell.alignment = { horizontal: 'left', vertical: 'middle' }

			// Blank columns for manual entry
			for (let c = 6; c <= TOTAL_COLS; c++) {
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
			sheet.mergeCells(`B${blockStart}:B${blockEnd}`) // Programme
			sheet.mergeCells(`C${blockStart}:C${blockEnd}`) // Register No.
			sheet.mergeCells(`D${blockStart}:D${blockEnd}`) // Name
		}

		// Manual page break after every 2nd learner -> 2 learners per printed page
		if ((index + 1) % 2 === 0 && index !== data.learners.length - 1) {
			try {
				;(sheet.getRow(blockEnd) as any).addPageBreak()
			} catch {
				// addPageBreak unavailable — print fit settings still apply
			}
		}
	})

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

/**
 * Download Excel file helper (for browser)
 */
export function downloadRegisterExcel(buffer: Buffer, filename: string) {
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
