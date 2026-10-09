// Read-only probe: regulation_id coverage across every MyJKKN learner, and whether
// a missing regulation can be inferred from the learner's batch or cohort.
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

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

async function sweep(endpoint, extra = {}) {
	const all = []
	for (let page = 1; page < 400; page++) {
		let res
		try { res = await myjkkn(endpoint, { ...extra, page, limit: 200 }) } catch (e) { console.log(`  ${endpoint} page ${page} stopped: ${e.message}`); break }
		const rows = res.data || []
		if (page === 1) console.log(`  ${endpoint} metadata:`, JSON.stringify(res.metadata || res.pagination || {}))
		all.push(...rows)
		if (rows.length < 200) break
	}
	return all
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
	const inst = l => instCode.get(l.institution_id) || l.institution_id

	const regs = await sweep('/api-management/academic/regulations')
	const regCode = new Map(regs.map(r => [r.id, r.regulation_code]))
	const batches = await sweep('/api-management/academic/batches')
	console.log('batches', batches.length, 'sample keys:', batches[0] ? Object.keys(batches[0]).join(', ') : '-')
	const batchById = new Map(batches.map(b => [b.id, b]))
	console.log('batches with regulation_id:', batches.filter(b => b.regulation_id).length)

	const cache = 'scripts/tmp-bulkreg/profiles.cache.json'
	let all
	if (fs.existsSync(cache)) all = JSON.parse(fs.readFileSync(cache, 'utf8'))
	else {
		const raw = await sweep('/api-management/learners/profiles')
		// keep only what the analysis needs (no personal details on disk)
		all = raw.map(l => ({ id: l.id, institution_id: l.institution_id, program_id: l.program_id, semester_id: l.semester_id, regulation_id: l.regulation_id, batch_id: l.batch_id, admission_year: l.admission_year, reg: l.register_number || l.roll_number || '' }))
		fs.writeFileSync(cache, JSON.stringify(all))
	}
	const seen = new Set()
	all = all.filter(l => l.id && !seen.has(l.id) && seen.add(l.id))
	console.log('learners (deduped):', all.length)

	const code = l => l.regulation_id ? (regCode.get(l.regulation_id) || 'UNKNOWN-ID') : 'NULL'
	console.log('\nregulation by institution:')
	console.log(tally(all, l => `${inst(l)} | ${code(l)}`))

	// Cohorts (semester_id) by regulation mix
	const bySem = new Map()
	for (const l of all) {
		if (!l.semester_id) continue
		if (!bySem.has(l.semester_id)) bySem.set(l.semester_id, [])
		bySem.get(l.semester_id).push(l)
	}
	let allNull = 0, partNull = 0, multiReg = 0, clean = 0
	const partRows = []
	for (const [id, rows] of bySem) {
		const codes = new Set(rows.map(code))
		const real = [...codes].filter(c => c !== 'NULL')
		if (real.length === 0) allNull++
		else if (real.length > 1) { multiReg++; partRows.push(`${inst(rows[0])} ${id} ${JSON.stringify(tally(rows, code))}`) }
		else if (codes.has('NULL')) { partNull++; partRows.push(`${inst(rows[0])} ${id} ${JSON.stringify(tally(rows, code))}`) }
		else clean++
	}
	console.log(`\ncohorts ${bySem.size}: single regulation ${clean}; single regulation + some NULL ${partNull}; several regulations ${multiReg}; all NULL ${allNull}`)
	for (const r of partRows.slice(0, 40)) console.log('  ', r)

	// Can the batch stand in for a missing regulation?
	const nulls = all.filter(l => !l.regulation_id)
	console.log(`\nNULL-regulation learners: ${nulls.length}`)
	console.log('  with batch_id:', nulls.filter(l => l.batch_id).length)
	console.log('  batch carries regulation_id:', nulls.filter(l => l.batch_id && batchById.get(l.batch_id)?.regulation_id).length)
	// batch -> regulation as learnt from classmates that DO have one
	const batchRegs = new Map()
	for (const l of all) {
		if (!l.batch_id || !l.regulation_id) continue
		if (!batchRegs.has(l.batch_id)) batchRegs.set(l.batch_id, new Set())
		batchRegs.get(l.batch_id).add(code(l))
	}
	console.log('  batches whose learners carry >1 regulation:', [...batchRegs.values()].filter(s => s.size > 1).length, 'of', batchRegs.size)
	console.log('  NULL learners whose batch-mates agree on one regulation:', nulls.filter(l => batchRegs.get(l.batch_id)?.size === 1).length)
	console.log('  NULL by institution/admission_year:', tally(nulls, l => `${inst(l)} | ${l.admission_year}`))
	// agreement check: where learner has a regulation AND batch has one, do they match?
	let agree = 0, differ = 0
	for (const l of all) {
		const b = l.batch_id && batchById.get(l.batch_id)
		if (!l.regulation_id || !b?.regulation_id) continue
		if (b.regulation_id === l.regulation_id) agree++; else differ++
	}
	console.log(`  learner.regulation vs batch.regulation: agree ${agree}, differ ${differ}`)
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1) })
