// Read-only probe: CAS Semester I cohorts where MyJKKN records R-2024 but COE also maps
// R-2026, plus the register/roll shapes of learners whose intake year can't be parsed.
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
const KEY = process.env.MYJKKN_API_KEY

async function myjkkn(endpoint, params = {}) {
	const url = new URL(BASE + endpoint)
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.append(k, String(v))
	const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } })
	if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`)
	return res.json()
}
function tally(rows, keyFn) {
	const m = new Map()
	for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1) }
	return Object.fromEntries([...m.entries()].sort())
}
// register/roll number with digits and letters collapsed, to show the shape only
const shape = v => v == null ? 'null' : String(v).replace(/[A-Za-z]/g, 'A').replace(/\d/g, '9')

;(async () => {
	const regs = await myjkkn('/api-management/academic/regulations', { page: 1, limit: 200 })
	const regCode = new Map((regs.data || []).map(r => [r.id, r.regulation_code]))

	const scopes = [['CAS', 'UCS', 'UCS-1'], ['CAS', 'UCC', 'UCC-1'], ['CAS', 'UMA', 'UMA-1'], ['CAS', 'UPH', 'UPH-1'], ['CET', 'MBA', 'MBA-1'], ['CET', 'EEE', 'EEE-1'], ['CET', 'PCSE', 'PCSE-1']]
	for (const [inst, prog, sem] of scopes) {
		const { data, error } = await supabase
			.from('course_mapping')
			.select('regulation_code, semester_id')
			.eq('institution_code', inst).eq('program_code', prog).eq('semester_code', sem)
		if (error) throw error
		const semIds = [...new Set(data.map(d => d.semester_id).filter(Boolean))]
		console.log(`\n${inst} ${prog} ${sem}: mapped regulations`, JSON.stringify(tally(data, d => d.regulation_code)), 'semester_ids', semIds.length)
		for (const semId of semIds) {
			const res = await myjkkn('/api-management/learners/profiles', { semester_id: semId, page: 1, limit: 200 })
			const list = (res.data || []).filter(l => l.semester_id === semId)
			console.log('  learners', list.length, 'regulation:', JSON.stringify(tally(list, l => l.regulation_id ? regCode.get(l.regulation_id) : 'NULL')))
			console.log('  admission_year:', JSON.stringify(tally(list, l => String(l.admission_year))))
			console.log('  register shape:', JSON.stringify(tally(list, l => shape(l.register_number))))
			console.log('  roll shape:', JSON.stringify(tally(list, l => shape(l.roll_number))))
		}
	}
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1) })
