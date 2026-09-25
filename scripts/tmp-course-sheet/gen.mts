import { writeFileSync } from 'node:fs'
import { generateCourseAssessmentSheetPDFBlob } from './gen-pdf.ts'
import { DEFAULT_COURSE_SHEET_OPTIONS } from '../../types/course-assessment-sheet.ts'

const n = Number(process.argv[2] || 34)
const out = process.argv[3] || 'out.pdf'
const learners = Array.from({ length: n }, (_, i) => ({
	serial_number: i + 1,
	register_number: `25JUGAID${String(i + 1).padStart(3, '0')}`,
	learner_name: `LEARNER NAME ${i + 1}`,
}))
const data = {
	institution_name: 'JKKN', institution_code: 'JKKNCAS',
	session_name: 'NOV-DEC-2026', session_code: 'NOV-DEC-2026',
	course_code: '24UHAWP01', course_title: 'HEALTH AND WELLNESS',
	logo_image: null, right_logo_image: null,
	programs: [],
}
const program = { program_code: 'UEN', program_name: 'B.A. ENGLISH', program_order: 1, semester: 3, class_label: 'II-B.A. ENGLISH', learners }
const blob = generateCourseAssessmentSheetPDFBlob(data as any, program, DEFAULT_COURSE_SHEET_OPTIONS)
const buf = Buffer.from(await blob.arrayBuffer())
writeFileSync(out, buf)
console.log('wrote', out, buf.length, 'bytes')
