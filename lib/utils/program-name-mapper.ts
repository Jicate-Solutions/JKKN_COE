// Mapping of program codes to their full names
const PROGRAM_NAME_MAP: Record<string, string> = {
	PCM: 'MASTER OF COMMERCE',
	PCS: 'MASTER OF COMPUTER SCIENCE',
	PCH: 'MASTER OF CHEMISTRY',
	PEN: 'MASTER OF ENGLISH',
	PHI: 'MASTER OF HISTORY',
	PCA: 'MASTER OF COMPUTER APPLICATIONS',
	PMA: 'MASTER OF MATHEMATICS',
	PZO: 'MASTER OF ZOOLOGY',
	PDA: 'DOCTORAL PROGRAMME IN ANALYTICS',
	// Add more program code mappings as needed
}

/**
 * Get the full program name for a given program code
 * Falls back to the provided fallback name if no mapping exists
 */
export function getProgramDisplayName(programCode: string, fallbackName?: string): string {
	return PROGRAM_NAME_MAP[programCode] || fallbackName || programCode
}
