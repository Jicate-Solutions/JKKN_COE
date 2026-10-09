// Read-only probe: how do EEE Semester III learners line up with regulations?
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
const KEY = process.env.MYJKKN_API_KEY

async function myjkkn(endpoint, params = {}) {
	const url = new URL(BASE + endpoint)
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.append(k, String(v))
	const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } })
	if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
	return res.json()
}

function tally(rows, keyFn) {
	const m = new Map()
	for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1) }
	return Object.fromEntries([...m.entries()].sort())
}

;(async () => {
	// 1. COE course_mapping for EEE: regulation x semester x semester_id
	const { data: mappings, error } = await supabase
		.from('course_mapping')
		.select('institution_code, program_code, regulation_code, semester_code, semester_id, batch_code')
		.eq('program_code', 'EEE')
		.range(0, 999)
	if (error) {
		console.log('course_mapping error (retrying without batch_code):', error.message)
	}
	let rows = mappings
	if (error) {
		const r = await supabase
			.from('course_mapping')
			.select('institution_code, program_code, regulation_code, semester_code, semester_id')
			.eq('program_code', 'EEE')
			.range(0, 999)
		if (r.error) throw r.error
		rows = r.data
	}
	console.log('course_mapping EEE rows:', rows.length)
	console.log(tally(rows, r => `${r.institution_code} | ${r.regulation_code} | ${r.semester_code} | sem_id=${r.semester_id}${'batch_code' in r ? ` | batch=${r.batch_code}` : ''}`))

	// 2. MyJKKN regulations
	const regs = await myjkkn('/api-management/academic/regulations', { page: 1, limit: 200 })
	const regList = regs.data || regs || []
	console.log('\nMyJKKN regulations:', regList.length)
	for (const r of regList) console.log(' ', r.id, r.regulation_code, '|', r.regulation_name, '| eff', r.effective_year, '| inst', r.institution_id)
	const regCode = new Map(regList.map(r => [r.id, r.regulation_code]))

	// 3. MyJKKN learners per Semester III semester_id
	const semIds = [...new Set(rows.filter(r => /3|III/.test(r.semester_code || '') && r.semester_id).map(r => r.semester_id))]
	console.log('\nSemester III semester_ids on EEE mappings:', semIds)
	for (const semId of semIds) {
		const first = await myjkkn('/api-management/learners/profiles', { semester_id: semId, page: 1, limit: 200 })
		const list = first.data || []
		console.log(`\nsemester_id ${semId}: ${list.length} learners, metadata`, JSON.stringify(first.metadata || first.pagination || {}))
		if (list[0]) console.log('sample keys:', Object.keys(list[0]).join(', '))
		console.log('by regulation_id:', tally(list, l => `${l.regulation_id} (${regCode.get(l.regulation_id) || '-'})`))
		console.log('by batch:', tally(list, l => `${l.batch_id} | ${l.batch_name || ''}`))
		console.log('by admission_year:', tally(list, l => String(l.admission_year)))
		console.log('by current_semester:', tally(list, l => String(l.current_semester)))
		console.log('by program:', tally(list, l => `${l.program_code || l.program_id}`))
		console.log('by register prefix:', tally(list, l => String(l.register_number || l.roll_number || '').slice(0, 9)))
		console.log('first 3:', list.slice(0, 3).map(l => ({ reg: l.register_number, roll: l.roll_number, regulation_id: l.regulation_id, batch_id: l.batch_id, admission_year: l.admission_year, semester_id: l.semester_id })))
	}
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1) })
