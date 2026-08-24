'use client'

import { useState, useEffect, useCallback } from 'react'
import { heuristicProgramLevel } from '@/lib/exam-fee/calculate'
import type { ProgramLevel } from '@/lib/exam-fee-catalog'
import type { ProgramOption } from '@/components/fee-details/program-multi-select'

/**
 * Programmes of an institution, each carrying the exam fee tier it is priced at.
 *
 * The list comes from the MyJKKN reference cache, not the COE `programs` table:
 * that mirror holds a handful of rows and leaves institution_code NULL, so
 * filtering it by institution returns nothing. programs-cache is what the
 * exam-registration screens read and is the one that is actually populated.
 *
 * The tier comes from exam_fee_program_levels where a mapping exists and from
 * the UG/PG heuristic otherwise — the same order lib/exam-fee/calculate.ts
 * resolves it in, so an "All UG" shortcut ticks exactly the programmes the fee
 * engine will charge at the UG rate.
 */
export function useFeePrograms(params: {
	institutionsId?: string | null
	institutionCode?: string | null
}) {
	const { institutionsId, institutionCode } = params

	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [loading, setLoading] = useState(false)

	const fetchPrograms = useCallback(async () => {
		// Without a code the cache returns every institution's programmes, so an
		// unscoped fetch would offer programmes this institution cannot price.
		if (!institutionCode) {
			setPrograms([])
			return
		}

		setLoading(true)
		try {
			const [programRes, tierRes] = await Promise.all([
				fetch(`/api/master/programs-cache?institution_code=${encodeURIComponent(institutionCode)}`),
				institutionsId
					? fetch(`/api/fee-details/program-levels?institutions_id=${institutionsId}`)
					: Promise.resolve(null),
			])

			const programData = programRes.ok ? await programRes.json() : []
			const tierData = tierRes && tierRes.ok ? await tierRes.json() : []

			// An explicit mapping wins; without one the code is read for UG/PG
			const levelByCode = new Map<string, ProgramLevel>()
			for (const t of Array.isArray(tierData) ? tierData : []) {
				if (t.is_active === false || !t.program_code) continue
				levelByCode.set(String(t.program_code).trim().toUpperCase(), t.program_level as ProgramLevel)
			}

			const rows: ProgramOption[] = (Array.isArray(programData) ? programData : [])
				.map((p: any) => {
					const code = String(p.program_code || '').trim().toUpperCase()
					return {
						program_code: code,
						program_name: p.program_name || p.display_name || code,
						level: levelByCode.get(code) || heuristicProgramLevel(code),
					}
				})
				.filter((p: ProgramOption) => !!p.program_code)

			// The master can carry the same code twice across departments
			const byCode = new Map<string, ProgramOption>()
			for (const row of rows) if (!byCode.has(row.program_code)) byCode.set(row.program_code, row)

			setPrograms(
				[...byCode.values()].sort((a, b) => a.program_code.localeCompare(b.program_code))
			)
		} catch (error) {
			console.error('Failed to fetch programmes for fee scoping:', error)
			setPrograms([])
		} finally {
			setLoading(false)
		}
	}, [institutionsId, institutionCode])

	useEffect(() => {
		fetchPrograms()
	}, [fetchPrograms])

	return { programs, loading, refetch: fetchPrograms }
}
