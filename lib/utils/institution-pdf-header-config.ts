export interface InstitutionHeaderConfig {
	institutionName: string
	subHeadings?: string[]
	accreditationText: string
	address: string
	logoFile: string
}

const COMMON_SUB_HEADINGS = [
	'(An Autonomous Institution)',
	'Managed by J.K.K. Rangammal Charitable Trust',
]

const COMMON_ADDRESS = 'Natarajapuram, Kumarapalayam – 638 183, Namakkal Dt., Tamil Nadu'
const COMMON_LOGO = 'jkkn_logo.png'

const INSTITUTION_HEADER_MAP: Record<string, InstitutionHeaderConfig> = {
	CET: {
		institutionName: 'J.K.K. Nattraja College of Engineering & Technology',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: 'jkkncet_logo.png',
	},
	CAS: {
		institutionName: 'J.K.K. Nataraja College of Arts & Science',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText:
			'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	COP: {
		institutionName: 'J.K.K. Nattraja College of Pharmacy',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Approved by PCI, New Delhi & Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	CON: {
		institutionName: 'J.K.K. Nattraja College of Nursing',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Approved by INC & TNNC, New Delhi & Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	AHS: {
		institutionName: 'J.K.K. Nattraja College of Allied Health Sciences',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	COD: {
		institutionName: 'J.K.K. Nattraja Dental College & Hospital',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Approved by DCI, New Delhi & Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	COE: {
		institutionName: 'J.K.K. Nattraja College of Education',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Approved by NCTE, New Delhi & Affiliated to Tamil Nadu Teachers Education University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	NMC: {
		institutionName: 'J.K.K. Nattraja College of Naturopathy & Yogic Sciences',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
	PAG: {
		institutionName: 'J.K.K. Nattraja Ayurveda Medical College',
		subHeadings: COMMON_SUB_HEADINGS,
		accreditationText: 'Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai',
		address: COMMON_ADDRESS,
		logoFile: COMMON_LOGO,
	},
}

const DEFAULT_HEADER: InstitutionHeaderConfig = {
	institutionName: 'J.K.K. Nattraja Educational Institutions',
	subHeadings: COMMON_SUB_HEADINGS,
	accreditationText: '',
	address: COMMON_ADDRESS,
	logoFile: COMMON_LOGO,
}

export function getInstitutionHeaderConfig(institutionCode?: string | null): InstitutionHeaderConfig {
	if (!institutionCode) return DEFAULT_HEADER
	return INSTITUTION_HEADER_MAP[institutionCode.toUpperCase()] || DEFAULT_HEADER
}
