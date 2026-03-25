'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { Search, Loader2, UserPlus } from 'lucide-react'
import StudentInfoCard from './student-info-card'
import CourseSelectionTable from './course-selection-table'

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

interface Student {
	id: string
	name: string
	register_number: string
	program_code: string
	program_name: string
	photo_url: string | null
}

interface EligibleCourse {
	course_id: string
	course_code: string
	course_name: string
	semester: number
	internal_marks: number
	external_marks: number
	total_marks: number
	percentage: number
	letter_grade: string
	result: string
	attempt_number: number
	fee_amount: number
	is_eligible: boolean
	reason: string | null
	course_offering_id: string
	exam_registration_id: string
}

interface BulkApplicationFormProps {
	onSuccess: () => void
}

export default function BulkApplicationForm({ onSuccess }: BulkApplicationFormProps) {
	const { toast } = useToast()
	const { institutionId, isReady, filter } = useInstitutionFilter()

	// Form state
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [selectedSessionId, setSelectedSessionId] = useState('')
	const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null)
	const [registerNumber, setRegisterNumber] = useState('')

	// Student data
	const [student, setStudent] = useState<Student | null>(null)
	const [courses, setCourses] = useState<EligibleCourse[]>([])
	const [theoryCount, setTheoryCount] = useState(0)
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])

	// Loading states
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [searchingStudent, setSearchingStudent] = useState(false)
	const [adding, setAdding] = useState(false)

	// Fetch exam sessions
	useEffect(() => {
		if (!isReady || !institutionId) return

		const fetchSessions = async () => {
			setLoadingSessions(true)
			try {
				const response = await fetch(
					`/api/examination-sessions?institutions_id=${institutionId}`
				)
				if (response.ok) {
					const data = await response.json()
					setSessions(data)
				}
			} catch (error) {
				console.error('Failed to fetch sessions:', error)
			} finally {
				setLoadingSessions(false)
			}
		}

		fetchSessions()
	}, [isReady, institutionId])

	// Handle register number input (auto-uppercase)
	const handleRegisterNumberChange = (value: string) => {
		setRegisterNumber(value.toUpperCase())
	}

	// Search student
	const handleSearch = async () => {
		if (!registerNumber.trim()) {
			toast({
				title: '❌ Validation Error',
				description: 'Please enter a register number',
				variant: 'destructive',
			})
			return
		}

		if (!selectedSessionId) {
			toast({
				title: '❌ Validation Error',
				description: 'Please select an examination session',
				variant: 'destructive',
			})
			return
		}

		setSearchingStudent(true)
		setStudent(null)
		setCourses([])
		setSelectedCourses([])

		try {
			const response = await fetch(
				`/api/revaluation/student-eligibility?` +
					`register_number=${encodeURIComponent(registerNumber)}` +
					`&examination_session_id=${selectedSessionId}` +
					`&institutions_id=${institutionId}`
			)

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to fetch student')
			}

			const data = await response.json()

			setStudent(data.student)
			setCourses(data.eligible_courses)
			setTheoryCount(data.theory_subject_count)

			// Auto-select eligible courses
			const eligibleCourseIds = data.eligible_courses
				.filter((c: EligibleCourse) => c.is_eligible)
				.map((c: EligibleCourse) => c.course_id)
			setSelectedCourses(eligibleCourseIds)

			toast({
				title: '✅ Student Found',
				description: `Found ${data.theory_subject_count} eligible theory courses`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to fetch student',
				variant: 'destructive',
			})
		} finally {
			setSearchingStudent(false)
		}
	}

	// Calculate total fee
	const calculateTotalFee = () => {
		return courses
			.filter((c) => selectedCourses.includes(c.course_id))
			.reduce((sum, c) => sum + c.fee_amount, 0)
	}

	// Add to draft
	const handleAddToDraft = async () => {
		if (selectedCourses.length === 0) {
			toast({
				title: '❌ Validation Error',
				description: 'Please select at least one course',
				variant: 'destructive',
			})
			return
		}

		setAdding(true)

		try {
			const selectedCourseData = courses
				.filter((c) => selectedCourses.includes(c.course_id))
				.map((c) => ({
					course_id: c.course_id,
					course_code: c.course_code,
					course_name: c.course_name,
					attempt_number: c.attempt_number,
					fee_amount: c.fee_amount,
					course_offering_id: c.course_offering_id,
					exam_registration_id: c.exam_registration_id,
				}))

			const response = await fetch('/api/revaluation/draft-applications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					examination_session_id: selectedSessionId,
					institutions_id: institutionId,
					student_id: student?.id,
					student_register_number: student?.register_number,
					student_name: student?.name,
					program_code: student?.program_code,
					program_name: student?.program_name,
					session_code: selectedSession?.session_code,
					institution_code: filter?.institution_code,
					course_selections: selectedCourseData,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to add to draft')
			}

			const data = await response.json()

			toast({
				title: '✅ Added to Draft',
				description: data.message,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Clear form for next student
			setRegisterNumber('')
			setStudent(null)
			setCourses([])
			setSelectedCourses([])
			setTheoryCount(0)

			// Notify parent to refresh draft list
			onSuccess()
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to add to draft',
				variant: 'destructive',
			})
		} finally {
			setAdding(false)
		}
	}

	return (
		<div className="space-y-6">
			{/* Step 1: Session Selection */}
			<Card>
				<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
					<CardTitle className="text-blue-900">Step 1: Select Examination Session</CardTitle>
					<CardDescription className="text-blue-700">
						Choose the examination session for revaluation applications
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="space-y-2">
						<Label htmlFor="session">Examination Session *</Label>
						<Select
							value={selectedSessionId}
							onValueChange={(value) => {
								setSelectedSessionId(value)
								const session = sessions.find((s) => s.id === value)
								setSelectedSession(session || null)
								// Clear student data when session changes
								setRegisterNumber('')
								setStudent(null)
								setCourses([])
								setSelectedCourses([])
							}}
							disabled={loadingSessions}
						>
							<SelectTrigger id="session" className="w-full">
								<SelectValue placeholder={loadingSessions ? 'Loading...' : 'Select session'} />
							</SelectTrigger>
							<SelectContent>
								{sessions.map((session) => (
									<SelectItem key={session.id} value={session.id}>
										{session.session_code} - {session.session_name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>

			{/* Step 2: Student Search */}
			<Card>
				<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
					<CardTitle className="text-blue-900">Step 2: Search Student</CardTitle>
					<CardDescription className="text-blue-700">
						Enter student register number (will auto-convert to uppercase)
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="flex gap-3">
						<div className="flex-1">
							<Label htmlFor="register-number">Register Number *</Label>
							<Input
								id="register-number"
								placeholder="e.g., ABC123"
								value={registerNumber}
								onChange={(e) => handleRegisterNumberChange(e.target.value)}
								disabled={!selectedSessionId || searchingStudent}
								className="uppercase"
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										handleSearch()
									}
								}}
							/>
						</div>
						<div className="flex items-end">
							<Button
								onClick={handleSearch}
								disabled={!selectedSessionId || !registerNumber || searchingStudent}
							>
								{searchingStudent ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Searching...
									</>
								) : (
									<>
										<Search className="mr-2 h-4 w-4" />
										Search
									</>
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Student Information & Course Selection */}
			{student && (
				<div className="space-y-6">
					{/* Student Info Card */}
					<StudentInfoCard
						student={student}
						sessionCode={selectedSession?.session_code}
						theorySubjectCount={theoryCount}
					/>

					{/* Course Selection */}
					<Card>
						<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
							<CardTitle className="text-blue-900">Step 3: Select Courses for Revaluation</CardTitle>
							<CardDescription className="text-blue-700">
								Select theory courses to apply for revaluation
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-6">
							<CourseSelectionTable
								courses={courses}
								selectedCourses={selectedCourses}
								onSelectionChange={setSelectedCourses}
								totalFee={calculateTotalFee()}
							/>

							{/* Add to Draft Button */}
							<div className="flex justify-end mt-6">
								<Button
									size="lg"
									onClick={handleAddToDraft}
									disabled={selectedCourses.length === 0 || adding}
									className="bg-blue-600 hover:bg-blue-700"
								>
									{adding ? (
										<>
											<Loader2 className="mr-2 h-5 w-5 animate-spin" />
											Adding...
										</>
									) : (
										<>
											<UserPlus className="mr-2 h-5 w-5" />
											Add to Draft
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	)
}
