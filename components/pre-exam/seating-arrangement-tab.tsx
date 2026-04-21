'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, LayoutGrid, Download, Save, Trash2, AlertTriangle, Users, BookOpen, GraduationCap, DoorOpen } from 'lucide-react'
import { RoomGrid, ProgramLegend } from './room-grid'
import { RoomSuggestionPanel } from './room-suggestion-panel'
import { generateSeatingAllocation, generateFromColumnPlans } from '@/lib/seating/seating-engine'
import { suggestRooms } from '@/lib/seating/seating-utils'
import { autoAssignColumns } from '@/lib/seating/column-allocator'
import { generateSeatingPlanPDF } from '@/lib/utils/generate-seating-plan-pdf'
import type {
	SeatingStudent,
	SeatingRoom,
	SeatingStrategy,
	RoomSuggestion,
	RoomColumnPlan,
	SeatingAllocationResult,
} from '@/types/seating-allocation'

interface SeatingArrangementTabProps {
	institutionId: string
	examinationSessionId: string
	examDate: string
	sessionType: string // FN or AN
	sessionName: string // e.g. "APRIL - MAY 2026"
	isFormComplete: boolean
}

type Step = 'idle' | 'summary' | 'rooms' | 'generated' | 'saved'

const STRATEGY_DESCRIPTIONS: Record<SeatingStrategy, string> = {
	'institution-standard': 'Row-wise ABAB interleaving by program. Students from different programs alternate across each row for simple, consistent separation.',
	'smart-mixing': 'Arts Seating — intelligently places learners so adjacent seats always have different programs and subjects. Ideal for mixed-program halls.',
	'strict': 'Maximum separation with conflict detection. Same as Arts Seating but flags any remaining neighbour conflicts for manual review.',
	'manual': 'Manually assign programs to specific rooms. Each room gets students only from the programs you choose.',
}

export function SeatingArrangementTab({
	institutionId,
	examinationSessionId,
	examDate,
	sessionType,
	sessionName,
	isFormComplete,
}: SeatingArrangementTabProps) {
	const { toast } = useToast()

	// Data
	const [students, setStudents] = useState<SeatingStudent[]>([])
	const [rooms, setRooms] = useState<SeatingRoom[]>([])

	// UI state
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [step, setStep] = useState<Step>('idle')
	const [strategy, setStrategy] = useState<SeatingStrategy>('smart-mixing')
	const [roomSuggestions, setRoomSuggestions] = useState<RoomSuggestion[]>([])
	const [columnPlans, setColumnPlans] = useState<RoomColumnPlan[]>([])
	const [allocation, setAllocation] = useState<SeatingAllocationResult | null>(null)

	// Auto-load learners & rooms when all filters are complete (no click needed)
	useEffect(() => {
		if (isFormComplete && step === 'idle') {
			handleFetchData()
		}
	}, [isFormComplete]) // eslint-disable-line react-hooks/exhaustive-deps

	// Computed: program color map
	const programColorMap = useMemo(() => {
		const programs = [...new Set(students.map(s => s.program_code))].sort()
		const map = new Map<string, number>()
		programs.forEach((code, index) => {
			map.set(code, index)
		})
		return map
	}, [students])

	// Computed: summary stats
	const summaryStats = useMemo(() => {
		const programs = new Set(students.map(s => s.program_code))
		const subjects = new Set(students.map(s => s.course_code))
		const programCounts = new Map<string, number>()
		for (const s of students) {
			programCounts.set(s.program_code, (programCounts.get(s.program_code) || 0) + 1)
		}
		return {
			totalStudents: students.length,
			totalPrograms: programs.size,
			totalSubjects: subjects.size,
			totalRooms: rooms.length,
			programCounts,
		}
	}, [students, rooms])

	// --- Handlers ---

	const handleFetchData = useCallback(async () => {
		setLoading(true)
		try {
			const params = new URLSearchParams({
				institutions_id: institutionId,
				examination_session_id: examinationSessionId,
				exam_date: examDate,
				session: sessionType,
			})

			const [studentsRes, roomsRes] = await Promise.all([
				fetch(`/api/pre-exam/seating/students?${params}`),
				fetch(`/api/pre-exam/seating/rooms?institutions_id=${institutionId}`),
			])

			if (!studentsRes.ok || !roomsRes.ok) {
				throw new Error('Failed to fetch data')
			}

			const studentsData = await studentsRes.json()
			const roomsData: SeatingRoom[] = await roomsRes.json()

			const fetchedStudents: SeatingStudent[] = studentsData.students || []

			if (fetchedStudents.length === 0) {
				toast({
					title: '❌ No Learners Found',
					description: 'No approved registrations found for this date and session. Check that timetables are published.',
					variant: 'destructive',
				})
				setLoading(false)
				return
			}

			setStudents(fetchedStudents)
			setRooms(roomsData)
			setStep('summary')

			toast({
				title: '✅ Data Loaded',
				description: `${fetchedStudents.length} learners and ${roomsData.length} rooms loaded.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('Fetch data error:', err)
			toast({
				title: '❌ Error',
				description: 'Failed to load learners and rooms. Please try again.',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [institutionId, examinationSessionId, examDate, sessionType, toast])

	const handleProceedToRooms = useCallback(() => {
		// Auto-assign courses to room columns based on program_type rules
		const plans = autoAssignColumns(students, rooms)
		setColumnPlans(plans)
		setStep('rooms')
	}, [rooms, students])

	const handleGenerate = useCallback(async (confirmedPlans: RoomColumnPlan[]) => {
		setLoading(true)
		try {
			// Use column-wise allocation from the confirmed plans
			const result = generateFromColumnPlans(students, confirmedPlans)

			setAllocation(result)
			setStep('generated')

			if (result.conflicts.length > 0) {
				toast({
					title: '⚠️ Conflicts Detected',
					description: `Seating generated with ${result.conflicts.length} conflict(s). Review the warnings below.`,
					className: 'bg-amber-50 border-amber-200 text-amber-800',
				})
			} else if (result.unassigned_students.length > 0) {
				toast({
					title: '⚠️ Insufficient Seats',
					description: `${result.unassigned_students.length} learner(s) could not be seated. Add more rooms.`,
					className: 'bg-amber-50 border-amber-200 text-amber-800',
				})
			} else {
				toast({
					title: '✅ Generated',
					description: `${result.total_seated} learners seated across ${result.rooms.length} room(s).`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			}
		} catch (err) {
			console.error('Generate error:', err)
			toast({
				title: '❌ Error',
				description: 'Failed to generate seating allocation. Please try again.',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [students, toast])

	const handleSave = useCallback(async () => {
		if (!allocation) return
		setSaving(true)
		try {
			const response = await fetch('/api/pre-exam/seating/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionId,
					exam_date: examDate,
					exam_session: sessionType,
					rooms: allocation.rooms,
				}),
			})

			if (!response.ok) {
				const data = await response.json()
				throw new Error(data.error || 'Failed to save')
			}

			const data = await response.json()
			setStep('saved')

			toast({
				title: '✅ Saved',
				description: `Seating allocation saved. ${data.total_saved} seat(s) recorded.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('Save error:', err)
			toast({
				title: '❌ Save Failed',
				description: err instanceof Error ? err.message : 'Failed to save seating allocation.',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}, [allocation, institutionId, examDate, sessionType, toast])

	const handleClear = useCallback(async () => {
		setLoading(true)
		try {
			const params = new URLSearchParams({
				institutions_id: institutionId,
				exam_date: examDate,
				exam_session: sessionType,
			})

			const response = await fetch(`/api/pre-exam/seating/clear?${params}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				throw new Error('Failed to clear allocation')
			}

			setAllocation(null)
			setStep('summary')

			toast({
				title: '✅ Cleared',
				description: 'Seating allocation has been cleared.',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('Clear error:', err)
			toast({
				title: '❌ Error',
				description: 'Failed to clear seating allocation.',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [institutionId, examDate, sessionType, toast])

	const handleDownloadPDF = useCallback(async () => {
		if (!allocation) return

		// Load logos for the PDF header
		let logoBase64: string | null = null
		let rightLogoBase64: string | null = null
		try {
			const [logoRes, rightLogoRes] = await Promise.all([
				fetch('/jkkn_logo.png'),
				fetch('/jkkncas_logo.png'),
			])
			if (logoRes.ok) {
				const blob = await logoRes.blob()
				logoBase64 = await blobToBase64(blob)
			}
			if (rightLogoRes.ok) {
				const blob = await rightLogoRes.blob()
				rightLogoBase64 = await blobToBase64(blob)
			}
		} catch { /* continue without logos */ }

		generateSeatingPlanPDF({
			institution_name: 'JKKN Institution',
			institution_code: '',
			session_name: sessionName,
			exam_date: examDate,
			session_type: sessionType,
			strategy: allocation.strategy,
			rooms: allocation.rooms,
			generated_at: new Date().toISOString(),
			logo_image: logoBase64,
			right_logo_image: rightLogoBase64,
		})
		toast({
			title: '✅ Downloaded',
			description: 'Seating plan PDF saved.',
			className: 'bg-green-50 border-green-200 text-green-800',
		})
	}, [allocation, examDate, sessionType, sessionName, toast])

	// --- Render helpers ---

	function renderIdle() {
		// Form complete — auto-load is firing, show spinner only
		if (isFormComplete || loading) {
			return (
				<div className="flex flex-col items-center justify-center py-12 gap-3">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">Loading learners and rooms...</p>
				</div>
			)
		}
		// Form incomplete — guide the user
		return (
			<div className="flex flex-col items-center justify-center py-12 gap-2">
				<LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
				<p className="text-sm text-muted-foreground">
					Select session, date, and session type above to generate seating arrangement.
				</p>
			</div>
		)
	}

	function renderSummary() {
		return (
			<div className="space-y-6">
				{/* Stats grid */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<Card className="border-blue-200 bg-blue-50/50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-center gap-2">
								<Users className="h-4 w-4 text-blue-600" />
								<span className="text-xs font-medium text-blue-600">Total Learners</span>
							</div>
							<p className="text-2xl font-bold text-blue-800 mt-1">{summaryStats.totalStudents}</p>
						</CardContent>
					</Card>
					<Card className="border-emerald-200 bg-emerald-50/50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-center gap-2">
								<GraduationCap className="h-4 w-4 text-emerald-600" />
								<span className="text-xs font-medium text-emerald-600">Programs</span>
							</div>
							<p className="text-2xl font-bold text-emerald-800 mt-1">{summaryStats.totalPrograms}</p>
						</CardContent>
					</Card>
					<Card className="border-amber-200 bg-amber-50/50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-center gap-2">
								<BookOpen className="h-4 w-4 text-amber-600" />
								<span className="text-xs font-medium text-amber-600">Subjects</span>
							</div>
							<p className="text-2xl font-bold text-amber-800 mt-1">{summaryStats.totalSubjects}</p>
						</CardContent>
					</Card>
					<Card className="border-purple-200 bg-purple-50/50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-center gap-2">
								<DoorOpen className="h-4 w-4 text-purple-600" />
								<span className="text-xs font-medium text-purple-600">Available Rooms</span>
							</div>
							<p className="text-2xl font-bold text-purple-800 mt-1">{summaryStats.totalRooms}</p>
						</CardContent>
					</Card>
				</div>

				{/* Per-program badges */}
				<div className="flex flex-wrap gap-2">
					{Array.from(summaryStats.programCounts.entries())
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([program, count]) => (
							<Badge key={program} variant="secondary" className="text-xs">
								{program}: {count} learner{count !== 1 ? 's' : ''}
							</Badge>
						))}
				</div>

				{/* Strategy selection */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Seating Strategy</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="strategy-select">Strategy</Label>
							<Select
								value={strategy}
								onValueChange={(val) => setStrategy(val as SeatingStrategy)}
							>
								<SelectTrigger id="strategy-select" className="w-full sm:w-[360px]">
									<SelectValue placeholder="Select strategy" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="smart-mixing">Arts Seating ⭐ (Recommended)</SelectItem>
									<SelectItem value="institution-standard">Institution Standard (ABAB)</SelectItem>
									<SelectItem value="strict">Strict Mode (with Conflicts)</SelectItem>
									<SelectItem value="manual">Manual Assignment</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<p className="text-sm text-muted-foreground">
							{STRATEGY_DESCRIPTIONS[strategy]}
						</p>

						<div className="flex justify-end">
							<Button onClick={handleProceedToRooms} className="w-full sm:w-auto">
								Select Rooms
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	function renderRooms() {
		return (
			<RoomSuggestionPanel
				columnPlans={columnPlans}
				students={students}
				totalStudents={students.length}
				onConfirm={handleGenerate}
				onCancel={() => setStep('summary')}
			/>
		)
	}

	function renderGenerated() {
		if (!allocation) return null

		const isSaved = step === 'saved'

		return (
			<div className="space-y-6">
				{/* Action bar */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<ProgramLegend programColorMap={programColorMap} />

					<div className="flex flex-wrap items-center gap-2">
						{isSaved ? (
							<Badge className="bg-green-100 text-green-800 border-green-300">
								Saved
							</Badge>
						) : (
							<Button onClick={handleSave} disabled={saving} size="sm">
								{saving ? (
									<>
										<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
										Saving...
									</>
								) : (
									<>
										<Save className="mr-2 h-3.5 w-3.5" />
										Save Allocation
									</>
								)}
							</Button>
						)}

						<Button
							variant="outline"
							size="sm"
							onClick={handleDownloadPDF}
						>
							<Download className="mr-2 h-3.5 w-3.5" />
							PDF
						</Button>

						<Button
							variant="destructive"
							size="sm"
							onClick={handleClear}
							disabled={loading}
						>
							{loading ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Trash2 className="h-3.5 w-3.5" />
							)}
						</Button>
					</div>
				</div>

				{/* Summary badge row */}
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline">
						{allocation.total_seated} / {allocation.total_students} seated
					</Badge>
					<Badge variant="outline">
						{allocation.rooms.length} room{allocation.rooms.length !== 1 ? 's' : ''}
					</Badge>
					<Badge variant="outline" className="capitalize">
						{allocation.strategy.replace('-', ' ')}
					</Badge>
				</div>

				{/* Conflicts warning */}
				{allocation.conflicts.length > 0 && (
					<Card className="border-amber-300 bg-amber-50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-start gap-2">
								<AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
								<div className="space-y-1">
									<p className="text-sm font-medium text-amber-800">
										{allocation.conflicts.length} Conflict{allocation.conflicts.length !== 1 ? 's' : ''} Detected
									</p>
									<ul className="text-xs text-amber-700 space-y-0.5">
										{allocation.conflicts.slice(0, 5).map((c, i) => (
											<li key={i}>
												Room {c.room_code} ({c.conflict_type.replace('_', ' ')}): {c.student_reg_no} adjacent to {c.neighbor_reg_no} at R{c.row}C{c.column}
											</li>
										))}
										{allocation.conflicts.length > 5 && (
											<li className="font-medium">
												...and {allocation.conflicts.length - 5} more
											</li>
										)}
									</ul>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Unassigned warning */}
				{allocation.unassigned_students.length > 0 && (
					<Card className="border-red-300 bg-red-50">
						<CardContent className="pt-4 pb-3 px-4">
							<div className="flex items-start gap-2">
								<AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
								<div className="space-y-1">
									<p className="text-sm font-medium text-red-800">
										{allocation.unassigned_students.length} Learner{allocation.unassigned_students.length !== 1 ? 's' : ''} Not Seated
									</p>
									<p className="text-xs text-red-700">
										Not enough room capacity. Go back and add more rooms, or increase seat counts.
									</p>
									<div className="flex flex-wrap gap-1 mt-1">
										{allocation.unassigned_students.slice(0, 10).map((s) => (
											<Badge key={s.exam_registration_id} variant="destructive" className="text-xs">
												{s.stu_register_no}
											</Badge>
										))}
										{allocation.unassigned_students.length > 10 && (
											<Badge variant="destructive" className="text-xs">
												+{allocation.unassigned_students.length - 10} more
											</Badge>
										)}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Room grids — skip rooms with no seated students */}
				<div className="space-y-6">
					{allocation.rooms.filter(r => r.students_seated > 0).map((roomResult) => (
						<Card key={roomResult.room.id}>
							<CardContent className="pt-4 pb-4 px-4">
								<RoomGrid
									roomResult={roomResult}
									programColorMap={programColorMap}
								/>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		)
	}

	// --- Main render ---

	return (
		<div className="space-y-6">
			{step === 'idle' && renderIdle()}
			{step === 'summary' && renderSummary()}
			{step === 'rooms' && renderRooms()}
			{(step === 'generated' || step === 'saved') && renderGenerated()}
		</div>
	)
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}
