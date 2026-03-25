'use client'

import { useEffect, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { Loader2, AlertCircle, Check, ChevronsUpDown, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RevaluationRegistration } from '@/types/revaluation'

interface RevaluationApplicationDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess: () => void
	editData?: RevaluationRegistration | null
}

export default function RevaluationApplicationDialog({
	open,
	onOpenChange,
	onSuccess,
	editData,
}: RevaluationApplicationDialogProps) {
	const { toast } = useToast()
	const { filter, isReady, appendToUrl, getInstitutionIdForCreate } = useInstitutionFilter()

	const [loading, setLoading] = useState(false)
	const [searchingStudent, setSearchingStudent] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [formData, setFormData] = useState({
		examination_session_id: '',
		register_number: '',
		exam_registration_id: '',
		selected_course_ids: [] as string[],
		reason_for_revaluation: '',
		payment_transaction_id: '',
		payment_date: '',
		payment_amount: '',
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Dropdowns data
	const [sessions, setSessions] = useState<any[]>([])
	const [studentInfo, setStudentInfo] = useState<any>(null)
	const [availableCourses, setAvailableCourses] = useState<any[]>([])

	const MAX_COURSES_PER_APPLICATION = 5

	useEffect(() => {
		if (open && isReady) {
			fetchSessions()
		}
	}, [open, isReady, filter])

	useEffect(() => {
		// When both session and register number are provided, fetch student data
		if (formData.examination_session_id && formData.register_number.trim()) {
			const debounceTimer = setTimeout(() => {
				fetchStudentData()
			}, 500) // Debounce for 500ms
			return () => clearTimeout(debounceTimer)
		} else {
			// Clear student data if inputs are cleared
			setStudentInfo(null)
			setAvailableCourses([])
		}
	}, [formData.examination_session_id, formData.register_number])

	const fetchSessions = async () => {
		try {
			const url = appendToUrl('/api/exam-management/examination-sessions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch sessions')

			const data = await response.json()
			setSessions(data || [])
		} catch (error) {
			console.error('Fetch sessions error:', error)
			toast({
				title: '❌ Failed to fetch sessions',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		}
	}

	const fetchStudentData = async () => {
		if (!formData.examination_session_id || !formData.register_number.trim()) return

		setSearchingStudent(true)
		try {
			// Fetch student's exam registration
			const examRegUrl = `/api/exam-management/exam-registrations?examination_session_id=${formData.examination_session_id}&register_number=${formData.register_number}`
			const examRegResponse = await fetch(examRegUrl)

			if (!examRegResponse.ok) {
				throw new Error('Failed to fetch student registration')
			}

			const examRegistrations = await examRegResponse.json()
			if (!examRegistrations || examRegistrations.length === 0) {
				throw new Error('Student not registered for this examination session')
			}

			const examReg = examRegistrations[0]
			setStudentInfo({
				student_name: examReg.student_name || examReg.learner_name,
				register_number: examReg.register_number,
				program_name: examReg.program_name,
			})

			setFormData((prev) => ({ ...prev, exam_registration_id: examReg.id }))

			// Fetch eligible courses from final_marks
			await fetchEligibleCourses(examReg.id)
		} catch (error) {
			console.error('Fetch student error:', error)
			setStudentInfo(null)
			setAvailableCourses([])
			setFormData((prev) => ({ ...prev, exam_registration_id: '', selected_course_ids: [] }))

			toast({
				title: '❌ Student Not Found',
				description: error instanceof Error ? error.message : 'Could not find student registration',
				variant: 'destructive',
			})
		} finally {
			setSearchingStudent(false)
		}
	}

	const fetchEligibleCourses = async (examRegistrationId: string) => {
		try {
			// Fetch final marks for this exam registration
			const finalMarksUrl = `/api/grading/final-marks?exam_registration_id=${examRegistrationId}`
			const response = await fetch(finalMarksUrl)

			if (!response.ok) {
				throw new Error('Failed to fetch student results')
			}

			const finalMarks = await response.json()

			// Check existing revaluation attempts for each course
			const coursesWithEligibility = await Promise.all(
				finalMarks.map(async (fm: any) => {
					// Check revaluation attempts
					const revalResponse = await fetch(
						`/api/revaluation/registrations?exam_registration_id=${examRegistrationId}&course_id=${fm.course_id}`
					)
					const existingRevals = await revalResponse.json()

					// Filter out completed or in-progress revaluations
					const activeRevals = existingRevals.filter(
						(r: any) => r.status !== 'Published' && r.status !== 'Cancelled'
					)

					// Determine eligibility
					const isPublished = fm.result_status === 'Published'
					const isNotLocked = fm.is_locked !== true // Results must not be locked (feature locked status)
					// Exclude practical/lab courses - allow all other course types
					const practicalTypes = ['practical', 'lab', 'laboratory', 'workshop']
					const isNotPractical = !practicalTypes.some(pt =>
						fm.course_type?.toLowerCase().includes(pt)
					)
					const isNotAbsent = fm.attendance_status !== 'Absent' && fm.total_marks_obtained != null // Not absent
					const hasNotReachedMaxAttempts = existingRevals.length < 3
					const hasNoActiveReval = activeRevals.length === 0

					return {
						...fm,
						existing_attempts: existingRevals.length,
						has_active_reval: activeRevals.length > 0,
						is_eligible:
							isPublished && isNotLocked && isNotPractical && isNotAbsent && hasNotReachedMaxAttempts && hasNoActiveReval,
						ineligible_reason: !isPublished
							? 'Result not published'
							: !isNotLocked
								? 'Results locked - revaluation period closed'
								: !isNotPractical
									? 'Practical/Lab courses not eligible for revaluation'
									: !isNotAbsent
										? 'Absent in examination'
										: !hasNotReachedMaxAttempts
											? 'Maximum 3 attempts reached'
											: activeRevals.length > 0
												? 'Active revaluation in progress'
												: '',
					}
				})
			)

			const eligibleCourses = coursesWithEligibility.filter((c) => c.is_eligible)
			setAvailableCourses(eligibleCourses)

			if (eligibleCourses.length === 0) {
				toast({
					title: '⚠️ No Eligible Courses',
					description: 'No courses available for revaluation. Check result status and course eligibility.',
					variant: 'destructive',
				})
			}
		} catch (error) {
			console.error('Fetch eligible courses error:', error)
			setAvailableCourses([])
			toast({
				title: '❌ Failed to fetch courses',
				description: error instanceof Error ? error.message : 'Could not load student courses',
				variant: 'destructive',
			})
		}
	}

	const handleCourseToggle = (courseId: string, checked: boolean) => {
		setFormData((prev) => {
			if (checked) {
				if (prev.selected_course_ids.length >= MAX_COURSES_PER_APPLICATION) {
					toast({
						title: '⚠️ Maximum Courses Reached',
						description: `You can only select up to ${MAX_COURSES_PER_APPLICATION} courses per application`,
						variant: 'destructive',
					})
					return prev
				}
				return {
					...prev,
					selected_course_ids: [...prev.selected_course_ids, courseId],
				}
			} else {
				return {
					...prev,
					selected_course_ids: prev.selected_course_ids.filter((id) => id !== courseId),
				}
			}
		})
	}

	const validate = () => {
		const newErrors: Record<string, string> = {}

		if (!formData.examination_session_id) newErrors.examination_session_id = 'Session is required'
		if (!formData.register_number.trim()) newErrors.register_number = 'Register number is required'
		if (!formData.exam_registration_id) newErrors.exam_registration_id = 'Student not found'
		if (formData.selected_course_ids.length === 0)
			newErrors.selected_course_ids = 'Select at least one course'
		if (!formData.payment_transaction_id.trim())
			newErrors.payment_transaction_id = 'Transaction ID is required'
		if (!formData.payment_date) newErrors.payment_date = 'Payment date is required'
		if (!formData.payment_amount) newErrors.payment_amount = 'Payment amount is required'

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	const handleSubmit = async () => {
		if (!validate()) return

		setLoading(true)
		try {
			const institutionId = getInstitutionIdForCreate()

			// Calculate fee per course
			const feeResponse = await fetch(
				`/api/revaluation/fee-config?institutions_id=${institutionId}`
			)
			const feeData = await feeResponse.json()
			const feePerCourse = feeData[0]?.fee_per_course || 0

			const payload = {
				institutions_id: institutionId,
				examination_session_id: formData.examination_session_id,
				exam_registration_id: formData.exam_registration_id,
				course_ids: formData.selected_course_ids,
				reason_for_revaluation: formData.reason_for_revaluation || null,
				payment_transaction_id: formData.payment_transaction_id,
				payment_date: formData.payment_date,
				payment_amount: parseFloat(formData.payment_amount),
			}

			const response = await fetch('/api/revaluation/registrations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to submit application')
			}

			toast({
				title: '✅ Application Submitted',
				description: `Successfully submitted revaluation for ${formData.selected_course_ids.length} course(s)`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			resetForm()
			onSuccess()
			onOpenChange(false)
		} catch (error) {
			console.error('Submit error:', error)
			toast({
				title: '❌ Submission Failed',
				description: error instanceof Error ? error.message : 'Could not submit application',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const resetForm = () => {
		setFormData({
			examination_session_id: '',
			register_number: '',
			exam_registration_id: '',
			selected_course_ids: [],
			reason_for_revaluation: '',
			payment_transaction_id: '',
			payment_date: '',
			payment_amount: '',
		})
		setErrors({})
		setStudentInfo(null)
		setAvailableCourses([])
	}

	const selectedSession = sessions.find((s) => s.id === formData.examination_session_id)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">New Revaluation Application</DialogTitle>
					<DialogDescription className="text-xs">
						Apply for revaluation of theory courses (maximum {MAX_COURSES_PER_APPLICATION} courses per
						application)
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Examination Session */}
					<div className="space-y-2">
						<Label className="text-xs font-medium">
							Examination Session <span className="text-red-500">*</span>
						</Label>
						<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									role="combobox"
									className="h-9 w-full justify-between text-xs"
								>
									<span className="truncate">
										{selectedSession
											? `${selectedSession.session_name} (${selectedSession.session_type || ''})`
											: 'Select examination session'}
									</span>
									<ChevronsUpDown className="h-3 w-3 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-[600px] p-0" align="start">
								<Command
									filter={(value, search) => {
										if (value.toLowerCase().includes(search.toLowerCase())) return 1
										return 0
									}}
								>
									<CommandInput placeholder="Search session..." className="h-8 text-xs" />
									<CommandList>
										<CommandEmpty className="text-xs py-2">No session found.</CommandEmpty>
										<CommandGroup>
											{sessions.map((session) => (
												<CommandItem
													key={session.id}
													value={`${session.session_name} ${session.session_type || ''}`}
													onSelect={() => {
														setFormData((prev) => ({
															...prev,
															examination_session_id: session.id,
															register_number: '',
															exam_registration_id: '',
															selected_course_ids: [],
														}))
														setStudentInfo(null)
														setAvailableCourses([])
														setSessionOpen(false)
													}}
													className="text-xs"
												>
													<Check
														className={cn(
															'mr-2 h-3 w-3',
															formData.examination_session_id === session.id
																? 'opacity-100'
																: 'opacity-0'
														)}
													/>
													{session.session_name}
													{session.session_type && ` (${session.session_type})`}
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
						{errors.examination_session_id && (
							<p className="text-xs text-red-600">{errors.examination_session_id}</p>
						)}
					</div>

					{/* Register Number */}
					{formData.examination_session_id && (
						<div className="space-y-2">
							<Label htmlFor="register-number" className="text-xs font-medium">
								Register Number <span className="text-red-500">*</span>
							</Label>
							<div className="relative">
								<Input
									id="register-number"
									placeholder="Enter student register number"
									value={formData.register_number}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											register_number: e.target.value.toUpperCase(),
											exam_registration_id: '',
											selected_course_ids: [],
										}))
									}
									className={cn('h-9 text-xs', errors.register_number && 'border-red-500')}
									disabled={loading || searchingStudent}
								/>
								{searchingStudent && (
									<div className="absolute right-3 top-1/2 -translate-y-1/2">
										<Loader2 className="h-4 w-4 animate-spin text-blue-600" />
									</div>
								)}
							</div>
							{errors.register_number && (
								<p className="text-xs text-red-600">{errors.register_number}</p>
							)}
						</div>
					)}

					{/* Student Info */}
					{studentInfo && (
						<div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
							<h4 className="text-xs font-semibold text-blue-900 mb-2">Student Information</h4>
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div>
									<span className="text-blue-700">Name:</span>{' '}
									<span className="font-medium text-blue-900">{studentInfo.student_name}</span>
								</div>
								<div>
									<span className="text-blue-700">Register No:</span>{' '}
									<span className="font-medium text-blue-900">{studentInfo.register_number}</span>
								</div>
								{studentInfo.program_name && (
									<div className="col-span-2">
										<span className="text-blue-700">Program:</span>{' '}
										<span className="font-medium text-blue-900">{studentInfo.program_name}</span>
									</div>
								)}
							</div>
						</div>
					)}

					{/* No Eligible Courses Message */}
					{availableCourses.length === 0 && formData.exam_registration_id && !searchingStudent && (
						<div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
							<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
							<div>
								<p className="font-medium">No eligible courses available for revaluation.</p>
								<p className="mt-1 text-xs">
									Courses must be: Published results (not locked), Theory papers only, Not absent, and have less
									than 3 revaluation attempts.
								</p>
							</div>
						</div>
					)}

					{/* Course Selection */}
					{availableCourses.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label className="text-xs font-medium">
									Select Courses for Revaluation <span className="text-red-500">*</span>
								</Label>
								<Badge
									variant="outline"
									className={cn(
										'text-xs',
										formData.selected_course_ids.length >= MAX_COURSES_PER_APPLICATION &&
											'bg-amber-50 text-amber-700 border-amber-300'
									)}
								>
									{formData.selected_course_ids.length} / {MAX_COURSES_PER_APPLICATION} selected
								</Badge>
							</div>
							<div className="border rounded-lg p-3 space-y-2 max-h-[300px] overflow-y-auto">
								{availableCourses.map((course) => (
									<div
										key={course.course_id}
										className="flex items-start space-x-3 p-2 border rounded-lg hover:bg-gray-50 transition-colors"
									>
										<Checkbox
											id={`course-${course.course_id}`}
											checked={formData.selected_course_ids.includes(course.course_id)}
											onCheckedChange={(checked) =>
												handleCourseToggle(course.course_id, checked as boolean)
											}
											className="mt-1"
										/>
										<div className="flex-1 min-w-0 space-y-1">
											<label
												htmlFor={`course-${course.course_id}`}
												className="text-xs font-medium cursor-pointer block"
											>
												{course.courses?.course_code || course.course_code} -{' '}
												{course.courses?.course_name || course.course_name}
											</label>
											<div className="flex items-center gap-2 flex-wrap">
												<Badge variant="outline" className="text-xs">
													{course.letter_grade || course.grade || 'N/A'}
												</Badge>
												<span className="text-xs text-gray-600">
													{course.total_marks_obtained || 0} / {course.total_marks_maximum || 0} (
													{course.percentage?.toFixed(2) || 0}%)
												</span>
												{course.is_pass ? (
													<Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
														<CheckCircle className="h-3 w-3 mr-1" />
														Pass
													</Badge>
												) : (
													<Badge className="bg-red-100 text-red-800 border-red-300 text-xs">
														<XCircle className="h-3 w-3 mr-1" />
														Fail
													</Badge>
												)}
												{course.existing_attempts > 0 && (
													<Badge variant="outline" className="text-xs">
														Attempt {course.existing_attempts + 1}
													</Badge>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
							{errors.selected_course_ids && (
								<p className="text-xs text-red-600">{errors.selected_course_ids}</p>
							)}
						</div>
					)}

					{/* Reason */}
					<div className="space-y-2">
						<Label htmlFor="reason" className="text-xs font-medium">
							Reason for Revaluation (Optional)
						</Label>
						<Textarea
							id="reason"
							placeholder="Enter reason for requesting revaluation..."
							value={formData.reason_for_revaluation}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, reason_for_revaluation: e.target.value }))
							}
							rows={2}
							className="text-xs"
						/>
					</div>

					{/* Payment Details */}
					<div className="space-y-3 border-t pt-3">
						<h3 className="text-xs font-semibold text-gray-900">Payment Information</h3>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="transaction" className="text-xs font-medium">
									Transaction ID <span className="text-red-500">*</span>
								</Label>
								<Input
									id="transaction"
									placeholder="Payment transaction ID"
									value={formData.payment_transaction_id}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, payment_transaction_id: e.target.value }))
									}
									className={cn('h-9 text-xs', errors.payment_transaction_id && 'border-red-500')}
								/>
								{errors.payment_transaction_id && (
									<p className="text-xs text-red-600">{errors.payment_transaction_id}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="payment-date" className="text-xs font-medium">
									Payment Date <span className="text-red-500">*</span>
								</Label>
								<Input
									id="payment-date"
									type="date"
									value={formData.payment_date}
									onChange={(e) => setFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
									className={cn('h-9 text-xs', errors.payment_date && 'border-red-500')}
								/>
								{errors.payment_date && <p className="text-xs text-red-600">{errors.payment_date}</p>}
							</div>

							<div className="space-y-2 col-span-2">
								<Label htmlFor="payment-amount" className="text-xs font-medium">
									Payment Amount (₹) <span className="text-red-500">*</span>
								</Label>
								<Input
									id="payment-amount"
									type="number"
									step="0.01"
									placeholder="0.00"
									value={formData.payment_amount}
									onChange={(e) => setFormData((prev) => ({ ...prev, payment_amount: e.target.value }))}
									className={cn('h-9 text-xs', errors.payment_amount && 'border-red-500')}
								/>
								{errors.payment_amount && (
									<p className="text-xs text-red-600">{errors.payment_amount}</p>
								)}
							</div>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							resetForm()
							onOpenChange(false)
						}}
						disabled={loading}
						className="h-9 text-xs"
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading} className="h-9 text-xs bg-blue-600 hover:bg-blue-700">
						{loading ? (
							<>
								<Loader2 className="h-3 w-3 mr-2 animate-spin" />
								Submitting...
							</>
						) : (
							'Submit Application'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
