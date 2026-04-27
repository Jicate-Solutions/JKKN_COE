'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useToast } from '@/hooks/common/use-toast'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Registration {
	id: string
	student_id: string
	stu_register_no: string
	student_name: string
	program_code: string
	course_code: string
	registration_status: string
	created_at: string
}

export default function ApprovalsPage() {
	const router = useRouter()
	const { toast } = useToast()
	const { mustSelectInstitution } = useInstitutionFilter()
	const { institution } = useInstitution()

	const [institutionsId, setInstitutionsId] = useState('')
	const [sessionId, setSessionId] = useState('')
	const [programCode, setProgramCode] = useState('')

	const [sessions, setSessions] = useState<any[]>([])
	const [programs, setPrograms] = useState<any[]>([])
	const [registrations, setRegistrations] = useState<Registration[]>([])
	const [groupedByProgram, setGroupedByProgram] = useState<Record<string, Registration[]>>({})
	const [selectedIds, setSelectedIds] = useState(new Set<string>())
	const [loading, setLoading] = useState(false)
	const [approving, setApproving] = useState(false)
	const [showConfirm, setShowConfirm] = useState(false)
	const [approvalAction, setApprovalAction] = useState<'Approved' | 'Rejected'>('Approved')

	// Load institution
	useEffect(() => {
		if (mustSelectInstitution) {
			router.push('/exam-management/exam-registrations')
			return
		}
		const id = institution?.id || ''
		setInstitutionsId(id)
	}, [institution, mustSelectInstitution, router])

	// Load sessions
	useEffect(() => {
		if (!institutionsId) return
		fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionsId}`)
			.then(r => r.json())
			.then((data: any[]) => setSessions(Array.isArray(data) ? data : []))
			.catch(() => setSessions([]))
	}, [institutionsId])

	// Load pending registrations
	useEffect(() => {
		if (!institutionsId || !sessionId) {
			setRegistrations([])
			setGroupedByProgram({})
			setPrograms([])
			return
		}

		setLoading(true)
		const params = new URLSearchParams({
			institutions_id: institutionsId,
			examination_session_id: sessionId,
			registration_status: 'Pending',
		})

		fetch(`/api/exam-management/exam-registrations/approvals?${params}`)
			.then(r => r.json())
			.then((data) => {
				setRegistrations(data.data || [])
				setGroupedByProgram(data.grouped || {})
				const uniqueProgs = [...new Set((data.data || []).map((r: any) => r.program_code))]
					.map(code => ({ code, count: (data.grouped?.[code] || []).length }))
				setPrograms(uniqueProgs)
				setSelectedIds(new Set())
			})
			.catch((e) => {
				console.error('Failed to load pending registrations:', e)
				toast({ title: 'Error', description: 'Failed to load pending registrations', variant: 'destructive' })
			})
			.finally(() => setLoading(false))
	}, [institutionsId, sessionId, toast])

	const handleSelectAll = (prog: string, checked: boolean) => {
		const progRegs = groupedByProgram[prog] || []
		const newSelected = new Set(selectedIds)
		progRegs.forEach(r => {
			if (checked) newSelected.add(r.id)
			else newSelected.delete(r.id)
		})
		setSelectedIds(newSelected)
	}

	const handleSelectReg = (id: string, checked: boolean) => {
		const newSelected = new Set(selectedIds)
		if (checked) newSelected.add(id)
		else newSelected.delete(id)
		setSelectedIds(newSelected)
	}

	const handleApprove = async () => {
		if (selectedIds.size === 0) {
			toast({ title: 'Select registrations', description: 'Please select at least one registration', variant: 'destructive' })
			return
		}

		setApproving(true)
		try {
			const res = await fetch('/api/exam-management/exam-registrations/approvals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					registration_ids: Array.from(selectedIds),
					approval_status: approvalAction,
				}),
			})

			const result = await res.json()
			if (!res.ok) {
				toast({ title: 'Error', description: result.error || 'Failed to approve', variant: 'destructive' })
				return
			}

			toast({ title: '✓ Success', description: result.message })
			setSelectedIds(new Set())
			setShowConfirm(false)

			// Reload registrations
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
				registration_status: 'Pending',
			})
			const data = await fetch(`/api/exam-management/exam-registrations/approvals?${params}`).then(r => r.json())
			setRegistrations(data.data || [])
			setGroupedByProgram(data.grouped || {})
		} catch (e) {
			console.error('Approval error:', e)
			toast({ title: 'Error', description: 'Failed to approve registrations', variant: 'destructive' })
		} finally {
			setApproving(false)
		}
	}

	const pendingCount = registrations.length
	const selectedCount = selectedIds.size

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className="flex-1">
					<div className="space-y-4 p-4 md:p-6">
						{/* Breadcrumb */}
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Registrations</Link></BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Approvals</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Header */}
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold">Exam Registration Approvals</h1>
								<p className="text-sm text-muted-foreground mt-1">Approve pending exam registrations</p>
							</div>
							<Link href="/exam-management/exam-registrations">
								<Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
							</Link>
						</div>

						{/* Session selector */}
						<Card>
							<CardContent className="pt-6">
								<div className="space-y-4">
									<div>
										<label className="text-sm font-medium">Exam Session</label>
										<Select value={sessionId} onValueChange={setSessionId}>
											<SelectTrigger className="h-9 mt-1.5">
												<SelectValue placeholder="Select session" />
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => (
													<SelectItem key={s.id} value={s.id}>
														{s.session_name || s.session_code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Registrations by program */}
						{loading ? (
							<div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
						) : pendingCount === 0 ? (
							<Card className="text-center py-12">
								<p className="text-muted-foreground">No pending registrations found</p>
							</Card>
						) : (
							<>
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium">{pendingCount} pending registrations across {programs.length} programs</p>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setApprovalAction('Approved')
												setShowConfirm(true)
											}}
											disabled={selectedCount === 0 || approving}
										>
											<Check className="h-4 w-4 mr-1.5" />
											Approve ({selectedCount})
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setApprovalAction('Rejected')
												setShowConfirm(true)
											}}
											disabled={selectedCount === 0 || approving}
										>
											<X className="h-4 w-4 mr-1.5" />
											Reject ({selectedCount})
										</Button>
									</div>
								</div>

								{/* Programs */}
								<div className="space-y-4">
									{programs.map(prog => {
										const regs = groupedByProgram[prog.code] || []
										const allSelected = regs.length > 0 && regs.every(r => selectedIds.has(r.id))
										const someSelected = regs.some(r => selectedIds.has(r.id))

										return (
											<Card key={prog.code}>
												<CardHeader className="pb-3">
													<div className="flex items-center justify-between">
														<CardTitle className="text-base">{prog.code} ({regs.length})</CardTitle>
														<Checkbox
															checked={allSelected}
															indeterminate={someSelected && !allSelected}
															onCheckedChange={(checked) => handleSelectAll(prog.code, checked as boolean)}
														/>
													</div>
												</CardHeader>
												<CardContent>
													<div className="space-y-2">
														{regs.map(reg => (
															<div key={reg.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted">
																<Checkbox
																	checked={selectedIds.has(reg.id)}
																	onCheckedChange={(checked) => handleSelectReg(reg.id, checked as boolean)}
																/>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium truncate">{reg.stu_register_no} - {reg.student_name}</p>
																	<p className="text-xs text-muted-foreground">{reg.course_code}</p>
																</div>
																<Badge variant="secondary" className="shrink-0">Pending</Badge>
															</div>
														))}
													</div>
												</CardContent>
											</Card>
										)
									})}
								</div>
							</>
						)}
					</div>
				</main>
				<AppFooter />
			</SidebarInset>

			{/* Confirm dialog */}
			<AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{approvalAction === 'Approved' ? 'Approve Registrations?' : 'Reject Registrations?'}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{approvalAction === 'Approved'
								? `You are about to approve ${selectedCount} registration(s). This action cannot be undone.`
								: `You are about to reject ${selectedCount} registration(s). This action cannot be undone.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleApprove}
							disabled={approving}
							className={cn(approvalAction === 'Rejected' && 'bg-destructive hover:bg-destructive/90')}
						>
							{approving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
							{approvalAction === 'Approved' ? 'Approve' : 'Reject'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
