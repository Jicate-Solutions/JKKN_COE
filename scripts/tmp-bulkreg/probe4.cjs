// Read-only probe: how well does "intake year -> newest mapped regulation" predict the
// regulation MyJKKN actually records? Checked per semester cohort against COE mappings.
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

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
async function sweep(endpoint) {
	const all = []
	for (let page = 1; page < 100; page++) {
		let res
		try { res = await myjkkn(endpoint, { page, limit: 200 }) } catch (e) { break }
		const rows = res.data || []
		all.push(...rows)
		if (rows.length < 200) break
	}
	return all
}
const USE_REG = process.argv.includes('--reg')
function batchYearOf(registerNo) {
	const reg = String(registerNo || '').trim().toUpperCase()
	const match = /^\d{12}$/.test(reg)
		? reg.slice(4, 6)
		: (reg.match(/^(\d{2})[A-Z]/) || reg.match(/^[A-Z]+(\d{2})/))?.[1]
	return match ? 2000 + parseInt(match, 10) : 0
}
const yearOf = code => Number(String(code || '').match(/\d{4}/)?.[0] || 0)
function mode(values) {
	const m = new Map()
	for (const v of values) if (v != null) m.set(v, (m.get(v) || 0) + 1)
	return [...m.entries()].sort((a, b) => b[1] - a[1])
}

;(async () => {
	const { data: insts } = await supabase.from('institutions').select('institution_code, myjkkn_institution_ids')
	const instCode = new Map()
	for (const i of insts || []) for (const id of i.myjkkn_institution_ids || []) instCode.set(id, i.institution_code)

	const regs = await sweep('/api-management/academic/regulations')
	const regCode = new Map(regs.map(r => [r.id, r.regulation_code]))
	const programs = await sweep('/api-management/organizations/programs')
	console.log('programs', programs.length, 'keys:', programs[0] ? Object.keys(programs[0]).join(', ') : '-')
	const progCode = new Map(programs.map(p => [p.id, p.program_code || p.program_id]))
	const semesters = await sweep('/api-management/organizations/semesters')
	console.log('semesters', semesters.length, 'keys:', semesters[0] ? Object.keys(semesters[0]).join(', ') : '-')
	const semById = new Map(semesters.map(s => [s.id, s]))

	const maps = []
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabase.from('course_mapping').select('id, institution_code, program_code, regulation_code').order('id').range(from, from + 999)
		if (error) throw error
		maps.push(...data)
		if (data.length < 1000) break
	}
	const mapped = new Map() // inst|prog -> Set(regulation years)
	for (const m of maps) {
		if (!m.regulation_code) continue
		const k = `${m.institution_code}|${m.program_code}`
		if (!mapped.has(k)) mapped.set(k, new Set())
		mapped.get(k).add(yearOf(m.regulation_code))
	}

	const all = JSON.parse(fs.readFileSync('scripts/tmp-bulkreg/profiles.cache.json', 'utf8'))
	const bySem = new Map()
	for (const l of all) {
		if (!l.semester_id) continue
		if (!bySem.has(l.semester_id)) bySem.set(l.semester_id, [])
		bySem.get(l.semester_id).push(l)
	}

	let checked = 0, right = 0, noMapping = 0, noCandidate = 0
	const wrong = []
	let nullCohorts = 0, nullPlaced = 0, nullLearners = 0, nullLearnersPlaced = 0, nullNoMapping = 0
	const nullUnplaced = []
	for (const [semId, rows] of bySem) {
		const inst = instCode.get(rows[0].institution_id)
		const prog = progCode.get(rows[0].program_id)
		const years = mapped.get(`${inst}|${prog}`)
		const explicit = mode(rows.filter(l => l.regulation_id).map(l => yearOf(regCode.get(l.regulation_id))))
		const dominant = explicit.length > 0 && (explicit.length === 1 || explicit[0][1] > explicit[1][1]) ? explicit[0][0] : null
		const intake = USE_REG
			? mode(rows.map(l => batchYearOf(l.reg)).filter(Boolean))[0]?.[0]
			: mode(rows.map(l => l.admission_year))[0]?.[0]
		const sem = semById.get(semId)
		const label = `${inst} ${prog} ${sem?.semester_name || sem?.semester_code || semId} intake=${intake}`
		const predict = () => {
			if (!years || !intake) return null
			const c = [...years].filter(y => y <= intake).sort((a, b) => b - a)
			return c[0] || null
		}
		if (dominant) {
			if (!years) { noMapping++; continue }
			const p = predict()
			if (!p) { noCandidate++; wrong.push(`${label} mapped=[${[...years]}] actual=${dominant} predicted=none`); continue }
			checked++
			if (p === dominant) right++
			else wrong.push(`${label} mapped=[${[...years]}] actual=${dominant} predicted=${p}`)
		} else {
			nullCohorts++
			nullLearners += rows.length
			if (!years) { nullNoMapping++; continue }
			const p = predict()
			if (p) { nullPlaced++; nullLearnersPlaced += rows.length }
			else nullUnplaced.push(`${label} mapped=[${[...years]}] n=${rows.length}`)
		}
	}
	console.log(`\ncohorts with a dominant recorded regulation: year rule checked ${checked}, right ${right}, no candidate ${noCandidate}, program not mapped in COE ${noMapping}`)
	console.log('mismatches:')
	for (const w of wrong) console.log('  ', w)
	console.log(`\ncohorts with no dominant recorded regulation: ${nullCohorts} (${nullLearners} learners); program not mapped in COE ${nullNoMapping}; placed by year rule ${nullPlaced} (${nullLearnersPlaced} learners)`)
	for (const u of nullUnplaced) console.log('   unplaced:', u)
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1) })
