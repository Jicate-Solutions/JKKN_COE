// Read-only probe: regulation_id coverage across every MyJKKN learner, and
// how many course_mapping (program, semester) scopes lack a semester_id.
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
const KEY = process.env.MYJKKN_API_KEY

async function myjkkn(endpoint, params = {}) {
	const url = new URL(BASE + endpoint)
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.append(k, String(v))
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } })
		if (res.ok) return res.json()
		if (attempt >= 2) throw new Error(`${endpoint} HTTP ${res.status}`)
		await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
	}
}

function tally(rows, keyFn) {
	const m = new Map()
	for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1) }
	return Object.fromEntries([...m.entries()].sort())
}

;(async () => {
	const { data: insts } = await supabase.from('institutions').select('institution_code, myjkkn_institution_ids')
	const instCode = new Map()
	for (const i of insts || []) for (const id of i.myjkkn_institution_ids || []) instCode.set(id, i.institution_code)

	const regs = await myjkkn('/api-management/academic/regulations', { page: 1, limit: 200 })
	const regCode = new Map((regs.data || []).map(r => [r.id, r.regulation_code]))
	const regInst = new Map((regs.data || []).map(r => [r.id, r.institution_id]))

	// Sweep every learner once (page cap 200; a phantom trailing page can 500).
	const all = []
	const first = await myjkkn('/api-management/learners/profiles', { page: 1, limit: 200 })
	all.push(...(first.data || []))
	const total = first.metadata?.total || 0
	const pages = Math.ceil(total / 200)
	console.log('profiles total', total, 'pages', pages)
	for (let p = 2; p <= pages; p += 4) {
		const batch = await Promise.all([0, 1, 2, 3].filter(i => p + i <= pages).map(i =>
			myjkkn('/api-management/learners/profiles', { page: p + i, limit: 200 }).catch(e => { console.log('page', p + i, 'failed', e.message); return { data: [] } })
		))
		for (const b of batch) all.push(...(b.data || []))
	}
	console.log('fetched', all.length)

	console.log('\nregulation by institution:')
	console.log(tally(all, l => `${instCode.get(l.institution_id) || l.institution_id} | ${l.regulation_id ? (regCode.get(l.regulation_id) || 'UNKNOWN-ID') : 'NULL'}`))
	console.log('\nregulation belongs to another institution:',
		all.filter(l => l.regulation_id && regInst.get(l.regulation_id) && regInst.get(l.regulation_id) !== l.institution_id).length)
	console.log('semester_id null:', all.filter(l => !l.semester_id).length)

	// How many (semester_id) cohorts mix regulations?
	const bySem = new Map()
	for (const l of all) {
		if (!l.semester_id) continue
		if (!bySem.has(l.semester_id)) bySem.set(l.semester_id, new Map())
		const k = l.regulation_id ? (regCode.get(l.regulation_id) || 'UNKNOWN-ID') : 'NULL'
		bySem.get(l.semester_id).set(k, (bySem.get(l.semester_id).get(k) || 0) + 1)
	}
	const mixed = [...bySem.entries()].filter(([, m]) => m.size > 1)
	console.log(`\nsemester cohorts: ${bySem.size}, with more than one regulation value: ${mixed.length}`)
	for (const [id, m] of mixed.slice(0, 25)) console.log(' ', id, JSON.stringify(Object.fromEntries(m)))

	// course_mapping scopes with no semester_id at all
	const maps = []
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabase
			.from('course_mapping')
			.select('id, institution_code, program_code, regulation_code, semester_code, semester_id')
			.order('id')
			.range(from, from + 999)
		if (error) throw error
		maps.push(...data)
		if (data.length < 1000) break
	}
	const scope = new Map() // inst|prog|reg|sem -> has semester_id
	const progSem = new Map() // inst|prog|sem -> semester_id (any regulation)
	for (const m of maps) {
		if (!m.semester_code) continue
		const k = `${m.institution_code}|${m.program_code}|${m.regulation_code}|${m.semester_code}`
		scope.set(k, scope.get(k) || !!m.semester_id)
		const pk = `${m.institution_code}|${m.program_code}|${m.semester_code}`
		if (m.semester_id) {
			if (!progSem.has(pk)) progSem.set(pk, new Set())
			progSem.get(pk).add(m.semester_id)
		}
	}
	const noId = [...scope.entries()].filter(([, v]) => !v).map(([k]) => k)
	const recoverable = noId.filter(k => { const [i, p, , s] = k.split('|'); return progSem.has(`${i}|${p}|${s}`) })
	console.log(`\ncourse_mapping rows ${maps.length}; scopes ${scope.size}; scopes without any semester_id ${noId.length}; of those, another regulation of the same program+semester has one: ${recoverable.length}`)
	console.log('program+semester keys carrying more than one distinct semester_id:', [...progSem.entries()].filter(([, s]) => s.size > 1).length)
	console.log('sample scopes without semester_id:', noId.slice(0, 30))
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1) })
