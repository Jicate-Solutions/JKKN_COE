import { config } from 'dotenv'
config({ path: '.env', quiet: true } as any)
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Audit the NAD pivot export for every programme of a session: does any SUBn column
// hold a regular course that is another column's course for the rest of the cohort?
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const log = console.log

function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = [], cur = '', q = false
	for (let i = 0; i < text.length; i++) {
		const c = text[i]
		if (q) {
			if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
			else if (c === '"') q = false
			else cur += c
		} else if (c === '"') q = true
		else if (c === ',') { row.push(cur); cur = '' }
		else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
		else cur += c
	}
	row.push(cur); rows.push(row)
	return rows
}

;(async () => {
	const sessionIds = process.argv.slice(2)
	const { GET } = await import('../../app/api/result-analytics/nad-pivot-export/route')
	for (const sessionId of sessionIds) {
		const { data: sess } = await s.from('examination_sessions').select('session_name, session_code, institutions_id').eq('id', sessionId).single()
		// programmes with marks in this session
		const progIds = new Set<string>()
		let from = 0
		while (true) {
			const { data, error } = await s.from('final_marks').select('id, program_id').eq('examination_session_id', sessionId).order('id').range(from, from + 999)
			if (error) { log('final_marks error', error.message); break }
			if (!data || data.length === 0) break
			data.forEach((r: any) => r.program_id && progIds.add(r.program_id))
			if (data.length < 1000) break
			from += 1000
		}
		log(`\n##### SESSION ${(sess as any)?.session_name || (sess as any)?.session_code} ${sessionId} — ${progIds.size} programmes`)
		let cohortsChecked = 0, learnersChecked = 0, shifted = 0
		for (const programId of Array.from(progIds)) {
			// regular course codes per learner straight from the view
			const regular = new Map<string, Set<string>>()
			const allCodes = new Map<string, Set<string>>()
			const viewRows: any[] = []
			let progCode = ''
			let vf = 0
			while (true) {
				const { data, error } = await s.from('nad_abc_upload_view')
					.select('ENROLLMENT_NUMBER, SUBJECT_CODE, is_regular_subject, subject_semester, PROGRAM_CODE')
					.eq('examination_session_id', sessionId).eq('program_id', programId)
					.order('ENROLLMENT_NUMBER').order('SUBJECT_CODE').range(vf, vf + 999)
				if (error) { log('view error', error.message); break }
				if (!data || data.length === 0) break
				for (const r of data as any[]) {
					progCode = r.PROGRAM_CODE || progCode
					const every = allCodes.get(r.ENROLLMENT_NUMBER) || new Set<string>()
					every.add(r.SUBJECT_CODE)
					allCodes.set(r.ENROLLMENT_NUMBER, every)
					viewRows.push(r)
				}
				if (data.length < 1000) break
				vf += 1000
			}
			// a paper is a current (column-owning) paper when flagged regular AND from the learner's top semester
			const topSem = new Map<string, number>()
			for (const r of viewRows) topSem.set(r.ENROLLMENT_NUMBER, Math.max(topSem.get(r.ENROLLMENT_NUMBER) || 0, r.subject_semester || 1))
			for (const r of viewRows) {
				if (r.is_regular_subject === false || (r.subject_semester || 1) !== topSem.get(r.ENROLLMENT_NUMBER)) continue
				const set = regular.get(r.ENROLLMENT_NUMBER) || new Set<string>()
				set.add(r.SUBJECT_CODE)
				regular.set(r.ENROLLMENT_NUMBER, set)
			}
			if (allCodes.size === 0) continue

			console.log = () => {}
			const qs = new URLSearchParams({ examination_session_id: sessionId, program_id: programId })
			const res = await GET(new NextRequest(`http://localhost:3000/api/result-analytics/nad-pivot-export?${qs}`))
			const text = await res.text()
			console.log = log
			if (!(res.headers.get('content-type') || '').includes('text/csv')) continue
			const rows = parseCsv(text)
			const header = rows[0]
			const subIdx: number[] = []
			header.forEach((h, i) => { if (/^SUB\d+$/.test(h)) subIdx.push(i) })
			const regn = header.indexOf('REGN_NO'), semI = header.indexOf('SEM')

			const cohorts = new Map<string, string[][]>()
			for (const r of rows.slice(1)) {
				const list = cohorts.get(r[semI]) || []
				list.push(r)
				cohorts.set(r[semI], list)
			}
			for (const [sem, list] of Array.from(cohorts.entries())) {
				cohortsChecked++
				learnersChecked += list.length
				// majority regular code per column
				const tallies = subIdx.map(() => new Map<string, number>())
				for (const r of list) {
					const reg = regular.get(r[regn]) || new Set<string>()
					subIdx.forEach((ci, k) => {
						const code = r[ci]
						if (code && reg.has(code)) tallies[k].set(code, (tallies[k].get(code) || 0) + 1)
					})
				}
				const homeColumn = new Map<string, number>() // code → column where it is most common
				tallies.forEach((t, k) => {
					for (const [code, n] of Array.from(t.entries())) {
						const best = homeColumn.get(code)
						if (best === undefined || n > (tallies[best].get(code) || 0)) homeColumn.set(code, k)
					}
				})
				const problems: string[] = []
				for (const r of list) {
					const reg = regular.get(r[regn]) || new Set<string>()
					subIdx.forEach((ci, k) => {
						const code = r[ci]
						if (code && reg.has(code) && homeColumn.get(code) !== k) problems.push(`${r[regn]}: ${code} in SUB${k + 1}, cohort has it in SUB${homeColumn.get(code)! + 1}`)
					})
					// regular course missing from the row altogether (dropped by max_subjects or a slot collision)
					const present = new Set(subIdx.map(ci => r[ci]).filter(Boolean))
					for (const code of Array.from(reg)) if (!present.has(code)) problems.push(`${r[regn]}: regular ${code} MISSING from row`)
					for (const code of Array.from(allCodes.get(r[regn]) || [])) if (!reg.has(code) && !present.has(code)) problems.push(`${r[regn]}: arrear ${code} MISSING from row`)
					const filled = subIdx.map(ci => r[ci]).filter(Boolean)
					if (new Set(filled).size !== filled.length) problems.push(`${r[regn]}: a paper appears TWICE in the row`)
					if (filled.length && !r[subIdx[0]]) problems.push(`${r[regn]}: row starts with blank columns (first paper not in SUB1)`)
					// blank regular column: the learner skips a column the cohort uses, with a regular paper further right
					let lastReg = -1
					subIdx.forEach((ci, k) => { if (r[ci] && reg.has(r[ci])) lastReg = k })
					subIdx.forEach((ci, k) => { if (k < lastReg && !r[ci]) problems.push(`${r[regn]}: BLANK SUB${k + 1} (cohort: ${Array.from(tallies[k].keys()).join('/')}), own papers continue to SUB${lastReg + 1}`) })
				}
				const mixed = tallies
					.map((t, k) => ({ k, t }))
					.filter(x => x.t.size > 1)
					.map(x => `SUB${x.k + 1}{${Array.from(x.t.entries()).map(([c, n]) => `${c}×${n}`).join(', ')}}`)
				// a regular column only a minority of the cohort fills = an alternative paper that got its own column
				tallies.forEach((t, k) => {
					const n = Array.from(t.values()).reduce((a, b) => a + b, 0)
					if (n > 0 && n < list.length / 2) problems.push(`SUB${k + 1} filled by only ${n}/${list.length} learners: ${Array.from(t.entries()).map(([c, m]) => `${c}×${m}`).join(', ')}`)
				})
				if (problems.length || mixed.length) {
					log(`${progCode} sem ${sem} (${list.length} learners)${mixed.length ? ' alternatives: ' + mixed.join(' ') : ''}`)
					problems.forEach(p => log('   !! ' + p))
					shifted += problems.length
				}
			}
		}
		log(`=> cohorts ${cohortsChecked}, learners ${learnersChecked}, misplaced/missing regular papers ${shifted}`)
	}
})()
