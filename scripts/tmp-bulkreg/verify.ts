// End-to-end check of the bulk-register learner filter against live data: calls the real
// eligible-learners route handler, then applies the same placement the page applies.
import { config } from 'dotenv'
config({ path: '.env' })

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { placeCohortByRegulation, regulationKey, type CohortLearner } from '../../lib/exam-registration-cohort-regulation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check(inst: string, prog: string, semesterCode: string) {
	const { GET: eligibleLearners } = await import('../../app/api/exam-management/exam-registrations/bulk-create/eligible-learners/route')
	const { GET: lookups } = await import('../../app/api/course-management/course-offering/lookups/route')

	const { data: institution } = await supabase.from('institutions').select('myjkkn_institution_ids').eq('institution_code', inst).single()
	const regsRes = await lookups(new Request(`http://x/api?type=regulations&institution_code=${inst}&program_code=${prog}`))
	const regulations: string[] = await regsRes.json()

	console.log(`\n=== ${inst} ${prog} ${semesterCode} — mapped regulations: ${regulations.join(', ')}`)
	for (const regulation of regulations) {
		const semRes = await lookups(new Request(`http://x/api?type=semesters&institution_code=${inst}&program_code=${prog}&regulation_code=${encodeURIComponent(regulation)}`))
		const semesters: Array<{ semester_id: string | null; semester_code: string }> = await semRes.json()
		const sem = semesters.find(s => s.semester_code === semesterCode)
		if (!sem) { console.log(`  ${regulation}: semester not mapped`); continue }
		if (!sem.semester_id) { console.log(`  ${regulation}: no semester_id (page falls back to the full sweep)`); continue }

		const url = `http://x/api?institution_ids=${(institution?.myjkkn_institution_ids || []).join(',')}&semester_id=${sem.semester_id}`
		const res = await eligibleLearners(new NextRequest(url))
		const json = await res.json()
		const cohort: CohortLearner[] = json.data || []

		const placements = placeCohortByRegulation(cohort, regulations)
		const selectedKey = regulationKey(regulation)
		let listed = 0, inferred = 0, other = 0, unplaced = 0
		const otherCodes = new Set<string>()
		for (const l of cohort) {
			const p = placements.get(l.id)
			if (!p) { unplaced++; continue }
			if (regulationKey(p.regulation_code) === selectedKey) { listed++; if (p.inferred) inferred++ }
			else { other++; otherCodes.add(p.regulation_code) }
		}
		console.log(`  ${regulation}: cohort ${cohort.length} → listed ${listed} (inferred ${inferred}), other regulation ${other} [${[...otherCodes].join(', ')}], unplaced ${unplaced}`)
	}
}

async function main() {
	const scopes = process.argv.slice(2)
	const list = scopes.length > 0 ? scopes : ['CET|EEE|EEE-3', 'CET|EEE|EEE-2', 'CET|MBA|MBA-1', 'CET|PCSE|PCSE-1', 'CAS|UCS|UCS-1', 'CAS|UCS|UCS-3', 'CET|ECE|ECE-3']
	for (const s of list) {
		const [inst, prog, sem] = s.split('|')
		await check(inst, prog, sem)
	}
}

main().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1) })
