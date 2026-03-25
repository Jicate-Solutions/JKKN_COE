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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	ChevronRight,
	ChevronDown,
	Edit,
	X,
	CheckCircle,
	Loader2,
	AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Course {
	id: string
	course_id: string
	course_code: string
	course_title: string
	attempt_number: number
	fee_amount: number
}

interface DraftStudent {
	student_id: string
	student_register_number: string
	student_name: string
	program_code: string
	courses: Course[]
	total_fee: number
}

interface DraftRegistrationsListProps {
	examinationSessionId: string
	onRefresh: () => void
	triggerRefresh: number
}

export default function DraftRegistrationsList({
	examinationSessionId,
	onRefresh,
	triggerRefresh,
}: DraftRegistrationsListProps) {
	const { toast } = useToast()
	const { institutionId, isReady } = useInstitutionFilter()

	// Data state
	const [students, setStudents] = useState<DraftStudent[]>([])
	const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set())

	// Filter state
	const [searchQuery, setSearchQuery] = useState('')
	const [programFilter, setProgramFilter] = useState('all')
	const [programs, setPrograms] = useState<string[]>([])

	// Pagination state
	const [currentPage, setCurrentPage] = useState(1)
	const [totalPages, setTotalPages] = useState(1)
	const [totalCount, setTotalCount] = useState(0)
	const [summary, setSummary] = useState({ total_students: 0, total_courses: 0, total_fees: 0 })

	// Loading states
	const [loading, setLoading] = useState(false)
	const [removing, setRemoving] = useState<string | null>(null)
	const [finalizing, setFinalizing] = useState(false)

	// Dialog state
	const [showFinalizeDialog, setShowFinalizeDialog] = useState(false)

	const pageSize = 20

	// Fetch drafts
	const fetchDrafts = async () => {
		if (!examinationSessionId || !institutionId) return

		setLoading(true)
		try {
			const params = new URLSearchParams({
				examination_session_id: examinationSessionId,
				institutions_id: institutionId,
				page: currentPage.toString(),
				page_size: pageSize.toString(),
			})

			if (programFilter && programFilter !== 'all') {
				params.append('program_code', programFilter)
			}

			if (searchQuery.trim()) {
				params.append('search', searchQuery.trim())
			}

			const response = await fetch(`/api/revaluation/draft-applications?${params}`)

			if (response.ok) {
				const data = await response.json()
				setStudents(data.students || [])
				setTotalPages(data.pagination?.total_pages || 1)
				setTotalCount(data.pagination?.total || 0)
				setSummary(data.summary || { total_students: 0, total_courses: 0, total_fees: 0 })

				// Extract unique programs
				const uniquePrograms = Array.from(
					new Set(data.students.map((s: DraftStudent) => s.program_code).filter(Boolean))
				).sort()
				setPrograms(uniquePrograms)
			}
		} catch (error) {
			console.error('Failed to fetch drafts:', error)
		} finally {
			setLoading(false)
		}
	}

	// Fetch on mount and when filters/page change
	useEffect(() => {
		if (isReady) {
			fetchDrafts()
		}
	}, [isReady, examinationSessionId, institutionId, currentPage, programFilter, searchQuery, triggerRefresh])

	// Toggle expand/collapse
	const toggleExpand = (studentId: string) => {
		const newExpanded = new Set(expandedStudents)
		if (newExpanded.has(studentId)) {
			newExpanded.delete(studentId)
		} else {
			newExpanded.add(studentId)
		}
		setExpandedStudents(newExpanded)
	}

	// Remove student from draft
	const handleRemove = async (student: DraftStudent) => {
		setRemoving(student.student_id)
		try {
			const response = await fetch(
				`/api/revaluation/draft-applications?` +
					`student_id=${student.student_id}&` +
					`examination_session_id=${examinationSessionId}`,
				{ method: 'DELETE' }
			)

			if (!response.ok) {
				throw new Error('Failed to remove')
			}

			toast({
				title: '✅ Removed',
				description: `Removed ${student.student_register_number} from draft`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			fetchDrafts()
			onRefresh()
		} catch (error) {
			toast({
				title: '❌ Error',
				description: 'Failed to remove student from draft',
				variant: 'destructive',
			})
		} finally {
			setRemoving(null)
		}
	}

	// Finalize all drafts
	const handleFinalize = async () => {
		setFinalizing(true)
		try {
			const response = await fetch('/api/revaluation/draft-applications/finalize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					examination_session_id: examinationSessionId,
					institutions_id: institutionId,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to finalize')
			}

			const data = await response.json()

			toast({
				title: '✅ Finalized',
				description: data.message,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			setShowFinalizeDialog(false)
			fetchDrafts()
			onRefresh()
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to finalize registrations',
				variant: 'destructive',
			})
		} finally {
			setFinalizing(false)
		}
	}

	// Pagination controls
	const goToPage = (page: number) => {
		if (page >= 1 && page <= totalPages) {
			setCurrentPage(page)
		}
	}

	const renderPagination = () => {
		const pages = []
		const maxVisiblePages = 7
		let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
		let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

		if (endPage - startPage < maxVisiblePages - 1) {
			startPage = Math.max(1, endPage - maxVisiblePages + 1)
		}

		for (let i = startPage; i <= endPage; i++) {
			pages.push(
				<Button
					key={i}
					variant={i === currentPage ? 'default' : 'outline'}
					size="sm"
					onClick={() => goToPage(i)}
					className={i === currentPage ? 'bg-blue-600' : ''}
				>
					{i}
				</Button>
			)
		}

		return pages
	}

	if (!examinationSessionId) {
		return (
			<Card>
				<CardContent className="py-12 text-center text-gray-500">
					Please select an examination session to view draft registrations
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{/* Header with Filters */}
			<Card>
				<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-blue-900">Draft Registrations</CardTitle>
							<CardDescription className="text-blue-700">
								Review and manage draft revaluation applications
							</CardDescription>
						</div>
						<Button
							size="lg"
							onClick={() => setShowFinalizeDialog(true)}
							disabled={students.length === 0 || finalizing}
							className="bg-green-600 hover:bg-green-700"
						>
							<CheckCircle className="mr-2 h-5 w-5" />
							Finalize All {totalCount > 0 && `(${totalCount})`}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="pt-6">
					{/* Filters Row */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						{/* Search */}
						<div className="space-y-2">
							<Label>Search by Register Number or Name</Label>
							<Input
								placeholder="Type to search..."
								value={searchQuery}
								onChange={(e) => {
									setSearchQuery(e.target.value)
									setCurrentPage(1) // Reset to first page
								}}
							/>
						</div>

						{/* Program Filter */}
						<div className="space-y-2">
							<Label>Filter by Program</Label>
							<Select
								value={programFilter}
								onValueChange={(value) => {
									setProgramFilter(value)
									setCurrentPage(1) // Reset to first page
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Programs</SelectItem>
									{programs.map((program) => (
										<SelectItem key={program} value={program}>
											{program}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Summary Statistics */}
					<div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
						<div className="text-center">
							<p className="text-sm text-blue-700 font-medium">Total Students</p>
							<p className="text-2xl font-bold text-blue-900">{summary.total_students}</p>
						</div>
						<div className="text-center">
							<p className="text-sm text-blue-700 font-medium">Total Courses</p>
							<p className="text-2xl font-bold text-blue-900">{summary.total_courses}</p>
						</div>
						<div className="text-center">
							<p className="text-sm text-blue-700 font-medium">Total Fees</p>
							<p className="text-2xl font-bold text-blue-900">₹{summary.total_fees.toFixed(2)}</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Students List */}
			<Card>
				<CardContent className="pt-6">
					{loading ? (
						<div className="text-center py-12">
							<Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
							<p className="mt-4 text-gray-600">Loading draft registrations...</p>
						</div>
					) : students.length === 0 ? (
						<div className="text-center py-12 text-gray-500">
							<p className="text-lg font-medium">No draft registrations found</p>
							<p className="text-sm mt-2">Add students using the form above</p>
						</div>
					) : (
						<div className="space-y-3">
							{students.map((student) => {
								const isExpanded = expandedStudents.has(student.student_id)
								const isRemoving = removing === student.student_id

								return (
									<div
										key={student.student_id}
										className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
									>
										{/* Student Header */}
										<div className="flex items-center justify-between">
											<div
												className="flex items-center gap-3 flex-1 cursor-pointer"
												onClick={() => toggleExpand(student.student_id)}
											>
												{/* Expand/Collapse Icon */}
												{isExpanded ? (
													<ChevronDown className="h-5 w-5 text-gray-600" />
												) : (
													<ChevronRight className="h-5 w-5 text-gray-600" />
												)}

												{/* Student Info */}
												<div className="flex-1">
													<p className="font-semibold text-gray-900">
														{student.student_register_number} - {student.student_name}
													</p>
													<div className="flex items-center gap-3 mt-1">
														<Badge variant="outline" className="text-xs">
															{student.program_code}
														</Badge>
														<span className="text-sm text-gray-600">
															{student.courses.length} course{student.courses.length !== 1 ? 's' : ''}
														</span>
														<span className="text-sm font-medium text-blue-600">
															₹{student.total_fee.toFixed(2)}
														</span>
													</div>
												</div>
											</div>

											{/* Actions */}
											<div className="flex items-center gap-2">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														/* TODO: Implement edit */
													}}
													className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
												>
													<Edit className="h-4 w-4 mr-1" />
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleRemove(student)}
													disabled={isRemoving}
													className="text-red-600 hover:text-red-700 hover:bg-red-50"
												>
													{isRemoving ? (
														<Loader2 className="h-4 w-4 mr-1 animate-spin" />
													) : (
														<X className="h-4 w-4 mr-1" />
													)}
													Remove
												</Button>
											</div>
										</div>

										{/* Expanded Course Details */}
										{isExpanded && (
											<div className="mt-4 ml-8 space-y-2 border-t pt-4">
												{student.courses.map((course) => (
													<div
														key={course.id}
														className="flex items-center justify-between p-3 bg-gray-50 rounded"
													>
														<div className="flex-1">
															<p className="font-medium text-gray-900">
																{course.course_code} - {course.course_title}
															</p>
														</div>
														<div className="text-right">
															<p className="text-sm font-medium">₹{course.fee_amount.toFixed(2)}</p>
															<p className="text-xs text-gray-500">Attempt {course.attempt_number}</p>
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex items-center justify-between mt-6 pt-6 border-t">
							<p className="text-sm text-gray-600">
								Showing {(currentPage - 1) * pageSize + 1} to{' '}
								{Math.min(currentPage * pageSize, totalCount)} of {totalCount} students
							</p>

							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => goToPage(currentPage - 1)}
									disabled={currentPage === 1}
								>
									Previous
								</Button>

								{renderPagination()}

								<Button
									variant="outline"
									size="sm"
									onClick={() => goToPage(currentPage + 1)}
									disabled={currentPage === totalPages}
								>
									Next
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Finalize Confirmation Dialog */}
			<AlertDialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-amber-600" />
							Finalize Revaluation Registrations
						</AlertDialogTitle>
						<AlertDialogDescription className="space-y-4">
							<p>You are about to finalize:</p>
							<div className="p-4 bg-blue-50 border border-blue-200 rounded space-y-2">
								<p className="font-semibold">• {summary.total_students} students</p>
								<p className="font-semibold">• {summary.total_courses} course revaluations</p>
								<p className="font-semibold">• Total fees: ₹{summary.total_fees.toFixed(2)}</p>
							</div>
							<div className="p-4 bg-amber-50 border border-amber-200 rounded space-y-2">
								<p className="font-semibold text-amber-900">After finalization:</p>
								<p className="text-sm text-amber-800">✓ Status changes to 'Payment Pending'</p>
								<p className="text-sm text-amber-800">✓ Registrations cannot be edited</p>
								<p className="text-sm text-amber-800">✓ Students will appear in Applications tab</p>
							</div>
							<p className="font-semibold">Continue?</p>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={finalizing}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleFinalize}
							disabled={finalizing}
							className="bg-green-600 hover:bg-green-700"
						>
							{finalizing ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Finalizing...
								</>
							) : (
								'Finalize All'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
