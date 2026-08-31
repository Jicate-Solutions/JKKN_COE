// UG / PG from a programme code.
//
// The rule is the DB function get_program_type_from_code()
// (20260117_fix_pg_program_pass_status.sql). It was already copied by hand into
// build-paper-pdf.ts, build-paper-pdf-html.ts, result-view and exam-fee; this is
// the copy the question-paper code shares so the format picked for a paper and
// the "UG - / PG - DEGREE EXAMINATIONS" heading printed on it can never disagree.

const PG_PREFIXES = [
	'MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM',
	'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG',
]

/** 'UG' | 'PG' from a programme code; defaults to UG when the code says nothing. */
export function programTypeFromCode(programCode?: string | null): 'UG' | 'PG' {
	const code = (programCode || '').toUpperCase().replace(/\s+/g, '')
	if (!code) return 'UG'
	if (PG_PREFIXES.some(p => code.startsWith(p.replace(/\s+/g, '')))) return 'PG'
	if (/^[0-9]{2}P[A-Z]/.test(code)) return 'PG' // 24PCHC02
	if (/^P[A-Z]{2,3}$/.test(code)) return 'PG' // PCH, PZO
	return 'UG'
}

/**
 * The same answer in the lowercase form `ia_paper_templates.program_type_applicability`
 * stores ('ug' | 'pg'), for matching a course against a format.
 */
export function programTypeToken(programCode?: string | null): 'ug' | 'pg' {
	return programTypeFromCode(programCode) === 'PG' ? 'pg' : 'ug'
}
