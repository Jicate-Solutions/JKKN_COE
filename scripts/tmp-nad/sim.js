require('dotenv').config({ path: '.env', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
	const { data: rows } = await s.from('nad_abc_upload_view').select('student_id, course_id, SUBJECT_CODE, subject_order, subject_semester, is_regular_subject, PROGRAM_CODE').eq('program_id', '08aaa386-7129-4f0c-a492-0619264ea018').eq('examination_session_id', 'b97baedf-aebc-4b57-b675-6ef17defdc08').range(0, 999)
	const ids = [...new Set(rows.map(r => r.course_id))]
	const { data: cs } = await s.from('courses').select('id, course_type_code').in('id', ids)
	const tc = new Map(cs.filter(c => c.course_type_code).map(c => [c.id, c.course_type_code.trim().toUpperCase()]))
	const st = {}
	for (const r of rows) (st[r.student_id] ||= []).push({ code: r.SUBJECT_CODE, order: r.subject_order, sem: r.subject_semester, reg: r.is_regular_subject !== false, t: tc.get(r.course_id) || null })
	const cohorts = {}
	for (const [id, subs] of Object.entries(st)) { subs.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)); const sem = Math.max(...subs.map(x => x.sem)); (cohorts[sem] ||= []).push({ id, subs }) }
	for (const [sem, list] of Object.entries(cohorts)) {
		const amb = new Set()
		for (const l of list) { const seen = new Set(); for (const x of l.subs) { if (!x.reg || !x.t) continue; if (seen.has(x.t)) amb.add(x.t); seen.add(x.t) } }
		const key = x => x.t && !amb.has(x.t) ? 'type:' + x.t : 'code:' + x.code
		const pos = new Map()
		for (const l of list) l.subs.filter(x => x.reg).forEach((x, i) => { const p = pos.get(key(x)) || { s: 0, n: 0 }; p.s += i; p.n++; pos.set(key(x), p) })
		const order = [...pos.entries()].sort((a, b) => (a[1].s / a[1].n - b[1].s / b[1].n) || a[0].localeCompare(b[0])).map(e => e[0])
		console.log('SEM', sem, 'ambiguous', [...amb], 'slots', order)
		const col6 = {}
		for (const l of list) { const m = new Map(l.subs.filter(x => x.reg).map(x => [key(x), x])); const cols = [...order.map(k => m.get(k)), ...l.subs.filter(x => !x.reg)]; const c = cols[5] ? cols[5].code : '(blank)'; col6[c] = (col6[c] || 0) + 1 }
		console.log(' SUB6 codes:', col6)
	}
})()
