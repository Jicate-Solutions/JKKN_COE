import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'

const VALID_CATEGORIES = ['CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM', 'SEMESTER_THEORY', 'GENERAL']
const VALID_PROGRAMMES = ['UG', 'PG', 'BOTH']

function parseDate(raw: string | number | Date | undefined): string | null {
	if (!raw) return null

	// Handle Date objects (exceljs returns Date for Excel date cells)
	if (raw instanceof Date) {
		const y = raw.getFullYear()
		const m = String(raw.getMonth() + 1).padStart(2, '0')
		const d = String(raw.getDate()).padStart(2, '0')
		return `${y}-${m}-${d}`
	}

	// Handle Excel serial number dates
	if (typeof raw === 'number') {
		const excelEpoch = new Date(1899, 11, 30)
		const date = new Date(excelEpoch.getTime() + raw * 86400000)
		const y = date.getFullYear()
		const m = String(date.getMonth() + 1).padStart(2, '0')
		const d = String(date.getDate()).padStart(2, '0')
		return `${y}-${m}-${d}`
	}

	const str = String(raw).trim()

	// DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
	const match = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
	if (match) {
		return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
	}

	// Already YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

	return null
}

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const institutionCode = searchParams.get('institution_code')
	const academicYear = searchParams.get('academic_year') || '2025-2026'

	if (!institutionsId) {
		return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
	}

	const formData = await request.formData()
	const file = formData.get('file') as File | null
	if (!file) {
		return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
	}

	const arrayBuffer = await file.arrayBuffer()
	const wb = new ExcelJS.Workbook()
	await wb.xlsx.load(arrayBuffer)
	const sheet = wb.worksheets[0]
	if (!sheet) {
		return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 })
	}
	const rows: (string | number | Date)[][] = []
	sheet.eachRow((row) => {
		// row.values is 1-indexed (index 0 is empty), slice to normalize
		const vals = Array.isArray(row.values) ? row.values.slice(1) : []
		rows.push(vals as (string | number | Date)[])
	})

	if (rows.length < 2) {
		return NextResponse.json({ error: 'File has no data rows' }, { status: 400 })
	}

	const errors: string[] = []
	const toInsert: object[] = []

	// Skip header row (index 0)
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i]
		if (!row || row.every(cell => !cell)) continue

		const [programme, category, title, fromDate, toDate, description] = row

		if (!title?.toString().trim()) {
			errors.push(`Row ${i + 1}: Event title is required`)
			continue
		}

		const cat = category?.toString().trim().toUpperCase()
		if (!VALID_CATEGORIES.includes(cat)) {
			errors.push(`Row ${i + 1}: Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`)
			continue
		}

		const prog = programme?.toString().trim().toUpperCase()
		if (!VALID_PROGRAMMES.includes(prog)) {
			errors.push(`Row ${i + 1}: Invalid programme "${programme}". Must be UG, PG, or BOTH`)
			continue
		}

		const startDate = parseDate(fromDate as string | number)
		const endDate = parseDate(toDate as string | number)

		if (!startDate) {
			errors.push(`Row ${i + 1}: Invalid From Date "${fromDate}". Use DD-MM-YYYY format`)
			continue
		}
		if (!endDate) {
			errors.push(`Row ${i + 1}: Invalid To Date "${toDate}". Use DD-MM-YYYY format`)
			continue
		}

		toInsert.push({
			institutions_id: institutionsId,
			institution_code: institutionCode,
			academic_year: academicYear,
			programme_type: prog,
			exam_category: cat,
			event_title: title.toString().trim(),
			event_description: description?.toString().trim() || null,
			event_start_date: startDate,
			event_end_date: endDate,
			status: 'ACTIVE',
			is_bulk_uploaded: true,
		})
	}

	if (errors.length > 0) {
		return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
	}

	if (toInsert.length === 0) {
		return NextResponse.json({ error: 'No valid rows found in file' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('coe_calendar')
		.insert(toInsert)
		.select()

	if (error) {
		console.error('coe_calendar bulk-upload error:', error)
		return NextResponse.json({ error: 'Failed to insert events' }, { status: 500 })
	}

	return NextResponse.json({
		success: true,
		inserted: data?.length || 0,
		total: toInsert.length,
	}, { status: 201 })
}
