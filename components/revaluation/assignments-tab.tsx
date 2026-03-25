'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useAuth } from '@/context/auth-context'
import { UserPlus, RefreshCw, CheckCircle } from 'lucide-react'
import type { RevaluationRegistration } from '@/types/revaluation'
import RevaluationStatusBadge from './revaluation-status-badge'

export default function AssignmentsTab() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const { filter, isReady, appendToUrl } = useInstitutionFilter()

	const [revaluations, setRevaluations] = useState<RevaluationRegistration[]>([])
	const [loading, setLoading] = useState(false)
	const [examiners, setExaminers] = useState<any[]>([])
	const [selectedExaminer, setSelectedExaminer] = useState<string>('')
	const [selectedRevaluations, setSelectedRevaluations] = useState<Set<string>>(new Set())

	const canAssign = hasPermission('revaluation:assign')

	useEffect(() => {
		if (isReady) {
			fetchApprovedRevaluations()
			fetchExaminers()
		}
	}, [isReady, filter])

	const fetchApprovedRevaluations = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/revaluation/registrations?status=Approved,Payment Verified')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch revaluations')

			const data = await response.json()
			setRevaluations(data)
		} catch (error) {
			console.error('Fetch error:', error)
			toast({
				title: '❌ Failed to fetch revaluations',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const fetchExaminers = async () => {
		try {
			const url = appendToUrl('/api/examiners?status=active')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch examiners')

			const data = await response.json()
			setExaminers(data)
		} catch (error) {
			console.error('Fetch examiners error:', error)
		}
	}

	const handleToggleSelection = (id: string) => {
		setSelectedRevaluations((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(id)) {
				newSet.delete(id)
			} else {
				newSet.add(id)
			}
			return newSet
		})
	}

	const handleAssign = async () => {
		if (!selectedExaminer) {
			toast({
				title: '⚠️ Select Examiner',
				description: 'Please select an examiner before assigning',
				variant: 'destructive',
			})
			return
		}

		if (selectedRevaluations.size === 0) {
			toast({
				title: '⚠️ Select Revaluations',
				description: 'Please select at least one revaluation',
				variant: 'destructive',
			})
			return
		}

		setLoading(true)
		try {
			const response = await fetch('/api/revaluation/assignments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					revaluation_registration_ids: Array.from(selectedRevaluations),
					examiner_id: selectedExaminer,
				}),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to assign examiner')
			}

			toast({
				title: '✅ Assignment Successful',
				description: result.message || `Assigned ${result.data.length} revaluation(s)`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Show warnings if any assignments failed
			if (result.errors && result.errors.length > 0) {
				toast({
					title: '⚠️ Some Assignments Failed',
					description: `${result.errors.length} revaluation(s) could not be assigned`,
					variant: 'destructive',
				})
			}

			setSelectedRevaluations(new Set())
			setSelectedExaminer('')
			fetchApprovedRevaluations()
		} catch (error) {
			console.error('Assignment error:', error)
			toast({
				title: '❌ Assignment Failed',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="space-y-4">
			{/* Assignment Toolbar */}
			{canAssign && (
				<div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="flex-1">
						<Label className="text-sm font-medium text-blue-900 mb-2 block">
							Select Examiner for Assignment
						</Label>
						<Select value={selectedExaminer} onValueChange={setSelectedExaminer}>
							<SelectTrigger className="bg-white">
								<SelectValue placeholder="Choose examiner..." />
							</SelectTrigger>
							<SelectContent>
								{examiners.map((examiner) => (
									<SelectItem key={examiner.id} value={examiner.id}>
										{examiner.name} - {examiner.email}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-end gap-2">
						<Button
							onClick={handleAssign}
							disabled={loading || selectedRevaluations.size === 0 || !selectedExaminer}
							className="bg-blue-600 hover:bg-blue-700"
						>
							<UserPlus className="h-4 w-4 mr-2" />
							Assign ({selectedRevaluations.size})
						</Button>
						<Button onClick={fetchApprovedRevaluations} variant="outline" disabled={loading}>
							<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
						</Button>
					</div>
				</div>
			)}

			{/* Revaluations Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							{canAssign && <TableHead className="w-12"></TableHead>}
							<TableHead>Student</TableHead>
							<TableHead>Course</TableHead>
							<TableHead>Attempt</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Applied Date</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={canAssign ? 6 : 5} className="text-center py-8">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
										<span className="text-sm text-gray-600">Loading...</span>
									</div>
								</TableCell>
							</TableRow>
						) : revaluations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={canAssign ? 6 : 5} className="text-center py-8 text-gray-500">
									No approved revaluations pending assignment
								</TableCell>
							</TableRow>
						) : (
							revaluations.map((reval) => (
								<TableRow key={reval.id} className="hover:bg-gray-50">
									{canAssign && (
										<TableCell>
											<input
												type="checkbox"
												checked={selectedRevaluations.has(reval.id)}
												onChange={() => handleToggleSelection(reval.id)}
												className="h-4 w-4 rounded border-gray-300"
											/>
										</TableCell>
									)}
									<TableCell>
										<div>
											<div className="font-medium">{reval.student_name}</div>
											<div className="text-sm text-gray-500">{reval.student_register_number}</div>
										</div>
									</TableCell>
									<TableCell>
										<div>
											<div className="font-medium">{reval.course_code}</div>
											<div className="text-sm text-gray-500 max-w-[200px] truncate">
												{reval.course_title}
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">Attempt {reval.attempt_number}</Badge>
									</TableCell>
									<TableCell>
										<RevaluationStatusBadge status={reval.status} />
									</TableCell>
									<TableCell className="text-sm">
										{new Date(reval.application_date).toLocaleDateString()}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Stats */}
			<div className="text-sm text-gray-600 px-2">
				Showing <span className="font-medium text-gray-900">{revaluations.length}</span> revaluations
				pending assignment
				{selectedRevaluations.size > 0 && (
					<span className="ml-4">
						Selected:{' '}
						<span className="font-medium text-blue-600">{selectedRevaluations.size}</span>
					</span>
				)}
			</div>
		</div>
	)
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
	return <label className={`text-sm font-medium ${className}`}>{children}</label>
}
