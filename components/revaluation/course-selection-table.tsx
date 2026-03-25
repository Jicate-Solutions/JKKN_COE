'use client'

import { useState, useEffect } from 'react'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'

interface Course {
	course_id: string
	course_code: string
	course_name: string
	semester: number
	internal_marks: number
	external_marks: number
	total_marks: number
	result: string
	attempt_number: number
	fee_amount: number
	is_eligible: boolean
	reason: string | null
	course_offering_id: string
	exam_registration_id: string
}

interface CourseSelectionTableProps {
	courses: Course[]
	selectedCourses: string[]
	onSelectionChange: (courseIds: string[]) => void
	totalFee: number
}

export default function CourseSelectionTable({
	courses,
	selectedCourses,
	onSelectionChange,
	totalFee,
}: CourseSelectionTableProps) {
	const [selected, setSelected] = useState<Set<string>>(new Set(selectedCourses))

	useEffect(() => {
		setSelected(new Set(selectedCourses))
	}, [selectedCourses])

	const handleCheckboxChange = (courseId: string, isEligible: boolean) => {
		if (!isEligible) return

		const newSelected = new Set(selected)
		if (newSelected.has(courseId)) {
			newSelected.delete(courseId)
		} else {
			newSelected.add(courseId)
		}

		setSelected(newSelected)
		onSelectionChange(Array.from(newSelected))
	}

	const formatMarks = (marks: number) => {
		return marks != null ? marks.toFixed(0) : '-'
	}

	return (
		<div className="space-y-4">
			{/* Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							<TableHead className="w-12"></TableHead>
							<TableHead className="font-semibold">Course Code - Name</TableHead>
							<TableHead className="text-center font-semibold w-16">SEM</TableHead>
							<TableHead className="text-center font-semibold w-16">INT</TableHead>
							<TableHead className="text-center font-semibold w-16">EXT</TableHead>
							<TableHead className="text-center font-semibold w-16">TOT</TableHead>
							<TableHead className="text-center font-semibold w-24">RESULT</TableHead>
							<TableHead className="text-right font-semibold w-24">Fee</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{courses.length === 0 ? (
							<TableRow>
								<TableCell colSpan={8} className="text-center py-8 text-gray-500">
									No eligible courses found
								</TableCell>
							</TableRow>
						) : (
							courses.map((course) => (
								<TableRow
									key={course.course_id}
									className={
										!course.is_eligible
											? 'bg-gray-50 opacity-60'
											: selected.has(course.course_id)
												? 'bg-blue-50'
												: 'hover:bg-gray-50'
									}
								>
									{/* Checkbox */}
									<TableCell>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex items-center justify-center">
														<Checkbox
															checked={selected.has(course.course_id)}
															disabled={!course.is_eligible}
															onCheckedChange={() =>
																handleCheckboxChange(course.course_id, course.is_eligible)
															}
														/>
													</div>
												</TooltipTrigger>
												{!course.is_eligible && course.reason && (
													<TooltipContent>
														<div className="flex items-center gap-2">
															<AlertCircle className="h-4 w-4" />
															<span>{course.reason}</span>
														</div>
													</TooltipContent>
												)}
											</Tooltip>
										</TooltipProvider>
									</TableCell>

									{/* Course Code - Name */}
									<TableCell>
										<div className="space-y-1">
											<p className="font-medium text-gray-900">
												{course.course_code} - {course.course_name}
											</p>
											{!course.is_eligible && course.reason && (
												<p className="text-xs text-red-600 flex items-center gap-1">
													<AlertCircle className="h-3 w-3" />
													{course.reason}
												</p>
											)}
										</div>
									</TableCell>

									{/* Semester */}
									<TableCell className="text-center">{course.semester}</TableCell>

									{/* Internal Marks */}
									<TableCell className="text-center">{formatMarks(course.internal_marks)}</TableCell>

									{/* External Marks */}
									<TableCell className="text-center">{formatMarks(course.external_marks)}</TableCell>

									{/* Total Marks */}
									<TableCell className="text-center font-medium">
										{formatMarks(course.total_marks)}
									</TableCell>

									{/* Result */}
									<TableCell className="text-center">
										<Badge
											variant={course.result === 'Pass' ? 'default' : 'destructive'}
											className={
												course.result === 'Pass'
													? 'bg-green-100 text-green-800 hover:bg-green-200'
													: 'bg-red-100 text-red-800 hover:bg-red-200'
											}
										>
											{course.result}
										</Badge>
									</TableCell>

									{/* Fee */}
									<TableCell className="text-right">
										<span className="text-sm font-medium">
											₹{course.fee_amount.toFixed(2)}
										</span>
										<p className="text-xs text-gray-500">Attempt {course.attempt_number}</p>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Summary */}
			{courses.length > 0 && (
				<div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="text-sm">
						<span className="font-semibold text-blue-900">Selected Courses:</span>{' '}
						<span className="text-blue-700">{selected.size}</span>
					</div>
					<div className="text-sm">
						<span className="font-semibold text-blue-900">Total Fee:</span>{' '}
						<span className="text-lg font-bold text-blue-700">₹{totalFee.toFixed(2)}</span>
					</div>
				</div>
			)}
		</div>
	)
}
