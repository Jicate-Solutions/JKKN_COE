// Read-only check: Student Strength (CAS NOV-DEC-2026) as the route computes it vs the hand-corrected sheet
require('dotenv').config({ path: '.env' })
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const API = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
const KEY = process.env.MYJKKN_API_KEY || ''
const key = v => (v ?? '').toString().trim().toUpperCase()
const DETAIL = process.argv[2] || '' // e.g. "UCS-1,UCC-1" to list the learners of those cells

// hand-corrected sheet: code -> year -> [aided, sf]
const HAND = {
	UCT: { 1: [0, 6] },
	UEN: { 1: [14, 0], 2: [7, 0], 3: [8, 1] },
	UHI: { 1: [37, 0], 2: [26, 0], 3: [30, 0] },
	UMA: { 1: [11, 0], 2: [12, 0], 3: [1, 0] },
	UPH: { 1: [0, 6], 2: [0, 10] },
	UCH: { 1: [22, 0], 2: [11, 0], 3: [9, 0] },
	UZO: { 1: [17, 0], 2: [17, 0], 3: [12, 0] },
	UCS: { 1: [0, 74], 2: [0, 79], 3: [0, 54] },
	UCA: { 1: [0, 34], 2: [0, 31], 3: [0, 31] },
	UAD: { 1: [0, 42], 2: [0, 34], 3: [0, 22] },
	UCY: { 1: [0, 25], 2: [0, 14], 3: [0, 6] },
	UCM: { 1: [52, 0], 2: [50, 0], 3: [50, 0] },
	UCC: { 1: [0, 133], 2: [0, 147], 3: [0, 90] },
	UBA: { 1: [0, 40], 2: [0, 27], 3: [0, 12] },
	UTF: { 1: [0, 29], 2: [0, 17], 3: [0, 9] },
	UVC: { 3: [0, 2] },
	UMB: { 1: [0, 44], 2: [0, 26], 3: [0, 34] },
	PEN: { 1: [0, 7], 2: [0, 10] },
	PHI: { 2: [1, 0] },
	PMA: { 1: [0, 5], 2: [0, 9] },
	PCH: { 1: [21, 0], 2: [26, 0] },
	PZO: { 1: [5, 0], 2: [9, 0] },
	PCA: { 1: [8, 0], 2: [16, 0] },
	PCS: { 1: [0, 17], 2: [0, 32] },
	PDA: { 2: [0, 10] },
	PCM: { 1: [14, 14], 2: [7, 19] },
}

async function page(n) {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const r = await fetch(`${API}/api-management/learners/profiles?lifecycle_status=all&limit=200&page=${n}`, {
				headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
			})
			if (!r.ok) continue
			const j = await r.json()
			if (Array.isArray(j?.data)) return j.data
		} catch { /* retry */ }
	}
	return null
}

async function sweep() {
	const all = []
	let done = false
	for (let start = 1; !done && start <= 400; start += 8) {
		const res = await Promise.all(Array.from({ length: 8 }, (_, i) => page(start + i)))
		for (const rows of res) {
			if (rows === null) { done = true; break }
			all.push(...rows)
			if (rows.length < 200) { done = true; break }
		}
	}
	return all
}

async function main() {
	const { data: inst } = await supabase
		.from('institutions').select('id, myjkkn_institution_ids').eq('institution_code', 'CAS').single()
	const ids = (inst.myjkkn_institution_ids || []).map(String)
	const { data: session } = await supabase
		.from('examination_sessions').select('id').eq('institutions_id', inst.id).eq('session_code', 'NOV-DEC-2026').single()

	const ir = await fetch(`${API}/api-management/organizations/institutions?limit=200`, {
		headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
	}).then(r => r.json())
	const typeOf = new Map()
	for (const i of ir.data || []) {
		if (ids.includes(String(i.id))) typeOf.set(String(i.id), String(i.name || '').toLowerCase().includes('aided') ? 'AIDED' : 'SF')
	}

	const profiles = await sweep()
	const onRoll = new Map()
	const info = new Map() // reg -> { type, active, statuses }
	for (const p of profiles) {
		const status = String(p.lifecycle_status || '').trim().toLowerCase()
		const on = !['inactive', 'exited'].includes(status)
		for (const f of ['register_number', 'roll_number']) {
			const k = key(p[f])
			if (k) onRoll.set(k, (onRoll.get(k) || false) || on)
		}
		const k = key(p.register_number)
		const type = typeOf.get(String(p.institution_id))
		if (!k || !type) continue
		const active = status === 'active'
		const cur = info.get(k)
		if (!cur || (active && !cur.active) || (active === cur.active && type === 'AIDED')) {
			info.set(k, { type, active, status })
		}
	}

	const regs = []
	for (let o = 0; ; o += 1000) {
		const { data, error } = await supabase
			.from('exam_registrations')
			.select('stu_register_no, student_name, program_code, registration_status, course_offerings(semester)')
			.eq('institutions_id', inst.id)
			.eq('examination_session_id', session.id)
			.order('id')
			.range(o, o + 999)
		if (error) throw new Error(error.message)
		regs.push(...data)
		if (data.length < 1000) break
	}

	// mirrors the route: learner counted once per programme, in the highest year of the rows kept
	const build = rows => {
		const max = new Map()
		const name = new Map()
		for (const r of rows) {
			const reg = key(r.stu_register_no)
			if (!reg) continue
			const sem = (Array.isArray(r.course_offerings) ? r.course_offerings[0]?.semester : r.course_offerings?.semester) ?? 1
			const y = Math.ceil(sem / 2)
			const k = `${reg}|${(r.program_code || '').trim() || 'UNKNOWN'}`
			if (y > (max.get(k) ?? 0)) max.set(k, y)
			name.set(reg, r.student_name)
		}
		const cells = new Map() // "CODE-year" -> { aided:[], sf:[] }
		for (const [k, y] of max) {
			const [reg, pc] = k.split('|')
			const cellKey = `${pc}-${y}`
			if (!cells.has(cellKey)) cells.set(cellKey, { aided: [], sf: [] })
			const type = info.get(reg)?.type === 'AIDED' ? 'aided' : 'sf'
			cells.get(cellKey)[type].push(`${reg} ${name.get(reg) || ''}`)
		}
		return cells
	}

	const live = regs.filter(r => ['Approved', 'Applied'].includes(r.registration_status))
	const liveOnRoll = live.filter(r => onRoll.get(key(r.stu_register_no)) !== false)
	const allCells = build(regs)
	const liveCells = build(live)
	const sysCells = build(liveOnRoll)

	// per learner: status mix + lifecycle, for the detail listing
	const statusMix = new Map()
	for (const r of regs) {
		const reg = key(r.stu_register_no)
		if (!statusMix.has(reg)) statusMix.set(reg, new Set())
		statusMix.get(reg).add(r.registration_status)
	}

	const codes = new Set([...Object.keys(HAND), ...[...allCells.keys()].map(k => k.split('-')[0])])
	const n = (cells, k, t) => (cells.get(k)?.[t].length || 0)
	let sysTotal = 0, handTotal = 0, diffCells = 0
	const out = []
	out.push('cell      hand A/SF   system A/SF   (applied incl. left A/SF)   (all registered A/SF)')
	for (const code of [...codes].sort((a, b) => (a[0] === b[0] ? a.localeCompare(b) : a[0] === 'U' ? -1 : 1))) {
		for (const y of [1, 2, 3, 4]) {
			const k = `${code}-${y}`
			const hand = HAND[code]?.[y] || [0, 0]
			const sys = [n(sysCells, k, 'aided'), n(sysCells, k, 'sf')]
			sysTotal += sys[0] + sys[1]
			handTotal += hand[0] + hand[1]
			const same = hand[0] === sys[0] && hand[1] === sys[1]
			if (!same) diffCells++
			if (same && !DETAIL) continue
			if (hand[0] + hand[1] + sys[0] + sys[1] === 0) continue
			out.push(
				`${k.padEnd(8)} ${String(hand[0]).padStart(4)}/${String(hand[1]).padEnd(4)}   ${String(sys[0]).padStart(4)}/${String(sys[1]).padEnd(4)}  ${same ? 'ok  ' : 'DIFF'}` +
				`   ${n(liveCells, k, 'aided')}/${n(liveCells, k, 'sf')}`.padEnd(16) +
				`   ${n(allCells, k, 'aided')}/${n(allCells, k, 'sf')}`
			)
		}
	}
	out.push(`\nhand total ${handTotal}   system total ${sysTotal}   differing cells ${diffCells}`)

	for (const cell of DETAIL.split(',').filter(Boolean)) {
		out.push(`\n== ${cell}: every registered learner (counted or not) ==`)
		const c = allCells.get(cell) || { aided: [], sf: [] }
		for (const t of ['aided', 'sf']) {
			for (const l of c[t].sort()) {
				const reg = l.split(' ')[0]
				const mix = [...(statusMix.get(reg) || [])].sort().join('+')
				const counted = (sysCells.get(cell)?.[t] || []).includes(l)
				out.push(`  ${counted ? 'COUNTED ' : 'left out'} ${t.toUpperCase().padEnd(5)} ${l.padEnd(44)} reg-status=${mix.padEnd(18)} myjkkn=${info.get(reg)?.status || '(no CAS profile)'}`)
			}
		}
	}
	const text = out.join('\n')
	console.log(text)
	if (process.argv[3]) fs.writeFileSync(process.argv[3], text)
}

main().catch(e => { console.error(e.message); process.exit(1) })
