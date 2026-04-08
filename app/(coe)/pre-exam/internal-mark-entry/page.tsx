"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Save, Loader2, Search, RefreshCw, AlertTriangle, Check, ChevronsUpDown, Download } from "lucide-react"

// Types
interface Institution {
	id: string
	name: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids: string[]
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_type: string | null
	program_order: number | null
}

interface CourseOffering {
	course_offering_id: string
	course_mapping_id: string
	course_id: string
	course_code: string
	course_name: string
	internal_max_mark: number
	course_order: number
	program_id: string
	program_code: string
	semester: number
}

interface Learner {
	id: string // exam_registration_id
	student_id: string
	stu_register_no: string
	student_name: string
	course_offering_id: string
	institutions_id: string
}

interface PatternComponent {
	component_code: string
	component_name: string
	weightage_percentage?: number
	display_order: number
	is_mandatory?: boolean
}

// ─── Number to words (for marks in words column) ───
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
	'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function numberToWords(n: number): string {
	if (n === 0) return 'Zero'
	if (n < 0) return 'Minus ' + numberToWords(-n)
	if (n < 20) return ones[n]
	if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
	if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '')
	return String(n)
}

export default function InternalMarkEntryPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	const {
		filter,
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Data state
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [assessmentOptions, setAssessmentOptions] = useState<{ id: string, label: string, status: 'open' | 'expired' | 'upcoming' | 'no-dates', setting: any, round: any }[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [availableSemesters, setAvailableSemesters] = useState<number[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [learners, setLearners] = useState<Learner[]>([])
	const [components, setComponents] = useState<PatternComponent[]>([])

	// Local institution selection (for super_admin with "All Institutions" global filter)
	const [localInstitutionId, setLocalInstitutionId] = useState("")

	// Effective institution ID: global filter takes priority, fallback to local selection
	const effectiveInstitutionId = institutionId || localInstitutionId || ""

	// Filter state
	const [selectedAssessment, setSelectedAssessment] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSemester, setSelectedSemester] = useState("")
	const [selectedCourseOffering, setSelectedCourseOffering] = useState("")

	// Derived from selected assessment
	const activeAssessment = useMemo(() =>
		assessmentOptions.find(a => a.id === selectedAssessment) || null,
		[assessmentOptions, selectedAssessment]
	)
	const ciaConfig = activeAssessment ? {
		setting_id: activeAssessment.setting.id,
		total_rounds: activeAssessment.setting.total_rounds,
		use_course_max: activeAssessment.setting.use_course_max,
		cia_rounds: activeAssessment.setting.cia_rounds,
	} : null
	const selectedCiaRound = activeAssessment ? String(activeAssessment.round.round) : ""

	// Mark entry state
	const [maxMarks, setMaxMarks] = useState<Record<string, number>>({})
	const [learnerMarks, setLearnerMarks] = useState<Record<string, Record<string, number>>>({})
	const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})

	// Grouped programs (UG first, then PG, sorted by program_order)
	const ugPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() !== 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)
	const pgPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() === 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)

	// Course offerings are already filtered by semester from API — no client-side filter needed

	// UI state
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [hasSaved, setHasSaved] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const [learnersLoading, setLearnersLoading] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Derived: selected course info
	const selectedCourse = useMemo(() => {
		return courseOfferings.find(co => co.course_offering_id === selectedCourseOffering)
	}, [courseOfferings, selectedCourseOffering])

	// Total max marks from components
	const totalMaxMarks = useMemo(() => {
		return Object.values(maxMarks).reduce((sum, val) => sum + (val || 0), 0)
	}, [maxMarks])

	// Filtered learners by search
	const filteredLearners = useMemo(() => {
		if (!searchTerm) return learners
		const term = searchTerm.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no?.toLowerCase().includes(term) ||
			l.student_name?.toLowerCase().includes(term)
		)
	}, [learners, searchTerm])

	// ===== Data Fetching — Cascading: Institution → Session → Assessment → Program → Semester → Course =====

	const cascadeBaseUrl = (instId: string, sessionId: string) =>
		`/api/pre-exam/internal-mark-entry?action=filter-cascade&institutions_id=${instId}&examination_session_id=${sessionId}`

	// 1. Load institutions + sessions on mount
	useEffect(() => {
		if (isReady) { fetchInstitutions(); fetchSessions() }
	}, [isReady])

	// 1b. Pre-fetch MyJKKN programs when institution is known (warms cache for instant load later)
	useEffect(() => {
		if (isReady && effectiveInstitutionId && institutions.length > 0) {
			getMyJKKNPrograms().catch(() => {})
		}
	}, [isReady, effectiveInstitutionId, institutions.length])

	// 2. When institution + session set → fetch assessments (CIA settings with active entry dates)
	useEffect(() => {
		// Reset downstream first
		setSelectedAssessment("")
		setPrograms([]); setSelectedProgram("")
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		// Then fetch
		if (isReady && effectiveInstitutionId && selectedSession) {
			fetchAssessments()
		} else {
			setAssessmentOptions([])
		}
	}, [isReady, institutionId, localInstitutionId, selectedSession])

	// 3. When assessment selected → fetch programs (filtered to setting's program_codes)
	useEffect(() => {
		setSelectedProgram(""); setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedAssessment && institutions.length > 0) {
			fetchPrograms()
		} else {
			setPrograms([])
		}
	}, [selectedAssessment])

	// 4. When program selected → fetch semesters
	useEffect(() => {
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) fetchSemesters(prog.program_code)
		}
	}, [selectedProgram])

	// 5. When semester selected → fetch courses (filtered by setting's course_categories)
	useEffect(() => {
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram && selectedSemester) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) {
					const currentAssessment = assessmentOptions.find(a => a.id === selectedAssessment)
					const cats: string[] = Array.isArray(currentAssessment?.setting?.course_type) ? currentAssessment.setting.course_type : []
					fetchCourses(prog.program_code, selectedSemester, cats)
				}
		}
	}, [selectedSemester])

	// 6. When course selected → load components from assessment round + fetch learners
	useEffect(() => {
		if (selectedCourseOffering && selectedSession && activeAssessment) {
			const round = activeAssessment.round
			if (round) {
				const comps = round.components.map((c: any) => ({
					component_code: c.code,
					component_name: c.name,
					display_order: 0,
				}))
				setComponents(comps)

				const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
				const courseMax = co?.internal_max_mark || 0
				const initialMax: Record<string, number> = {}
				round.components.forEach((c: any) => {
					initialMax[c.code] = activeAssessment.setting.use_course_max && round.components.length === 1
						? courseMax : (c.max_marks || 0)
				})
				setMaxMarks(initialMax)
			}
			fetchLearners(selectedCourseOffering, selectedSession, Number(selectedCiaRound) || undefined)
		} else {
			setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		}
	}, [selectedCourseOffering])

	// ===== Fetch Functions =====

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) setSessions(await res.json())
		} catch (error) {
			console.error('Failed to fetch sessions:', error)
		}
	}

	const fetchAssessments = async () => {
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSession}`)
			if (!res.ok) { setAssessmentOptions([]); return }
			const settings = await res.json()

			const today = new Date().toISOString().split('T')[0]
			const options: typeof assessmentOptions = []

			for (const setting of settings) {
				for (const round of (setting.cia_rounds || [])) {
					const from = round.entry_from || ''
					const to = round.entry_to || '9999-12-31'

					let status: 'open' | 'expired' | 'upcoming' | 'no-dates' = 'no-dates'
					if (from) {
						if (today < from) status = 'upcoming'
						else if (today > to) status = 'expired'
						else status = 'open'
					}

					options.push({
						id: `${setting.id}__${round.round}`,
						label: `${setting.setting_name} - ${round.round_name}`,
						status,
						setting,
						round,
					})
				}
			}
			setAssessmentOptions(options)
		} catch (error) {
			console.error('Failed to fetch assessments:', error)
			setAssessmentOptions([])
		}
	}

	// Cache MyJKKN programs — single shared promise to prevent duplicate calls
	const myjkknCacheRef = React.useRef<{ promise: Promise<any[]> | null, data: any[] }>({ promise: null, data: [] })

	const getMyJKKNPrograms = async (): Promise<any[]> => {
		if (myjkknCacheRef.current.data.length > 0) return myjkknCacheRef.current.data
		if (myjkknCacheRef.current.promise) return myjkknCacheRef.current.promise

		const inst = institutions.find(i => i.id === effectiveInstitutionId)
		const myjkknIds = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length === 0) return []

		myjkknCacheRef.current.promise = fetchMyJKKNPrograms(myjkknIds)
		const result = await myjkknCacheRef.current.promise
		myjkknCacheRef.current.data = result
		myjkknCacheRef.current.promise = null
		return result
	}

	const fetchPrograms = async () => {
		try {
			if (!activeAssessment) { setPrograms([]); return }

			const settingProgramCodes: string[] = activeAssessment.setting.program_codes || []

			// Parallel: registered codes + MyJKKN programs (from cache or single fetch)
			const [registeredCodes, myjkknProgs] = await Promise.all([
				fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=programs`).then(r => r.ok ? r.json() : []),
				getMyJKKNPrograms(),
			])

			const validCodes = settingProgramCodes.length > 0
				? registeredCodes.filter((c: string) => settingProgramCodes.includes(c))
				: registeredCodes

			if (validCodes.length === 0) { setPrograms([]); return }

			if (myjkknProgs.length > 0) {
				setPrograms(myjkknProgs
					.filter((p: any) => validCodes.includes(p.program_code || p.program_id))
					.map((p: any) => ({
						id: p.id,
						program_code: p.program_code || p.program_id,
						program_name: p.program_name || p.name,
						program_type: p.program_type || null,
						program_order: p.program_order ?? null,
					})))
			} else {
				setPrograms(validCodes.map((code: string) => ({ id: code, program_code: code, program_name: code, program_type: null, program_order: null })))
			}
		} catch (error) {
			console.error('Failed to fetch programs:', error)
			setPrograms([])
		}
	}

	const fetchSemesters = async (programCode: string) => {
		try {
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=semesters&program_code=${programCode}`)
			if (res.ok) setAvailableSemesters(await res.json())
			else setAvailableSemesters([])
		} catch (error) {
			console.error('Failed to fetch semesters:', error)
			setAvailableSemesters([])
		}
	}

	const fetchCourses = async (programCode: string, semester: string, courseCategories: string[] = []) => {
		try {
			setLoading(true)
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=courses&program_code=${programCode}&semester=${semester}`)
			if (res.ok) {
				let data = await res.json()
				// Filter by course categories from CIA setting (case-insensitive)
				if (courseCategories.length > 0) {
					const lowerCats = courseCategories.map(c => c.toLowerCase())
					data = data.filter((co: any) => {
						const cat = (co.course_category || '').toLowerCase()
						return cat && lowerCats.includes(cat)
					})
				}
				setCourseOfferings(data)
			} else {
				setCourseOfferings([])
			}
		} catch (error) {
			console.error('Failed to fetch courses:', error)
			setCourseOfferings([])
		} finally {
			setLoading(false)
		}
	}

	const fetchLearners = async (courseOfferingId: string, sessionId: string, ciaRound?: number) => {
		try {
			setLearnersLoading(true)
			let url = `/api/pre-exam/internal-mark-entry?action=learners&course_offering_id=${courseOfferingId}&examination_session_id=${sessionId}`
			if (ciaRound) url += `&cia_round=${ciaRound}`
			// Pass program_code to filter learners by selected program
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) url += `&program_code=${prog.program_code}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setLearners(data)

				// Initialize marks — pre-fill from saved_marks if available
				const markFieldMap: Record<string, string> = {
					'assignment': 'assignment_marks', 'quiz': 'quiz_marks', 'mid_term': 'mid_term_marks',
					'presentation': 'presentation_marks', 'attendance': 'attendance_marks', 'lab': 'lab_marks',
					'project': 'project_marks', 'seminar': 'seminar_marks', 'viva': 'viva_marks',
					'test_1': 'test_1_mark', 'test_2': 'test_2_mark', 'test_3': 'test_3_mark', 'other': 'other_marks',
				}
				const marks: Record<string, Record<string, number>> = {}
				data.forEach((l: any) => {
					marks[l.id] = {}
					if (l.saved_marks) {
						// Pre-fill from saved cia_marks row
						for (const [compCode, dbField] of Object.entries(markFieldMap)) {
							const val = l.saved_marks[dbField]
							if (val != null && val > 0) marks[l.id][compCode] = val
						}
					}
				})
				setLearnerMarks(marks)
				setErrors({})
			} else {
				setLearners([])
			}
		} catch (error) {
			console.error('Failed to fetch learners:', error)
			setLearners([])
		} finally {
			setLearnersLoading(false)
		}
	}

	const fetchPatternComponents = async (courseId: string, programId: string, courseOfferingId: string) => {
		try {
			const instId = effectiveInstitutionId
			if (!instId) return

			const res = await fetch(`/api/pre-exam/internal-mark-entry?action=pattern-components&course_id=${courseId}&program_id=${programId}&institutions_id=${instId}`)
			if (res.ok) {
				const data = await res.json()
				const comps = data.components || []
				setComponents(comps)
				// Initialize max marks to 0 for each component
				const initialMax: Record<string, number> = {}
				comps.forEach((c: PatternComponent) => {
					initialMax[c.component_code] = 0
				})
				setMaxMarks(initialMax)
			}
		} catch (error) {
			console.error('Failed to fetch pattern components:', error)
		}
	}

	// ===== Mark Entry Handlers =====

	const handleMaxMarkChange = (componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return
		setMaxMarks(prev => ({ ...prev, [componentCode]: numValue }))
	}

	// Auto-advance: move to next input on Enter key
	const handleMarkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			// Try next row same column first, then next column first row
			const nextRow = document.querySelector<HTMLInputElement>(`[data-mark-row="${rowIdx + 1}"][data-mark-col="${colIdx}"]`)
			if (nextRow) {
				nextRow.focus()
				nextRow.select()
			} else {
				// Last row — move to first row of next column
				const nextCol = document.querySelector<HTMLInputElement>(`[data-mark-row="0"][data-mark-col="${colIdx + 1}"]`)
				if (nextCol) { nextCol.focus(); nextCol.select() }
			}
		}
	}

	const handleMarkChange = (examRegId: string, componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return

		setLearnerMarks(prev => ({
			...prev,
			[examRegId]: {
				...prev[examRegId],
				[componentCode]: numValue
			}
		}))

		// Validate against max mark
		const max = maxMarks[componentCode] || 0
		if (max > 0 && numValue > max) {
			setErrors(prev => ({
				...prev,
				[examRegId]: {
					...prev[examRegId],
					[componentCode]: `Exceeds max (${max})`
				}
			}))
		} else {
			setErrors(prev => {
				const updated = { ...prev }
				if (updated[examRegId]) {
					delete updated[examRegId][componentCode]
					if (Object.keys(updated[examRegId]).length === 0) {
						delete updated[examRegId]
					}
				}
				return updated
			})
		}
	}

	const getLearnerTotal = (examRegId: string): number => {
		const marks = learnerMarks[examRegId] || {}
		return Object.values(marks).reduce((sum, val) => sum + (val || 0), 0)
	}

	// ===== Save =====
	const [confirmOpen, setConfirmOpen] = useState(false)

	const hasValidationErrors = useMemo(() => {
		return Object.keys(errors).length > 0
	}, [errors])

	const hasAnyMarks = useMemo(() => {
		return Object.values(learnerMarks).some(marks =>
			Object.values(marks).some(v => v > 0)
		)
	}, [learnerMarks])

	const marksToSaveCount = useMemo(() => {
		return Object.values(learnerMarks).filter(marks =>
			Object.values(marks).some(v => v > 0)
		).length
	}, [learnerMarks])

	const handleSaveClick = () => {
		// Pre-validate before showing confirmation
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) {
			toast({ title: '❌ No Max Marks Set', description: 'Please set max marks for at least one component.', variant: 'destructive' }); return
		}
		if (hasValidationErrors) {
			toast({ title: '❌ Validation Errors', description: 'Please fix all mark errors before saving.', variant: 'destructive' }); return
		}
		if (!hasAnyMarks) {
			toast({ title: '❌ No Marks Entered', description: 'Please enter marks for at least one learner.', variant: 'destructive' }); return
		}
		setConfirmOpen(true)
	}

	const handleSave = async () => {
		setConfirmOpen(false)
		// Validate max marks are set
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) {
			toast({
				title: '❌ No Max Marks Set',
				description: 'Please set max marks for at least one component before saving.',
				variant: 'destructive'
			})
			return
		}

		if (hasValidationErrors) {
			toast({
				title: '❌ Validation Errors',
				description: 'Please fix all mark errors before saving.',
				variant: 'destructive'
			})
			return
		}

		if (!hasAnyMarks) {
			toast({
				title: '❌ No Marks Entered',
				description: 'Please enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
		if (!co) return

		const instId = effectiveInstitutionId
		if (!instId) return

		// Build only the active max marks (where max > 0)
		const activeMaxMarks: Record<string, number> = {}
		for (const [code, val] of Object.entries(maxMarks)) {
			if (val > 0) activeMaxMarks[code] = val
		}

		// Build learner marks array (only learners with marks entered)
		const marksToSave = learners
			.filter(l => {
				const marks = learnerMarks[l.id] || {}
				return Object.values(marks).some(v => v > 0)
			})
			.map(l => ({
				exam_registration_id: l.id,
				student_id: l.student_id,
				register_no: l.stu_register_no,
				marks: learnerMarks[l.id] || {}
			}))

		if (marksToSave.length === 0) {
			toast({
				title: '❌ No Marks to Save',
				description: 'Enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		try {
			setSaving(true)
			const res = await fetch('/api/pre-exam/internal-mark-entry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: instId,
					examination_session_id: selectedSession,
					course_offering_id: co.course_offering_id,
					course_id: co.course_id,
					program_id: co.program_id,
					cia_round: Number(selectedCiaRound) || 1,
					max_marks: activeMaxMarks,
					learner_marks: marksToSave
				})
			})

			const result = await res.json()

			if (res.ok) {
				toast({
					title: '✅ Marks Saved',
					description: result.message || `Saved marks for ${marksToSave.length} learners.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
				setHasSaved(true)
				// Refresh learners list
				fetchLearners(co.course_offering_id, selectedSession!, Number(selectedCiaRound) || undefined)
			} else {
				toast({
					title: '❌ Save Failed',
					description: result.error || 'Failed to save marks.',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('Save error:', error)
			toast({
				title: '❌ Network Error',
				description: 'Unable to connect to server.',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	// ===== Download PDF =====

	const handleDownloadPDF = async () => {
		if (!selectedCourse || components.length === 0 || learners.length === 0) return

		const { generateInternalMarksPDF } = await import('@/lib/utils/generate-internal-marks-pdf')

		const institution = institutions.find(i => i.id === effectiveInstitutionId)
		const prog = programs.find(p => p.id === selectedProgram)

		const pdfLearners = filteredLearners.map((l, idx) => ({
			serial_number: idx + 1,
			register_number: l.stu_register_no,
			student_name: l.student_name,
			component_marks: learnerMarks[l.id] || {},
			total: getLearnerTotal(l.id),
		}))

		const pdfComponents = components
			.filter(c => (maxMarks[c.component_code] || 0) > 0)
			.map(c => ({
				code: c.component_code,
				name: c.component_name,
				max_marks: maxMarks[c.component_code] || 0,
			}))

		// Load logos
		const loadImage = async (url: string): Promise<string> => {
			try {
				const res = await fetch(url)
				const blob = await res.blob()
				return new Promise((resolve, reject) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.onerror = reject
					reader.readAsDataURL(blob)
				})
			} catch { return '' }
		}
		const [leftLogo, rightLogo] = await Promise.all([
			loadImage('/jkkncas_logo.png'),
			loadImage('/jkkn_logo.png'),
		])

		generateInternalMarksPDF({
			institution_name: institution?.name || 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
			program_code: prog?.program_code || '',
			program_name: prog?.program_name || '',
			semester: selectedSemester,
			course_code: selectedCourse.course_code,
			course_name: selectedCourse.course_name,
			internal_max_mark: selectedCourse.internal_max_mark,
			exam_session: sessions.find(s => s.id === selectedSession)?.session_name || '',
			assessment_name: activeAssessment?.setting?.setting_name || '',
			cia_round_name: activeAssessment?.round?.round_name || 'CIA',
			components: pdfComponents,
			learners: pdfLearners,
			logoImage: leftLogo,
			rightLogoImage: rightLogo,
		})
	}

	// ===== Reset =====

	const handleReset = () => {
		setLocalInstitutionId("")
		setAssessmentOptions([])
		setSelectedAssessment("")
		setSelectedProgram("")
		setAvailableSemesters([])
		setSelectedSemester("")
		setCourseOfferings([])
		setSelectedCourseOffering("")
		setLearners([])
		setComponents([])
		setMaxMarks({})
		setLearnerMarks({})
		setErrors({})
		setSearchTerm("")
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Internal Mark Entry</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Filters Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">Internal Mark Entry</CardTitle>
								<Button variant="outline" size="sm" onClick={handleReset}>
									<RefreshCw className="h-4 w-4 mr-2" />
									Reset
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-3">
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Institution <span className="text-red-500">*</span></label>
										<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>{inst.institution_code} - {inst.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Exam Session — hidden when global session is selected */}
								{mustSelectSession && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exam Session <span className="text-red-500">*</span></label>
										<Select value={selectedSession || ""} onValueChange={setSelectedSession}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Session" /></SelectTrigger>
											<SelectContent>
												{sessions
													.filter(s => !shouldFilter || !institutionId || s.institutions_id === institutionId)
													.map(s => (
														<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
													))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Assessment */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment <span className="text-red-500">*</span></label>
									{assessmentOptions.length === 0 && selectedSession ? (
										<div className="h-10 flex items-center px-3 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs">
											No assessments configured for this session
										</div>
									) : assessmentOptions.length > 0 && !assessmentOptions.some(a => a.status === 'open' || a.status === 'no-dates') ? (
										<div className="h-10 flex items-center px-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs">
											No active assessments
										</div>
									) : (
										<Select
											value={selectedAssessment}
											onValueChange={(val) => {
												const opt = assessmentOptions.find(a => a.id === val)
												if (opt && (opt.status === 'open' || opt.status === 'no-dates')) setSelectedAssessment(val)
											}}
											disabled={assessmentOptions.length === 0}
										>
											<SelectTrigger className="h-10">
												<SelectValue placeholder={!selectedSession ? 'Select Session first' : 'Select Assessment'} />
											</SelectTrigger>
											<SelectContent className="max-w-[450px]">
												{assessmentOptions.map(opt => {
													const isOpen = opt.status === 'open' || opt.status === 'no-dates'
													return (
														<SelectItem key={opt.id} value={opt.id} disabled={!isOpen} className={cn(!isOpen && "opacity-50")}>
															<div className="flex items-center gap-2">
																<span className={cn("w-2 h-2 rounded-full shrink-0", {
																	'bg-emerald-500': opt.status === 'open',
																	'bg-red-500': opt.status === 'expired',
																	'bg-amber-500': opt.status === 'upcoming',
																	'bg-blue-400': opt.status === 'no-dates',
																})} />
																<span className={cn(!isOpen && "line-through")}>{opt.label}</span>
																{opt.status === 'expired' && <span className="text-[10px] text-red-500">Closed</span>}
																{opt.status === 'upcoming' && <span className="text-[10px] text-amber-600">Opens {opt.round.entry_from}</span>}
																{opt.status === 'open' && <span className="text-[10px] text-emerald-600">Open</span>}
															</div>
														</SelectItem>
													)
												})}
											</SelectContent>
										</Select>
									)}
								</div>

								{/* Program */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Program <span className="text-red-500">*</span></label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={programOpen}
												className="w-full justify-between h-10 text-sm font-normal"
												disabled={programs.length === 0}
											>
												<span className="truncate">
													{selectedProgram && selectedProgram !== 'all'
														? (() => {
															const p = programs.find(p => p.id === selectedProgram)
															return p ? `${p.program_code} - ${p.program_name}` : 'Select Program'
														})()
														: programs.length === 0 ? 'Select Assessment first' : 'Select Program'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No program found.</CommandEmpty>
												{ugPrograms.length > 0 && (
													<CommandGroup heading="UG Programs" className="max-h-60 overflow-auto">
														{ugPrograms.map(p => (
															<CommandItem
																key={p.id}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setSelectedProgram(p.id)
																	setProgramOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												)}
												{pgPrograms.length > 0 && (
													<CommandGroup heading="PG Programs" className="max-h-60 overflow-auto">
														{pgPrograms.map(p => (
															<CommandItem
																key={p.id}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setSelectedProgram(p.id)
																	setProgramOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												)}
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Semester <span className="text-red-500">*</span></label>
									<Select
										value={selectedSemester}
										onValueChange={setSelectedSemester}
										disabled={availableSemesters.length === 0}
									>
										<SelectTrigger className="h-10">
											<SelectValue placeholder={availableSemesters.length === 0 ? 'Select Program first' : 'Select Semester'} />
										</SelectTrigger>
										<SelectContent>
											{availableSemesters.map(sem => (
												<SelectItem key={sem} value={String(sem)}>
													Semester {sem}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Course */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course <span className="text-red-500">*</span></label>
									<Popover open={courseOpen} onOpenChange={setCourseOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={courseOpen}
												className="w-full justify-between h-10 text-sm font-normal"
												disabled={!selectedSemester || loading || courseOfferings.length === 0}
											>
												<span className="truncate">
													{selectedCourseOffering
														? (() => {
															const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
															return co ? `${co.course_code} - ${co.course_name}` : 'Select Course'
														})()
														: loading ? 'Loading courses...' : !selectedSemester ? 'Select Semester first' : courseOfferings.length === 0 ? 'No courses available' : 'Select Course'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[450px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search course code or name..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No course found.</CommandEmpty>
												<CommandGroup className="max-h-72 overflow-auto">
													{courseOfferings.map((co, coIdx) => (
														<CommandItem
															key={co.course_offering_id}
															value={`${String(coIdx).padStart(3, '0')} ${co.course_code} ${co.course_name}`}
															onSelect={() => {
																setSelectedCourseOffering(co.course_offering_id)
																setCourseOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedCourseOffering === co.course_offering_id ? "opacity-100" : "opacity-0")} />
															<span className="flex-1 whitespace-normal">{co.course_code} - {co.course_name}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Course Info + Max Marks — compact single row */}
					{selectedCourse && components.length > 0 && (
						<Card className="border-l-4 border-l-blue-500">
							<CardContent className="py-3 px-4">
								<div className="flex items-center gap-4 flex-wrap">
									<div className="flex items-center gap-2 min-w-0">
										<span className="text-sm font-semibold truncate">{selectedCourse.course_code} - {selectedCourse.course_name}</span>
										<Badge variant="outline" className="text-[10px] shrink-0">Max: {selectedCourse.internal_max_mark}</Badge>
										{totalMaxMarks > 0 && (
											<Badge variant={totalMaxMarks > selectedCourse.internal_max_mark ? 'destructive' : 'default'} className={cn("text-[10px] shrink-0", totalMaxMarks <= selectedCourse.internal_max_mark && "bg-emerald-100 text-emerald-700 hover:bg-emerald-100")}>
												Total: {totalMaxMarks}
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
										{components.map(comp => (
											<div key={comp.component_code} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
												<label className="text-xs font-medium text-blue-700 whitespace-nowrap">{comp.component_name}</label>
												<Input
													type="number"
													min={0}
													value={maxMarks[comp.component_code] || ''}
													onChange={(e) => handleMaxMarkChange(comp.component_code, e.target.value)}
													placeholder="0"
													className={cn("h-7 w-14 text-xs text-center font-bold border-blue-300 bg-white", ciaConfig?.use_course_max && "bg-blue-100 cursor-not-allowed")}
													disabled={!!ciaConfig?.use_course_max}
												/>
											</div>
										))}
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Learners Mark Entry Table */}
					{selectedCourseOffering && (
						<Card className="border-l-4 border-l-emerald-500">
							<CardHeader className="pb-3 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-base flex items-center gap-2">
											Learner Marks Entry
											{activeAssessment && (
												<Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
													{activeAssessment?.round?.round_name || 'CIA'}
												</Badge>
											)}
											{learners.length > 0 && (
												<Badge variant="secondary" className="text-xs">{learners.length} learners</Badge>
											)}
										</CardTitle>
									</div>
									<div className="flex items-center gap-2">
										<div className="relative">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Search by register no or name..."
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												className="pl-8 h-8 w-64"
											/>
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4">
								{learnersLoading ? (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-6 w-6 animate-spin mr-2" />
										<span className="text-muted-foreground">Loading learners...</span>
									</div>
								) : filteredLearners.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
										<AlertTriangle className="h-8 w-8 mb-2" />
										<p>{learners.length === 0 ? 'No regular learners found for this course, or all marks have already been entered.' : 'No matching learners found.'}</p>
									</div>
								) : (
									<div className="overflow-x-auto rounded-lg border">
										<Table>
											<TableHeader>
												<TableRow className="bg-slate-50 dark:bg-slate-900/50">
													<TableHead className="w-12 text-center text-xs font-semibold">S.No</TableHead>
													<TableHead className="w-36 text-xs font-semibold">Register Number</TableHead>
													<TableHead className="min-w-[200px] text-xs font-semibold">Name of the Learner</TableHead>
													{components
														.filter(c => (maxMarks[c.component_code] || 0) > 0)
														.map(comp => (
															<TableHead key={comp.component_code} className="text-center min-w-[90px]">
																<div className="text-xs font-semibold">{comp.component_name}</div>
																<Badge variant="outline" className="text-[10px] mt-0.5 font-normal">Max: {maxMarks[comp.component_code]}</Badge>
															</TableHead>
														))
													}
													<TableHead className="text-center w-20 text-xs font-semibold">Total</TableHead>
													<TableHead className="min-w-[120px] text-xs font-semibold">Marks in Words</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredLearners.map((learner, idx) => {
													const total = getLearnerTotal(learner.id)
													const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
													return (
														<TableRow key={learner.id} className={idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-slate-900/20'}>
															<TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
															<TableCell className="text-sm font-mono font-medium">{learner.stu_register_no}</TableCell>
															<TableCell className="text-sm">{learner.student_name}</TableCell>
															{activeComponents.map((comp, colIdx) => {
																const error = errors[learner.id]?.[comp.component_code]
																return (
																	<TableCell key={comp.component_code} className="text-center p-1.5">
																		<Input
																			type="number"
																			min={0}
																			max={maxMarks[comp.component_code] || 999}
																			value={learnerMarks[learner.id]?.[comp.component_code] ?? ''}
																			onChange={(e) => handleMarkChange(learner.id, comp.component_code, e.target.value)}
																			onKeyDown={(e) => handleMarkKeyDown(e, idx, colIdx)}
																			data-mark-row={idx}
																			data-mark-col={colIdx}
																			className={cn(
																				"h-9 w-18 text-center text-sm mx-auto rounded-lg border-2 border-emerald-200 bg-emerald-50/40 font-medium focus:border-emerald-500 focus:ring-emerald-500 focus:bg-white transition-colors",
																				error && "!border-red-400 !bg-red-50 text-red-700"
																			)}
																			placeholder="-"
																		/>
																		{error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
																	</TableCell>
																)
															})}
															<TableCell className="text-center">
																<span className={cn(
																	"inline-flex items-center justify-center h-9 w-16 rounded-md text-sm font-bold",
																	total > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-muted-foreground"
																)}>
																	{total > 0 ? total : '-'}
																</span>
															</TableCell>
															<TableCell className="text-sm font-medium text-purple-700">
																{total > 0 ? numberToWords(total) : '-'}
															</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</Table>
									</div>
								)}
								{/* Save button at bottom */}
								{filteredLearners.length > 0 && (
									<div className="flex justify-end gap-3 pt-4 border-t mt-4">
										<Button
											onClick={handleSaveClick}
											disabled={saving || !hasAnyMarks || hasValidationErrors}
											size="sm"
											className="bg-emerald-600 hover:bg-emerald-700"
										>
											{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
											{saving ? 'Saving...' : 'Save Marks'}
										</Button>
										{hasSaved && (
											<Button
												onClick={handleDownloadPDF}
												size="sm"
												variant="outline"
											>
												<Download className="h-4 w-4 mr-2" />
												Download PDF
											</Button>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Save Confirmation Dialog */}
				<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Confirm Save Marks</DialogTitle>
						</DialogHeader>
						<div className="space-y-3 py-4">
							<div className="grid grid-cols-2 gap-y-2 text-sm">
								<div className="text-muted-foreground">Program</div>
								<div className="font-medium">{(() => { const p = programs.find(p => p.id === selectedProgram); return p ? `${p.program_code} - ${p.program_name}` : '-' })()}</div>
								<div className="text-muted-foreground">Semester</div>
								<div className="font-medium">Semester {selectedSemester}</div>
								<div className="text-muted-foreground">Course</div>
								<div className="font-medium">{selectedCourse ? `${selectedCourse.course_code} - ${selectedCourse.course_name}` : '-'}</div>
								{activeAssessment && (
									<>
										<div className="text-muted-foreground">Assessment</div>
										<div className="font-medium">{activeAssessment.label}</div>
									</>
								)}
								<div className="text-muted-foreground">Learners with marks</div>
								<div className="font-semibold text-emerald-700">{marksToSaveCount} of {learners.length}</div>
							</div>
						</div>
						<DialogFooter className="gap-2">
							<Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
							<Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
								<Save className="h-4 w-4 mr-2" />
								Confirm Save
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
