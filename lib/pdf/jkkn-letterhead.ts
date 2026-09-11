// The printed JKKN letterhead — the framed block with the college logo at the left
// and the coloured name / affiliation lines centred beside it, exactly as it appears
// on the college's own printed question papers.
//
// Only the DATA lives here. It is shared so that the question paper, the examiner
// order and anything else that prints a letterhead cannot drift apart on the
// college's legal name, its accreditation wording or its address — getting one of
// those wrong on a document that leaves the college is a real problem, and there
// were already two copies of these strings.
//
// Each renderer keeps its own CSS: the question paper prints two-up at roughly half
// size, a letter does not, so there is no one set of sizes that suits both.

import fs from 'fs'
import path from 'path'

/** One printed line of a boxed letterhead; `cls` picks its colour and size. */
export interface LetterheadLine {
	text: string
	cls: 'lh-name' | 'lh-trust' | 'lh-approve' | 'lh-naac' | 'lh-addr' | 'lh-web'
}

export interface JkknLetterhead {
	name: string
	address: string
	/**
	 * 'plain'  — centred name + address (the arts & science paper).
	 * 'boxed'  — the engineering-college letterhead: framed block with the logo at
	 *            the left and the coloured name/affiliation lines centred beside it,
	 *            under a Register Number grid.
	 */
	style?: 'plain' | 'boxed'
	/** File under public/ — embedded as base64 (Chromium can't fetch a relative URL). */
	logoFile?: string
	lines?: LetterheadLine[]
	/** Cells in the Register Number grid; 0 / absent = don't print one. */
	registerCells?: number
	/**
	 * File under public/ carrying the signatory's scanned signature.
	 *
	 * The CET scan is the Controller of Examinations' signature with the office
	 * stamp — "CONTROLLER OF EXAMINATIONS / J.K.K.NATTRAJA COLLEGE OF ENGINEERING
	 * AND TECHNOLOGY / AN AUTONOMOUS INSTITUTION / KUMARAPALAYAM" — baked into the
	 * image, so a renderer that prints it must NOT also print a typed designation
	 * underneath. Used on every examiner order copy for the engineering college.
	 */
	signatureFile?: string
	/** The Controller of Examinations, printed under the letterhead on the examiner order. */
	coe?: { name: string; designation?: string; phone?: string; email?: string }
	/** Sign-off printed at the foot of examiner e-mails, one entry per line. */
	emailSignature?: string[]
}

/** Printed letterhead per COE institution_code. */
export const JKKN_LETTERHEAD: Record<string, JkknLetterhead> = {
	CAS: {
		name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
		address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
	},
	// Engineering college. Its printed papers carry the Register Number grid at the
	// top right; the "Question Paper Code" box next to it belongs to the SEMESTER-END
	// paper only — an internal (CIA) paper has no code, so none is printed here.
	CET: {
		name: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING AND TECHNOLOGY',
		address: 'Natarajapuram, NH-544, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
		style: 'boxed',
		logoFile: 'jkkncet_logo.png',
		registerCells: 12,
		signatureFile: 'logo/engg/jkkncet_coe_sign.png',
		coe: {
			name: 'Dr. C.KATHIRVEL, B.E., M.E., Ph.D.,',
			designation: 'Controller of Examinations',
			phone: '97897 22312',
			email: 'dcoe@jkkn.ac.in',
		},
		emailSignature: [
			'Office of the Controller of Examinations',
			'V.Silambarasan., M.E., MBA., MIE.,(Ph.D).,',
			'Deputy Controller of Examinations',
			'J.K.K. Nattraja College of Engineering and Technology (An Autonomous Institution)',
			'Cell: 9789722312',
		],
		lines: [
			{ text: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING AND TECHNOLOGY', cls: 'lh-name' },
			{ text: '(AN AUTONOMOUS INSTITUTION)', cls: 'lh-name' },
			{ text: '(MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST)', cls: 'lh-trust' },
			{ text: '(Approved by AICTE - New Delhi and Affiliated to Anna University - Chennai)', cls: 'lh-approve' },
			{ text: 'Recognized by UGC under Section 2(f) & Accredited by NAAC', cls: 'lh-naac' },
			{ text: 'Natarajapuram, NH-544, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.', cls: 'lh-addr' },
			{ text: 'Website: www.engg.jkkn.in', cls: 'lh-web' },
		],
	},
}

/** The letterhead for an institution_code, or null when the college has none. */
export function getJkknLetterhead(code: string | null | undefined): JkknLetterhead | null {
	if (!code) return null
	return JKKN_LETTERHEAD[code.toUpperCase()] || null
}

/** True when this letterhead is the framed logo + coloured-lines block. */
export function isBoxedLetterhead(lh: JkknLetterhead | null | undefined): boolean {
	return lh?.style === 'boxed' && (lh.lines?.length || 0) > 0
}

/** public/<file> → data URI, so the image survives into headless Chromium. */
const imageCache = new Map<string, string | null>()
export function loadPublicImageDataUri(file?: string | null): string | null {
	if (!file) return null
	if (imageCache.has(file)) return imageCache.get(file) || null
	let uri: string | null = null
	try {
		const full = path.join(process.cwd(), 'public', file)
		if (fs.existsSync(full)) {
			const ext = path.extname(full).toLowerCase()
			const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/png'
			uri = `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`
		} else {
			console.warn('[JKKN letterhead] image not found:', full)
		}
	} catch (e: any) {
		console.warn('[JKKN letterhead] image failed:', e?.message)
	}
	imageCache.set(file, uri)
	return uri
}
