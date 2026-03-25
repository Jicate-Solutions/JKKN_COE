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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	Search,
	Loader2,
	CheckCircle,
	XCircle,
	Clock,
	IndianRupee,
	Download,
	Upload,
	FileText,
} from 'lucide-react'

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

interface PaymentRecord {
	id: string
	student_id: string
	student_register_number: string
	student_name: string
	program_code: string
	program_name: string
	course_count: number
	total_fee: number
	payment_status: 'Payment Pending' | 'Payment Verified' | 'Payment Failed'
	payment_method: string | null
	payment_reference: string | null
	payment_date: string | null
	verified_by: string | null
	verified_at: string | null
	created_at: string
}

export default function PaymentStatusTab() {
	const { toast } = useToast()
	const { institutionId, isReady } = useInstitutionFilter()

	// Form state
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [selectedSessionId, setSelectedSessionId] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [searchQuery, setSearchQuery] = useState('')

	// Data state
	const [payments, setPayments] = useState<PaymentRecord[]>([])
	const [filteredPayments, setFilteredPayments] = useState<PaymentRecord[]>([])

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false)
	const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
	const [paymentData, setPaymentData] = useState({
		payment_status: 'Payment Verified',
		payment_method: '',
		payment_reference: '',
		payment_date: '',
		remarks: '',
	})

	// Loading states
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPayments, setLoadingPayments] = useState(false)
	const [updating, setUpdating] = useState(false)

	// Fetch exam sessions
	useEffect(() => {
		if (!isReady || !institutionId) return

		const fetchSessions = async () => {
			setLoadingSessions(true)
			try {
				const response = await fetch(`/api/examination-sessions?institutions_id=${institutionId}`)
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

	// Fetch payments when session selected
	useEffect(() => {
		if (!selectedSessionId || !institutionId) return

		const fetchPayments = async () => {
			setLoadingPayments(true)
			try {
				const response = await fetch(
					`/api/revaluation/payment-status?examination_session_id=${selectedSessionId}&institutions_id=${institutionId}`
				)
				if (response.ok) {
					const data = await response.json()
					setPayments(data)
				}
			} catch (error) {
				console.error('Failed to fetch payments:', error)
			} finally {
				setLoadingPayments(false)
			}
		}

		fetchPayments()
	}, [selectedSessionId, institutionId])

	// Filter payments
	useEffect(() => {
		let filtered = payments

		// Status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter((p) => p.payment_status === statusFilter)
		}

		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(
				(p) =>
					p.student_register_number.toLowerCase().includes(query) ||
					p.student_name.toLowerCase().includes(query) ||
					p.payment_reference?.toLowerCase().includes(query)
			)
		}

		setFilteredPayments(filtered)
	}, [payments, statusFilter, searchQuery])

	// Get status badge
	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'Payment Verified':
				return (
					<Badge className="bg-green-100 text-green-800 border-green-200">
						<CheckCircle className="h-3 w-3 mr-1" />
						Verified
					</Badge>
				)
			case 'Payment Failed':
				return (
					<Badge className="bg-red-100 text-red-800 border-red-200">
						<XCircle className="h-3 w-3 mr-1" />
						Failed
					</Badge>
				)
			case 'Payment Pending':
			default:
				return (
					<Badge className="bg-amber-100 text-amber-800 border-amber-200">
						<Clock className="h-3 w-3 mr-1" />
						Pending
					</Badge>
				)
		}
	}

	// Handle update payment
	const handleUpdatePayment = (payment: PaymentRecord) => {
		setSelectedPayment(payment)
		setPaymentData({
			payment_status: payment.payment_status === 'Payment Pending' ? 'Payment Verified' : payment.payment_status,
			payment_method: payment.payment_method || '',
			payment_reference: payment.payment_reference || '',
			payment_date: payment.payment_date || new Date().toISOString().split('T')[0],
			remarks: '',
		})
		setDialogOpen(true)
	}

	// Save payment update
	const handleSavePayment = async () => {
		if (!selectedPayment) return

		setUpdating(true)

		try {
			const response = await fetch('/api/revaluation/payment-status', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					student_id: selectedPayment.student_id,
					examination_session_id: selectedSessionId,
					...paymentData,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to update payment')
			}

			toast({
				title: '✅ Payment Updated',
				description: `Payment status updated to ${paymentData.payment_status}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Refresh payments
			const refreshResponse = await fetch(
				`/api/revaluation/payment-status?examination_session_id=${selectedSessionId}&institutions_id=${institutionId}`
			)
			if (refreshResponse.ok) {
				const data = await refreshResponse.json()
				setPayments(data)
			}

			setDialogOpen(false)
			setSelectedPayment(null)
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to update payment',
				variant: 'destructive',
			})
		} finally {
			setUpdating(false)
		}
	}

	// Calculate summary
	const summary = {
		total: filteredPayments.length,
		verified: filteredPayments.filter((p) => p.payment_status === 'Payment Verified').length,
		pending: filteredPayments.filter((p) => p.payment_status === 'Payment Pending').length,
		failed: filteredPayments.filter((p) => p.payment_status === 'Payment Failed').length,
		totalAmount: filteredPayments.reduce((sum, p) => sum + p.total_fee, 0),
		verifiedAmount: filteredPayments
			.filter((p) => p.payment_status === 'Payment Verified')
			.reduce((sum, p) => sum + p.total_fee, 0),
	}

	return (
		<div className="space-y-6">
			{/* Session Selection */}
			<Card>
				<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
					<CardTitle className="text-blue-900">Select Examination Session</CardTitle>
					<CardDescription className="text-blue-700">
						Choose the examination session to manage payment status
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="max-w-md">
						<Label htmlFor="session">Examination Session *</Label>
						<Select
							value={selectedSessionId}
							onValueChange={setSelectedSessionId}
							disabled={loadingSessions}
						>
							<SelectTrigger id="session">
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

			{/* Filters and Search */}
			{selectedSessionId && (
				<>
					{/* Summary Cards */}
					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						<Card>
							<CardHeader className="pb-2">
								<CardDescription>Total Applications</CardDescription>
								<CardTitle className="text-3xl">{summary.total}</CardTitle>
							</CardHeader>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardDescription>Verified</CardDescription>
								<CardTitle className="text-3xl text-green-600">{summary.verified}</CardTitle>
							</CardHeader>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardDescription>Pending</CardDescription>
								<CardTitle className="text-3xl text-amber-600">{summary.pending}</CardTitle>
							</CardHeader>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardDescription>Total Amount</CardDescription>
								<CardTitle className="text-3xl text-blue-600">₹{summary.totalAmount.toLocaleString()}</CardTitle>
							</CardHeader>
						</Card>
					</div>

					{/* Filters */}
					<Card>
						<CardContent className="pt-6">
							<div className="flex flex-col md:flex-row gap-4">
								<div className="flex-1">
									<Label htmlFor="search">Search</Label>
									<div className="relative">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
										<Input
											id="search"
											placeholder="Search by register number, name, or payment reference..."
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											className="pl-10"
										/>
									</div>
								</div>
								<div className="w-full md:w-64">
									<Label htmlFor="status-filter">Payment Status</Label>
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger id="status-filter">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="Payment Pending">Pending</SelectItem>
											<SelectItem value="Payment Verified">Verified</SelectItem>
											<SelectItem value="Payment Failed">Failed</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Payment Table */}
					<Card>
						<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
							<CardTitle className="text-blue-900">Payment Records</CardTitle>
							<CardDescription className="text-blue-700">
								Manage and verify payment status for revaluation applications
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-6">
							{loadingPayments ? (
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
								</div>
							) : filteredPayments.length === 0 ? (
								<div className="text-center py-12">
									<FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
									<p className="text-gray-500">No payment records found</p>
								</div>
							) : (
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Register No.</TableHead>
												<TableHead>Student Name</TableHead>
												<TableHead>Program</TableHead>
												<TableHead className="text-center">Courses</TableHead>
												<TableHead className="text-right">Fee Amount</TableHead>
												<TableHead>Payment Ref</TableHead>
												<TableHead>Status</TableHead>
												<TableHead className="text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredPayments.map((payment) => (
												<TableRow key={payment.id}>
													<TableCell className="font-medium">{payment.student_register_number}</TableCell>
													<TableCell>{payment.student_name}</TableCell>
													<TableCell className="text-sm text-gray-600">{payment.program_code}</TableCell>
													<TableCell className="text-center">{payment.course_count}</TableCell>
													<TableCell className="text-right font-medium">
														₹{payment.total_fee.toLocaleString()}
													</TableCell>
													<TableCell className="text-sm text-gray-600">
														{payment.payment_reference || '-'}
													</TableCell>
													<TableCell>{getStatusBadge(payment.payment_status)}</TableCell>
													<TableCell className="text-center">
														<Button
															variant="outline"
															size="sm"
															onClick={() => handleUpdatePayment(payment)}
														>
															<CheckCircle className="h-4 w-4 mr-1" />
															Update
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				</>
			)}

			{/* Update Payment Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-[500px]">
					<DialogHeader>
						<DialogTitle>Update Payment Status</DialogTitle>
						<DialogDescription>
							Update payment information for {selectedPayment?.student_register_number} -{' '}
							{selectedPayment?.student_name}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="payment-status">Payment Status</Label>
							<Select
								value={paymentData.payment_status}
								onValueChange={(value) => setPaymentData({ ...paymentData, payment_status: value })}
							>
								<SelectTrigger id="payment-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Payment Verified">Verified</SelectItem>
									<SelectItem value="Payment Failed">Failed</SelectItem>
									<SelectItem value="Payment Pending">Pending</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="payment-method">Payment Method</Label>
							<Select
								value={paymentData.payment_method}
								onValueChange={(value) => setPaymentData({ ...paymentData, payment_method: value })}
							>
								<SelectTrigger id="payment-method">
									<SelectValue placeholder="Select payment method" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Cash">Cash</SelectItem>
									<SelectItem value="UPI">UPI</SelectItem>
									<SelectItem value="Card">Card</SelectItem>
									<SelectItem value="Net Banking">Net Banking</SelectItem>
									<SelectItem value="Cheque">Cheque</SelectItem>
									<SelectItem value="DD">Demand Draft</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="payment-reference">Payment Reference</Label>
							<Input
								id="payment-reference"
								placeholder="Transaction ID / Reference Number"
								value={paymentData.payment_reference}
								onChange={(e) => setPaymentData({ ...paymentData, payment_reference: e.target.value })}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="payment-date">Payment Date</Label>
							<Input
								id="payment-date"
								type="date"
								value={paymentData.payment_date}
								onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="remarks">Remarks (Optional)</Label>
							<Input
								id="remarks"
								placeholder="Any additional notes..."
								value={paymentData.remarks}
								onChange={(e) => setPaymentData({ ...paymentData, remarks: e.target.value })}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSavePayment} disabled={updating} className="bg-blue-600 hover:bg-blue-700">
							{updating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Updating...
								</>
							) : (
								<>
									<CheckCircle className="mr-2 h-4 w-4" />
									Update Payment
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
