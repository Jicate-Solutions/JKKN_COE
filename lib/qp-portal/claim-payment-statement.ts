// The consolidated claim statement the office sends to accounts — one line per
// examiner with the account to pay and the total claimed — as a workbook laid
// out like the office's own payment sheets:
//
//   ┌──────────────────────────────────────────────────────────────┬────────────┐
//   │            OFFICE OF THE CONTROLLER OF EXAMINATIONS          │ 06.10.2026 │
//   ├──────────────────────────────────────────────────────────────┴────────────┤
//   │   B.E / M.E / MBA - Autonomous - Question Paper Setting - NOV-DEC-2026 -  │
//   │                              Examinations                                 │
//   ├──────┬──────────────────┬──────────────┬────────┬──────────┬──────┬───────┤
//   │ S.No │ Name of Examiner │ Name of Bank │ Branch │ Account… │ IFSC │ Amount│ Remarks
//   └──────┴──────────────────┴──────────────┴────────┴──────────┴──────┴───────┘
//
// Serif type, ruled cells, a filter on the heading row, the account number kept
// as text so Excel never turns it into 1.23E+15, and a Total line at the foot.

import ExcelJS from 'exceljs'

export interface PaymentStatementRow {
	full_name: string
	bank_name: string | null
	branch: string | null
	account_number: string | null
	ifsc: string | null
	amount: number
}

export interface PaymentStatementHead {
	/** "B.E / M.E / MBA / MCA" — the college's degrees, or its programme codes. */
	programmes: string
	/** "NOV-DEC-2026" */
	session: string
	/** "Question Paper Setting" — the work being paid for. */
	work?: string
	/** Printed top-right; defaults to today in IST. */
	date?: Date
}

const SERIF = { name: 'Times New Roman', size: 11 } as const
const THIN = { style: 'thin' } as const
const RULED = { top: THIN, bottom: THIN, left: THIN, right: THIN } as const

/** dd.mm.yyyy in IST, the form the office's sheets carry. */
function statementDate(d: Date): string {
	const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
	const dd = String(ist.getUTCDate()).padStart(2, '0')
	const mm = String(ist.getUTCMonth() + 1).padStart(2, '0')
	return `${dd}.${mm}.${ist.getUTCFullYear()}`
}

export async function buildPaymentStatement(rows: PaymentStatementRow[], head: PaymentStatementHead): Promise<Buffer> {
	const wb = new ExcelJS.Workbook()
	wb.created = new Date()
	const ws = wb.addWorksheet('Payment Statement', {
		pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3' },
		views: [{ state: 'frozen', ySplit: 3 }],
	})
	ws.columns = [
		{ key: 'sno', width: 7 },
		{ key: 'name', width: 30 },
		{ key: 'bank', width: 24 },
		{ key: 'branch', width: 24 },
		{ key: 'account', width: 22 },
		{ key: 'ifsc', width: 16 },
		{ key: 'amount', width: 12 },
		{ key: 'remarks', width: 16 },
	]
	const LAST = 8
	/** Columns whose text wraps; a long bank or branch name must not be cut at the cell edge. */
	const WRAPPED: Array<{ key: 'name' | 'bank' | 'branch'; width: number }> = [
		{ key: 'name', width: 30 },
		{ key: 'bank', width: 24 },
		{ key: 'branch', width: 24 },
	]
	const ROW_HEIGHT = 24

	// Row 1 — the office, and the date at the right.
	ws.mergeCells(1, 1, 1, LAST - 1)
	const title = ws.getCell(1, 1)
	title.value = 'OFFICE OF THE CONTROLLER OF EXAMINATIONS'
	title.font = { ...SERIF, size: 12, bold: true }
	title.alignment = { horizontal: 'center', vertical: 'middle' }
	const date = ws.getCell(1, LAST)
	date.value = statementDate(head.date || new Date())
	date.font = { ...SERIF, bold: true }
	date.alignment = { horizontal: 'center', vertical: 'middle' }
	ws.getRow(1).height = 22

	// Row 2 — what is being paid for, in which session.
	ws.mergeCells(2, 1, 2, LAST)
	const sub = ws.getCell(2, 1)
	sub.value = [head.programmes, 'Autonomous', head.work || 'Question Paper Setting', head.session, 'Examinations']
		.filter(Boolean)
		.join(' - ')
	sub.font = { ...SERIF, bold: true }
	sub.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
	ws.getRow(2).height = 22

	// Row 3 — the headings, with a filter.
	const headings = ['S. No', 'Name of the Examiner', 'Name of the Bank', 'Branch', 'Account Number', 'IFSC Code', 'Amount', 'Remarks']
	const headRow = ws.getRow(3)
	headings.forEach((h, i) => {
		const c = headRow.getCell(i + 1)
		c.value = h
		c.font = { ...SERIF, bold: true }
		c.alignment = { horizontal: i === 0 || i === 6 ? 'center' : 'left', vertical: 'middle', wrapText: true }
	})
	headRow.height = 24
	ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST } }

	// The examiners.
	let total = 0
	rows.forEach((r, i) => {
		total += Number(r.amount) || 0
		const row = ws.addRow({
			sno: i + 1,
			name: r.full_name,
			bank: r.bank_name || '',
			branch: r.branch || '',
			// Text, so a leading zero survives and a long number is never shown as 1.23E+15.
			account: r.account_number ? String(r.account_number) : '',
			ifsc: r.ifsc || '',
			amount: Number(r.amount) || 0,
			remarks: '',
		})
		row.eachCell({ includeEmpty: true }, c => {
			c.font = { ...SERIF }
			c.alignment = { vertical: 'middle' }
		})
		// Wrap the name, bank and branch, and give the row a line per wrapped line —
		// Excel will not grow a row of fixed height by itself.
		let lines = 1
		for (const { key, width } of WRAPPED) {
			const cell = row.getCell(key)
			cell.alignment = { vertical: 'middle', wrapText: true }
			lines = Math.max(lines, Math.ceil(String(cell.value || '').length / (width - 1)))
		}
		row.height = ROW_HEIGHT * Math.min(lines, 3)
		row.getCell('sno').alignment = { horizontal: 'center', vertical: 'middle' }
		row.getCell('amount').alignment = { horizontal: 'center', vertical: 'middle' }
		row.getCell('account').numFmt = '@'
		row.getCell('amount').numFmt = '#,##0'
	})

	// Total at the foot — what accounts actually releases.
	const totalRow = ws.addRow({ ifsc: 'Total', amount: total })
	totalRow.height = ROW_HEIGHT
	totalRow.eachCell({ includeEmpty: true }, c => {
		c.font = { ...SERIF, bold: true }
		c.alignment = { vertical: 'middle' }
	})
	totalRow.getCell('ifsc').alignment = { horizontal: 'right', vertical: 'middle' }
	totalRow.getCell('amount').alignment = { horizontal: 'center', vertical: 'middle' }
	totalRow.getCell('amount').numFmt = '#,##0'

	// Rule every cell of the sheet.
	for (let n = 1; n <= ws.rowCount; n++) {
		const row = ws.getRow(n)
		for (let col = 1; col <= LAST; col++) row.getCell(col).border = RULED
	}

	return Buffer.from(await wb.xlsx.writeBuffer())
}
