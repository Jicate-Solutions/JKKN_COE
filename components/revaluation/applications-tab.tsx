'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useAuth } from '@/context/auth-context'
import { Plus, Search, RefreshCw, Eye, Edit, Trash2 } from 'lucide-react'
import type { RevaluationRegistration, RevaluationStatus, PaymentStatus } from '@/types/revaluation'
import RevaluationApplicationDialog from './revaluation-application-dialog'
import RevaluationStatusBadge from './revaluation-status-badge'
import { formatDate } from '@/lib/utils'

export default function ApplicationsTab() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const { filter, isReady, appendToUrl } = useInstitutionFilter()

	const [applications, setApplications] = useState<RevaluationRegistration[]>([])
	const [loading, setLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [paymentFilter, setPaymentFilter] = useState<string>('all')
	const [dialogOpen, setDialogOpen] = useState(false)
	const [selectedApplication, setSelectedApplication] = useState<RevaluationRegistration | null>(
		null
	)

	const canCreate = hasPermission('revaluation:create')
	const canUpdate = hasPermission('revaluation:update')
	const canDelete = hasPermission('revaluation:delete')

	useEffect(() => {
		if (isReady) {
			fetchApplications()
		}
	}, [isReady, filter, statusFilter, paymentFilter])

	const fetchApplications = async () => {
		setLoading(true)
		try {
			let url = appendToUrl('/api/revaluation/registrations')

			// Add filters
			const params = new URLSearchParams()
			if (statusFilter !== 'all') params.append('status', statusFilter)
			if (paymentFilter !== 'all') params.append('payment_status', paymentFilter)
			if (searchTerm.trim()) params.append('search', searchTerm.trim())

			if (params.toString()) {
				url += (url.includes('?') ? '&' : '?') + params.toString()
			}

			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch applications')

			const data = await response.json()
			setApplications(data)
		} catch (error) {
			console.error('Fetch error:', error)
			toast({
				title: '❌ Failed to fetch applications',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const handleSearch = () => {
		fetchApplications()
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to cancel this revaluation application?')) return

		try {
			const response = await fetch(`/api/revaluation/registrations/${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to cancel application')
			}

			toast({
				title: '✅ Application Cancelled',
				description: 'Revaluation application has been cancelled',
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			fetchApplications()
		} catch (error) {
			toast({
				title: '❌ Failed to cancel',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		}
	}

	const handleDialogSuccess = () => {
		setDialogOpen(false)
		setSelectedApplication(null)
		fetchApplications()
	}

	const filteredApplications = applications.filter((app) => {
		if (!searchTerm.trim()) return true
		const search = searchTerm.toLowerCase()
		return (
			app.student_register_number.toLowerCase().includes(search) ||
			app.student_name.toLowerCase().includes(search) ||
			app.course_code.toLowerCase().includes(search) ||
			app.course_title.toLowerCase().includes(search)
		)
	})

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1 flex gap-2">
					<Input
						placeholder="Search by student, register number, or course..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
						className="flex-1"
					/>
					<Button onClick={handleSearch} variant="outline" size="icon">
						<Search className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex gap-2">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Statuses</SelectItem>
							<SelectItem value="Payment Pending">Payment Pending</SelectItem>
							<SelectItem value="Payment Verified">Payment Verified</SelectItem>
							<SelectItem value="Approved">Approved</SelectItem>
							<SelectItem value="Rejected">Rejected</SelectItem>
							<SelectItem value="Assigned">Assigned</SelectItem>
							<SelectItem value="In Progress">In Progress</SelectItem>
							<SelectItem value="Evaluated">Evaluated</SelectItem>
							<SelectItem value="Verified">Verified</SelectItem>
							<SelectItem value="Published">Published</SelectItem>
							<SelectItem value="Cancelled">Cancelled</SelectItem>
						</SelectContent>
					</Select>

					<Select value={paymentFilter} onValueChange={setPaymentFilter}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Payment status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Payments</SelectItem>
							<SelectItem value="Pending">Pending</SelectItem>
							<SelectItem value="Verified">Verified</SelectItem>
							<SelectItem value="Rejected">Rejected</SelectItem>
						</SelectContent>
					</Select>

					<Button onClick={fetchApplications} variant="outline" size="icon" disabled={loading}>
						<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
					</Button>

					{canCreate && (
						<Button
							onClick={() => {
								setSelectedApplication(null)
								setDialogOpen(true)
							}}
							className="bg-blue-600 hover:bg-blue-700"
						>
							<Plus className="h-4 w-4 mr-2" />
							New Application
						</Button>
					)}
				</div>
			</div>

			{/* Applications Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							<TableHead>Student Details</TableHead>
							<TableHead>Course</TableHead>
							<TableHead>Attempt</TableHead>
							<TableHead>Fee</TableHead>
							<TableHead>Payment</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Applied</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={8} className="text-center py-8">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
										<span className="text-sm text-gray-600">Loading applications...</span>
									</div>
								</TableCell>
							</TableRow>
						) : filteredApplications.length === 0 ? (
							<TableRow>
								<TableCell colSpan={8} className="text-center py-8 text-gray-500">
									No revaluation applications found
								</TableCell>
							</TableRow>
						) : (
							filteredApplications.map((app) => (
								<TableRow key={app.id} className="hover:bg-gray-50">
									<TableCell>
										<div>
											<div className="font-medium text-gray-900">{app.student_name}</div>
											<div className="text-sm text-gray-500">{app.student_register_number}</div>
										</div>
									</TableCell>
									<TableCell>
										<div>
											<div className="font-medium text-gray-900">{app.course_code}</div>
											<div className="text-sm text-gray-500 max-w-[200px] truncate">
												{app.course_title}
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline" className="font-mono">
											Attempt {app.attempt_number}
										</Badge>
									</TableCell>
									<TableCell>
										<span className="font-medium">₹{app.fee_amount.toFixed(2)}</span>
									</TableCell>
									<TableCell>
										<Badge
											variant={
												app.payment_status === 'Verified'
													? 'default'
													: app.payment_status === 'Rejected'
														? 'destructive'
														: 'secondary'
											}
											className={
												app.payment_status === 'Verified'
													? 'bg-green-100 text-green-800 border-green-300'
													: ''
											}
										>
											{app.payment_status}
										</Badge>
									</TableCell>
									<TableCell>
										<RevaluationStatusBadge status={app.status} />
									</TableCell>
									<TableCell>
										<div className="text-sm">
											{formatDate(app.application_date)}
										</div>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<Eye className="h-4 w-4" />
											</Button>
											{canUpdate && app.status !== 'Published' && app.status !== 'Cancelled' && (
												<Button variant="ghost" size="icon" className="h-8 w-8">
													<Edit className="h-4 w-4" />
												</Button>
											)}
											{canDelete &&
												!['Evaluated', 'Verified', 'Published'].includes(app.status) && (
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
														onClick={() => handleDelete(app.id)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												)}
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Stats Footer */}
			<div className="flex items-center justify-between text-sm text-gray-600 px-2">
				<div>
					Showing <span className="font-medium text-gray-900">{filteredApplications.length}</span>{' '}
					of <span className="font-medium text-gray-900">{applications.length}</span> applications
				</div>
				<div className="flex gap-4">
					<span>
						Pending:{' '}
						<span className="font-medium text-amber-600">
							{applications.filter((a) => a.status === 'Payment Pending').length}
						</span>
					</span>
					<span>
						In Progress:{' '}
						<span className="font-medium text-blue-600">
							{
								applications.filter((a) =>
									['Approved', 'Assigned', 'In Progress'].includes(a.status)
								).length
							}
						</span>
					</span>
					<span>
						Published:{' '}
						<span className="font-medium text-green-600">
							{applications.filter((a) => a.status === 'Published').length}
						</span>
					</span>
				</div>
			</div>

			{/* Application Dialog */}
			<RevaluationApplicationDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSuccess={handleDialogSuccess}
				editData={selectedApplication}
			/>
		</div>
	)
}
