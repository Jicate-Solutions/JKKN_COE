/**
 * Batches for COE screens.
 *
 * Batches are mastered in MyJKKN — COE has no `batch` table of its own. The
 * routes that used to read one (/api/master/batches, the course-mapping
 * template) go through here instead and get the same shape they always
 * returned, so the screens need no change.
 */

import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNBatches, fetchMyJKKNBatchById } from '@/lib/myjkkn-api'
import { restrictToCallerInstitution } from '@/lib/auth/institution-scope-request'

/** The row shape the batch screens were written against. */
export interface BatchRow {
	id: string
	institutions_id: string | null
	institution_code: string
	batch_year: number | null
	batch_name: string
	batch_code: string
	start_date: string | null
	end_date: string | null
	status: boolean
	created_at: string | null
	updated_at: string | null
	/** MyJKKN fields, for callers that want them. */
	program_code: string | null
	regulation_code: string | null
	end_year: number | null
}

interface InstitutionRef {
	id: string
	institution_code: string
	myjkkn_institution_ids: string[] | null
}

async function loadInstitutionRefs(): Promise<InstitutionRef[]> {
	const { data, error } = await getSupabaseServer()
		.from('institutions')
		.select('id, institution_code, myjkkn_institution_ids')
	if (error) throw new Error(`institutions lookup failed: ${error.message}`)
	return (data ?? []) as InstitutionRef[]
}

function toBatchRow(batch: any, institutions: InstitutionRef[]): BatchRow {
	// One COE institution can stand for several MyJKKN ones (CAS aided + self).
	const institution = institutions.find((i) => (i.myjkkn_institution_ids ?? []).includes(batch.institution_id)) ?? null
	return {
		id: batch.id,
		institutions_id: institution?.id ?? null,
		institution_code: institution?.institution_code ?? batch.institution_code ?? '',
		batch_year: Number(batch.batch_year ?? batch.start_year) || null,
		batch_name: batch.batch_name ?? batch.batch_code ?? '',
		batch_code: batch.batch_code ?? '',
		start_date: batch.start_date ?? null,
		end_date: batch.end_date ?? null,
		status: batch.is_active !== false,
		created_at: batch.created_at ?? null,
		updated_at: batch.updated_at ?? null,
		program_code: batch.program_code ?? null,
		regulation_code: batch.regulation_code ?? null,
		end_year: typeof batch.end_year === 'number' ? batch.end_year : null,
	}
}

export interface BatchFilters {
	/** COE institution code. */
	institutionCode?: string | null
	search?: string | null
	status?: boolean | null
}

/**
 * Batches the caller may see, newest first. A non-super-admin gets their own
 * institution's batches only.
 */
export async function loadBatches(filters: BatchFilters = {}): Promise<BatchRow[]> {
	const [institutions, all] = await Promise.all([
		loadInstitutionRefs(),
		fetchAllMyJKKNBatches({ all: true, limit: 200 }),
	])
	const own = await restrictToCallerInstitution(all as any[])

	const search = filters.search?.trim().toLowerCase()
	const seen = new Set<string>()
	const rows: BatchRow[] = []
	for (const batch of own) {
		const row = toBatchRow(batch, institutions)
		if (filters.institutionCode && row.institution_code !== filters.institutionCode) continue
		if (filters.status !== null && filters.status !== undefined && row.status !== filters.status) continue
		if (search && ![row.batch_code, row.batch_name, String(row.batch_year ?? '')].some((v) => v.toLowerCase().includes(search))) continue
		// The same batch code can come back once per MyJKKN institution of a
		// merged COE institution — keep one.
		const key = `${row.institution_code}|${row.batch_code}`
		if (seen.has(key)) continue
		seen.add(key)
		rows.push(row)
	}
	return rows.sort((a, b) => (b.batch_year ?? 0) - (a.batch_year ?? 0) || a.batch_code.localeCompare(b.batch_code))
}

/** One batch by its MyJKKN id, or null when it does not exist or is another institution's. */
export async function loadBatchById(id: string): Promise<BatchRow | null> {
	const batch = await fetchMyJKKNBatchById(id).catch(() => null)
	if (!batch) return null
	const [own] = await restrictToCallerInstitution([batch as any])
	if (!own) return null
	return toBatchRow(own, await loadInstitutionRefs())
}

/** The answer for any attempt to create, change or delete a batch from COE. */
export const BATCHES_READ_ONLY_MESSAGE =
	'Batches are managed in MyJKKN and cannot be changed from the COE portal. Add or edit the batch in MyJKKN.'
