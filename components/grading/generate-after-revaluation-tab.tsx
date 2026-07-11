'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
	Calculator,
	CheckCircle2,
	FileEdit,
	Loader2,
	RefreshCw,
	Save,
	Search,
	TrendingDown,
	TrendingUp,
	Minus,
	AlertTriangle,
	Users
} from 'lucide-react'
import type { RevaluationLearnerRow, RevaluationResultRow, InstitutionOption, ProgramData, ExamSessionData, CourseOfferingData } from '@/types/final-marks'

/**
 * Generate After Revaluation tab
 *
 * Flow: select course (only courses with saved final marks) → enter/save
 * revaluation marks (stored in marks_entry.revaluation_marks_obtained,
 * the original mark stays in total_marks_obtained) → preview old vs new
 * results → apply selected rows to final_marks (original values are
 * snapshotted into final_marks.original_* on first apply).
 */
export function GenerateAfterRevaluationTab() {
	const { toast } = useToast()
	const { user } = useAuth()

	const {
		isReady,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		institutionId
	} = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Selection state
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [selectedInstitution, setSelectedInstitution] = useState('')
	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const [sessions, setSessions] = useState<ExamSessionData[]>([])
	const [programs, setPrograms] = useState<ProgramData[]>([])
	const [programsLoading, setProgramsLoading] = useState(false)
	const [selectedProgram, setSelectedProgram] = useState('')
	const [courseOfferings, setCourseOfferings] = useState<CourseOfferingData[]>([])
	const [coursesLoading, setCoursesLoading] = useState(false)
	const [selectedCourse, setSelectedCourse] = useState('')

	// Learners + mark entry state
	const [learners, setLearners] = useState<RevaluationLearnerRow[]>([])
	const [learnersLoading, setLearnersLoading] = useState(false)
	const [editedMarks, setEditedMarks] = useState<Record<string, string>>({})
	const [savingMarks, setSavingMarks] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')

	// Preview + apply state
	const [previewResults, setPreviewResults] = useState<RevaluationResultRow[]>([])
	const [previewSummary, setPreviewSummary] = useState<any>(null)
	const [generating, setGenerating] = useState(false)
	const [applying, setApplying] = useState(false)
	const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
	const [confirmOpen, setConfirmOpen] = useState(false)

	const institutionsRef = useRef(institutions)
	useEffect(() => {
		institutionsRef.current = institutions
	}, [institutions])

	// Institutions from context (same pattern as the generate wizard)
	useEffect(() => {
		if (availableInstitutions.length > 0) {
			setInstitutions(availableInstitutions.map(inst => ({
				id: inst.id,
				institution_code: inst.institution_code,
				name: inst.institution_name,
				myjkkn_institution_ids: (inst as any).myjkkn_institution_ids || []
			})))
		}
	}, [availableInstitutions])

	// Sync selected institution with the global filter
	useEffect(() => {
		if (!isReady) return
		if (mustSelectInstitution) {
			if (selectedInstitution) setSelectedInstitution('')
			return
		}
		const autoId = getInstitutionIdForCreate()
		if (autoId && autoId !== selectedInstitution) {
			setSelectedInstitution(autoId)
		}
	}, [isReady, mustSelectInstitution, institutionId, getInstitutionIdForCreate]) // eslint-disable-line react-hooks/exhaustive-deps

	// Sessions + programs when institution changes
	useEffect(() => {
		if (selectedInstitution) {
			fetchSessions(selectedInstitution)
			fetchPrograms(selectedInstitution)
		} else {
			setSessions([])
			setPrograms([])
		}
		setSelectedProgram('')
		setSelectedCourse('')
		resetResults()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedInstitution])

	// Courses when program + session change
	useEffect(() => {
		if (selectedProgram && selectedSession) {
			fetchCourseOfferings(selectedProgram, selectedSession)
		} else {
			setCourseOfferings([])
		}
		setSelectedCourse('')
		resetResults()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedProgram, selectedSession])

	// Learners when course changes
	useEffect(() => {
		if (selectedCourse) {
			fetchLearners()
		} else {
			setLearners([])
		}
		resetResults()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedCourse])

	const resetResults = () => {
		setPreviewResults([])
		setPreviewSummary(null)
		setSelectedRows(new Set())
		setEditedMarks({})
	}

	const fetchSessions = async (instId: string) => {
		try {
			const res = await fetch(`/api/grading/final-marks?action=sessions&institutionId=${instId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data.map((s: any) => ({
					id: s.id,
					session_code: s.session_code,
					session_name: s.session_name,
					institutions_id: instId
				})))
			}
		} catch (e) {
			console.error('Failed to fetch sessions:', e)
		}
	}

	const fetchPrograms = async (instId: string) => {
		try {
			setProgramsLoading(true)
			setPrograms([])
			const institution = institutionsRef.current.find(i => i.id === instId)
			const myjkknIds = institution?.myjkkn_institution_ids || []
			if (myjkknIds.length === 0) return

			const progs = await fetchMyJKKNPrograms(myjkknIds)
			setPrograms(progs.map(p => ({
				id: p.id,
				program_code: p.program_code,
				program_name: p.program_name,
				institutions_id: instId,
				program_order: p.program_order ?? 999
			})).sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return a.program_code.localeCompare(b.program_code)
			}))
		} catch (e) {
			console.error('Failed to fetch programs:', e)
		} finally {
			setProgramsLoading(false)
		}
	}

	const fetchCourseOfferings = async (programId: string, sessionId: string) => {
		try {
			setCoursesLoading(true)
			const program = programs.find(p => p.id === programId)
			const programCode = program?.program_code || ''
			const res = await fetch(`/api/grading/final-marks?action=course-offerings&institutionId=${selectedInstitution}&programId=${programId}&programCode=${encodeURIComponent(programCode)}&sessionId=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				// Revaluation only applies to courses that already have SAVED results
				setCourseOfferings((data || []).filter((co: any) => co.is_saved === true))
			}
		} catch (e) {
			console.error('Failed to fetch course offerings:', e)
		} finally {
			setCoursesLoading(false)
		}
	}

	const programCode = useMemo(() => programs.find(p => p.id === selectedProgram)?.program_code || '', [programs, selectedProgram])

	const fetchLearners = async () => {
		try {
			setLearnersLoading(true)
			setLearners([])
			const res = await fetch(`/api/grading/final-marks/revaluation?action=learners&institutionId=${selectedInstitution}&sessionId=${selectedSession}&programCode=${encodeURIComponent(programCode)}&courseId=${selectedCourse}`)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch learners')
			}
			const data = await res.json()
			setLearners(data)
		} catch (e) {
			console.error('Failed to fetch learners:', e)
			toast({
				title: 'Load Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch learners',
				variant: 'destructive'
			})
		} finally {
			setLearnersLoading(false)
		}
	}

	const handleMarkChange = (marksEntryId: string, value: string) => {
		setEditedMarks(prev => ({ ...prev, [marksEntryId]: value }))
	}

	const handleSaveMarks = async () => {
		const changes = Object.entries(editedMarks)
			.map(([marksEntryId, value]) => {
				const learner = learners.find(l => l.marks_entry_id === marksEntryId)
				if (!learner) return null
				const trimmed = value.trim()
				const parsed = trimmed === '' ? null : Number(trimmed)
				if (parsed !== null && (isNaN(parsed) || parsed < 0 || parsed > learner.external_max)) {
					return { invalid: true, register_no: learner.register_no, max: learner.external_max }
				}
				return { marks_entry_id: marksEntryId, revaluation_marks_obtained: parsed }
			})
			.filter(Boolean) as any[]

		const invalid = changes.find(c => c.invalid)
		if (invalid) {
			toast({
				title: 'Invalid Mark',
				description: `Mark for ${invalid.register_no} must be between 0 and ${invalid.max}.`,
				variant: 'destructive'
			})
			return
		}

		if (changes.length === 0) {
			toast({ title: 'No Changes', description: 'No revaluation marks were changed.' })
			return
		}

		try {
			setSavingMarks(true)
			const res = await fetch('/api/grading/final-marks/revaluation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'save-marks',
					marks: changes,
					entered_by: user?.id || null
				})
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Failed to save revaluation marks')

			if (data.errors?.length > 0) {
				toast({
					title: 'Partial Save',
					description: `Saved ${data.saved_count} mark(s). ${data.errors.length} failed: ${data.errors[0].error}`,
					variant: 'destructive'
				})
			} else {
				toast({
					title: 'Revaluation Marks Saved',
					description: `Saved ${data.saved_count} revaluation mark(s). Original marks are unchanged.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			}
			setEditedMarks({})
			fetchLearners()
		} catch (e) {
			toast({
				title: 'Save Failed',
				description: e instanceof Error ? e.message : 'Failed to save revaluation marks',
				variant: 'destructive'
			})
		} finally {
			setSavingMarks(false)
		}
	}

	const runGenerate = async (saveToDb: boolean) => {
		const payload = {
			action: 'generate',
			institutions_id: selectedInstitution,
			examination_session_id: selectedSession,
			program_code: programCode,
			course_id: selectedCourse,
			save_to_db: saveToDb,
			selected_final_marks_ids: saveToDb ? [...selectedRows] : undefined,
			applied_by: user?.id || null
		}

		const res = await fetch('/api/grading/final-marks/revaluation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		})
		const data = await res.json()
		if (!res.ok) throw new Error(data.error || 'Generation failed')
		return data
	}

	const handlePreview = async () => {
		try {
			setGenerating(true)
			const data = await runGenerate(false)
			setPreviewResults(data.results || [])
			setPreviewSummary(data.summary || null)
			setSelectedRows(new Set((data.results || []).map((r: RevaluationResultRow) => r.final_marks_id)))
			toast({
				title: 'Preview Generated',
				description: `Recalculated ${data.results?.length || 0} learner(s) with revaluation marks.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			toast({
				title: 'Generation Failed',
				description: e instanceof Error ? e.message : 'Failed to generate preview',
				variant: 'destructive'
			})
		} finally {
			setGenerating(false)
		}
	}

	const handleApply = async () => {
		try {
			setApplying(true)
			const data = await runGenerate(true)
			const errCount = data.errors?.length || 0
			toast({
				title: errCount > 0 ? 'Partially Applied' : 'Revaluation Results Applied',
				description: `Updated ${data.summary?.applied_count || 0} final marks record(s).${errCount > 0 ? ` ${errCount} failed.` : ' Original marks preserved in snapshot columns.'}`,
				variant: errCount > 0 ? 'destructive' : undefined,
				className: errCount > 0 ? undefined : 'bg-green-50 border-green-200 text-green-800'
			})
			setPreviewResults([])
			setPreviewSummary(null)
			setSelectedRows(new Set())
			fetchLearners()
		} catch (e) {
			toast({
				title: 'Apply Failed',
				description: e instanceof Error ? e.message : 'Failed to apply revaluation results',
				variant: 'destructive'
			})
		} finally {
			setApplying(false)
			setConfirmOpen(false)
		}
	}

	const toggleRow = (id: string) => {
		setSelectedRows(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const filteredLearners = useMemo(() => {
		const search = searchTerm.toLowerCase()
		return learners.filter(l =>
			l.register_no.toLowerCase().includes(search) ||
			l.student_name.toLowerCase().includes(search)
		)
	}, [learners, searchTerm])

	const withRevalCount = learners.filter(l => l.revaluation_mark !== null).length
	const appliedCount = learners.filter(l => l.is_revaluation_applied).length
	const hasUnsavedEdits = Object.keys(editedMarks).length > 0

	return (
		<div className="space-y-4">
			{/* Selection */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
							<FileEdit className="h-4 w-4 text-white" />
						</div>
						<div>
							<CardTitle>Generate After Revaluation</CardTitle>
							<CardDescription>
								Enter revaluation marks and update saved final marks. Original marks are always preserved.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{mustSelectInstitution && (
							<div className="space-y-2">
								<Label>Institution *</Label>
								<Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
									<SelectTrigger>
										<SelectValue placeholder="Select institution" />
									</SelectTrigger>
									<SelectContent>
										{institutions.map(inst => (
											<SelectItem key={inst.id} value={inst.id}>
												{inst.institution_code} - {inst.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						{mustSelectSession && (
							<div className="space-y-2">
								<Label>Examination Session *</Label>
								<Select value={selectedSession} onValueChange={setSelectedSession} disabled={mustSelectInstitution && !selectedInstitution}>
									<SelectTrigger>
										<SelectValue placeholder="Select session" />
									</SelectTrigger>
									<SelectContent>
										{sessions.map(s => (
											<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<div className="space-y-2">
							<Label>Program *</Label>
							<Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={(mustSelectInstitution && !selectedInstitution) || programsLoading}>
								<SelectTrigger>
									{programsLoading ? (
										<span className="flex items-center gap-2 text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											Loading...
										</span>
									) : (
										<SelectValue placeholder="Select program" />
									)}
								</SelectTrigger>
								<SelectContent>
									{programs.map(p => (
										<SelectItem key={p.id} value={p.id}>
											{p.program_code} - {p.program_name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Course (with saved results) *</Label>
							<Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={!selectedProgram || !selectedSession || coursesLoading}>
								<SelectTrigger>
									{coursesLoading ? (
										<span className="flex items-center gap-2 text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											Loading...
										</span>
									) : (
										<SelectValue placeholder="Select course" />
									)}
								</SelectTrigger>
								<SelectContent>
									{courseOfferings.map(co => (
										<SelectItem key={co.id} value={co.course_id}>
											{co.course_code} - {co.course_name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					{selectedProgram && selectedSession && !coursesLoading && courseOfferings.length === 0 && (
						<div className="mt-3 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
							<AlertTriangle className="h-3.5 w-3.5" />
							No courses with saved final marks found. Generate final marks first (Generate Final Marks tab).
						</div>
					)}
				</CardContent>
			</Card>

			{/* Mark entry */}
			{selectedCourse && (
				<Card>
					<CardHeader className="p-4">
						<div className="flex items-center justify-between flex-wrap gap-2">
							<div>
								<CardTitle className="text-lg">Revaluation Mark Entry</CardTitle>
								<CardDescription>
									{learners.length} learner(s) • {withRevalCount} with revaluation mark • {appliedCount} applied
								</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<div className="relative">
									<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										placeholder="Search..."
										className="pl-7 h-8 w-44 text-xs"
									/>
								</div>
								<Button size="sm" onClick={handleSaveMarks} disabled={!hasUnsavedEdits || savingMarks}>
									{savingMarks ? (
										<Loader2 className="h-4 w-4 mr-1 animate-spin" />
									) : (
										<Save className="h-4 w-4 mr-1" />
									)}
									Save Revaluation Marks
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						{learnersLoading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-6 w-6 animate-spin mr-2" />
								<span>Loading learners...</span>
							</div>
						) : learners.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								<Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
								<p>No learners with saved final marks and external mark entries found for this course.</p>
							</div>
						) : (
							<div className="rounded-md border overflow-hidden" style={{ maxHeight: '420px' }}>
								<div className="h-full max-h-[420px] overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="text-xs">Register No</TableHead>
												<TableHead className="text-xs">Name</TableHead>
												<TableHead className="text-xs text-center">Internal</TableHead>
												<TableHead className="text-xs text-center">Original ESE (Old)</TableHead>
												<TableHead className="text-xs text-center">Revaluation Mark (New)</TableHead>
												<TableHead className="text-xs text-center">Current Grade</TableHead>
												<TableHead className="text-xs text-center">Result Status</TableHead>
												<TableHead className="text-xs text-center">Revaluation</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredLearners.map(l => (
												<TableRow key={l.final_marks_id}>
													<TableCell className="text-sm font-medium">{l.register_no}</TableCell>
													<TableCell className="text-sm">{l.student_name}</TableCell>
													<TableCell className="text-sm text-center">{l.internal_marks}</TableCell>
													<TableCell className="text-sm text-center font-medium">
														{l.original_external_marks}/{l.external_max}
													</TableCell>
													<TableCell className="text-center">
														<Input
															type="number"
															min={0}
															max={l.external_max}
															step="0.5"
															value={editedMarks[l.marks_entry_id] ?? (l.revaluation_mark !== null ? String(l.revaluation_mark) : '')}
															onChange={(e) => handleMarkChange(l.marks_entry_id, e.target.value)}
															placeholder="-"
															className="h-8 w-20 text-center text-sm mx-auto"
														/>
													</TableCell>
													<TableCell className="text-sm text-center font-bold">{l.current_grade || '-'}</TableCell>
													<TableCell className="text-center">
														<Badge variant="outline" className="text-xs">{l.result_status}</Badge>
													</TableCell>
													<TableCell className="text-center">
														{l.is_revaluation_applied ? (
															<Badge className="text-xs bg-green-600">
																<CheckCircle2 className="h-3 w-3 mr-1" />
																Applied
															</Badge>
														) : l.revaluation_mark !== null ? (
															<Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
																Entered
															</Badge>
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</div>
						)}

						{learners.length > 0 && (
							<div className="flex items-center justify-between pt-4">
								<p className="text-xs text-muted-foreground">
									Original marks stay in marks_entry. Revaluation marks are stored in a separate column.
								</p>
								<Button onClick={handlePreview} disabled={withRevalCount === 0 || hasUnsavedEdits || generating}>
									{generating ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<Calculator className="h-4 w-4 mr-1" />
											Generate Preview
										</>
									)}
								</Button>
							</div>
						)}
						{hasUnsavedEdits && (
							<p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
								<AlertTriangle className="h-3 w-3" />
								Save revaluation marks before generating the preview.
							</p>
						)}
					</CardContent>
				</Card>
			)}

			{/* Preview + apply */}
			{previewResults.length > 0 && (
				<>
					{previewSummary && (
						<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
							<Card className="border-l-4 border-l-blue-500">
								<CardContent className="p-3">
									<p className="text-xs font-medium text-muted-foreground">With Revaluation</p>
									<p className="text-xl font-bold">{previewSummary.total_with_revaluation}</p>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-green-500">
								<CardContent className="p-3">
									<p className="text-xs font-medium text-muted-foreground">Improved</p>
									<p className="text-xl font-bold text-green-600">{previewSummary.improved}</p>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-red-500">
								<CardContent className="p-3">
									<p className="text-xs font-medium text-muted-foreground">Decreased</p>
									<p className="text-xl font-bold text-red-600">{previewSummary.decreased}</p>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-slate-400">
								<CardContent className="p-3">
									<p className="text-xs font-medium text-muted-foreground">Unchanged</p>
									<p className="text-xl font-bold">{previewSummary.unchanged}</p>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-purple-500">
								<CardContent className="p-3">
									<p className="text-xs font-medium text-muted-foreground">Grade Changed</p>
									<p className="text-xl font-bold text-purple-600">{previewSummary.grade_changed}</p>
								</CardContent>
							</Card>
						</div>
					)}

					<Card>
						<CardHeader className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<CardTitle className="text-lg">Preview: Old vs New Results</CardTitle>
									<CardDescription>Select the learners to update, then apply to final marks</CardDescription>
								</div>
								<div className="text-sm text-muted-foreground">
									{selectedRows.size} of {previewResults.length} selected
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-0">
							<div className="rounded-md border overflow-hidden" style={{ maxHeight: '420px' }}>
								<div className="h-full max-h-[420px] overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="w-[36px]">
													<Checkbox
														checked={selectedRows.size === previewResults.length && previewResults.length > 0}
														onCheckedChange={() => {
															if (selectedRows.size === previewResults.length) {
																setSelectedRows(new Set())
															} else {
																setSelectedRows(new Set(previewResults.map(r => r.final_marks_id)))
															}
														}}
													/>
												</TableHead>
												<TableHead className="text-xs">Register No</TableHead>
												<TableHead className="text-xs">Name</TableHead>
												<TableHead className="text-xs text-center">ESE: Old → New</TableHead>
												<TableHead className="text-xs text-center">Total: Old → New</TableHead>
												<TableHead className="text-xs text-center">%: Old → New</TableHead>
												<TableHead className="text-xs text-center">Grade: Old → New</TableHead>
												<TableHead className="text-xs text-center">Result: Old → New</TableHead>
												<TableHead className="text-xs text-center">Change</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{previewResults.map(r => (
												<TableRow key={r.final_marks_id} className={r.is_revaluation_applied ? 'opacity-70' : ''}>
													<TableCell>
														<Checkbox
															checked={selectedRows.has(r.final_marks_id)}
															onCheckedChange={() => toggleRow(r.final_marks_id)}
														/>
													</TableCell>
													<TableCell className="text-sm font-medium">{r.register_no}</TableCell>
													<TableCell className="text-sm">{r.student_name}</TableCell>
													<TableCell className="text-sm text-center">
														{r.old_external} → <span className="font-bold">{r.new_external}</span>
													</TableCell>
													<TableCell className="text-sm text-center">
														{r.old_total} → <span className="font-bold">{r.new_total}</span>
													</TableCell>
													<TableCell className="text-sm text-center">
														{r.old_percentage.toFixed(1)} → <span className="font-bold">{r.new_percentage.toFixed(1)}</span>
													</TableCell>
													<TableCell className="text-sm text-center">
														{r.old_grade || '-'} → <span className="font-bold">{r.new_grade}</span>
													</TableCell>
													<TableCell className="text-sm text-center">
														{r.old_pass_status || '-'} → <Badge
															variant={r.new_is_pass ? 'default' : 'destructive'}
															className={`text-xs ${r.new_is_pass ? 'bg-green-600' : 'bg-red-600'}`}
														>
															{r.new_pass_status}
														</Badge>
													</TableCell>
													<TableCell className="text-center">
														{r.marks_difference > 0 ? (
															<Badge className="text-xs bg-green-600">
																<TrendingUp className="h-3 w-3 mr-1" />
																+{r.marks_difference}
															</Badge>
														) : r.marks_difference < 0 ? (
															<Badge className="text-xs bg-red-600">
																<TrendingDown className="h-3 w-3 mr-1" />
																{r.marks_difference}
															</Badge>
														) : (
															<Badge variant="outline" className="text-xs">
																<Minus className="h-3 w-3 mr-1" />
																0
															</Badge>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</div>

							<div className="flex items-center justify-between pt-4 border-t mt-4">
								<Button variant="outline" onClick={handlePreview} disabled={generating || applying}>
									<RefreshCw className="h-4 w-4 mr-1" />
									Regenerate Preview
								</Button>
								<Button onClick={() => setConfirmOpen(true)} disabled={selectedRows.size === 0 || applying || generating}>
									{applying ? (
										<>
											<Loader2 className="h-4 w-4 mr-1 animate-spin" />
											Applying...
										</>
									) : (
										<>
											<Save className="h-4 w-4 mr-1" />
											Apply to Final Marks ({selectedRows.size})
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>
				</>
			)}

			{/* Confirmation */}
			<AlertDialog open={confirmOpen} onOpenChange={(open) => !applying && setConfirmOpen(open)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Apply Revaluation Results?</AlertDialogTitle>
						<AlertDialogDescription>
							This will update {selectedRows.size} final marks record(s) with the revaluation marks.
							The original marks, percentage, grade and result will be preserved in snapshot columns.
							Semester results for affected learners may need to be regenerated afterwards.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleApply} disabled={applying}>
							{applying ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Applying...
								</>
							) : (
								<>
									<Save className="h-4 w-4 mr-2" />
									Apply
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
