// Per-institution header metadata used in PDF reports (logo path, sub-titles,
// affiliation/accreditation lines, address). Keyed by institutions.institution_code.
// Add a new entry when onboarding a new college; no code changes needed elsewhere
// because PDF generators read these fields off a single object.

export interface InstitutionHeader {
	logo_path: string         // /public path to the brand logo
	name: string              // Header line 1 — the institution's official name
	subtitle?: string         // Optional line 2 — e.g. "(An Autonomous Institution)"
	trust_line?: string       // Optional line 3 — e.g. "Managed by ... Trust"
	accreditation: string     // Line 4 — accreditation + affiliation
	address: string           // Line 5 — postal address
}

const HEADERS: Record<string, InstitutionHeader> = {
	CAS: {
		logo_path: '/jkkncas_logo.png',
		name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
		accreditation: '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
		address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
	},
	CET: {
		logo_path: '/jkkncet_logo.png',
		name: 'J.K.K. NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
		subtitle: '(An Autonomous Institution)',
		trust_line: 'Managed by J.K.K. Rangammal Charitable Trust',
		accreditation: 'Approved by AICTE & Affiliated to Anna University, Chennai',
		address: 'Natarajapuram, Kumarapalayam – 638 183, Namakkal Dt., Tamil Nadu',
	},
}

// Generic fallback — used when an institution_code isn't in HEADERS yet.
const FALLBACK: InstitutionHeader = {
	logo_path: '/jkkn_logo.png',
	name: 'J.K.K.NATARAJA EDUCATIONAL INSTITUTIONS',
	accreditation: '',
	address: '',
}

export function getInstitutionHeader(code: string | undefined): InstitutionHeader {
	if (!code) return FALLBACK
	return HEADERS[code] || FALLBACK
}
