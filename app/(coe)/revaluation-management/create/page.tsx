'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { FilePlus, Loader2, CalendarClock } from 'lucide-react'

interface ExamSession {
	id: string
	session_code: string
	session_name: string
	status: string
}

export default function CreateRevaluationPage() {
	const { toast } = useToast()
	const router = useRouter()
	const { institutionId, isReady, filter } = useInstitutionFilter()
	const { selectedSessionId: syncedSessionId, mustSelectSession } = useSessionSync()

	// Form state
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [formData, setFormData] = useState({
		examination_session_id: '',
		session_code: '',
		session_name: '',
		start_date: '',
		end_date: '',
		instructions: '',
		is_active: true,
		max_courses_per_application: 10,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Loading states
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [saving, setSaving] = useState(false)

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

	// Auto-fill form from global session selector
	useEffect(() => {
		if (syncedSessionId && sessions.length > 0) {
			const session = sessions.find(s => s.id === syncedSessionId)
			if (session) {
				setFormData(prev => ({
					...prev,
					examination_session_id: syncedSessionId,
					session_code: session.session_code || '',
					session_name: session.session_name || '',
				}))
			}
		}
	}, [syncedSessionId, sessions])

	// Handle session selection
	const handleSessionChange = (sessionId: string) => {
		const session = sessions.find((s) => s.id === sessionId)
		setFormData({
			...formData,
			examination_session_id: sessionId,
			session_code: session?.session_code || '',
			session_name: session?.session_name || '',
		})
		setErrors({})
	}

	// Validate form
	const validate = () => {
		const e: Record<string, string> = {}

		if (!formData.examination_session_id) e.examination_session_id = 'Examination session is required'
		if (!formData.start_date) e.start_date = 'Start date is required'
		if (!formData.end_date) e.end_date = 'End date is required'

		// Validate end date is after start date
		if (formData.start_date && formData.end_date) {
			const start = new Date(formData.start_date)
			const end = new Date(formData.end_date)
			if (end <= start) {
				e.end_date = 'End date must be after start date'
			}
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// Handle save
	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: '❌ Validation Error',
				description: 'Please fix the errors before saving',
				variant: 'destructive',
			})
			return
		}

		setSaving(true)

		try {
			const response = await fetch('/api/revaluation/registration-periods', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...formData,
					institutions_id: institutionId,
					institution_code: filter?.institution_code,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to create revaluation period')
			}

			const data = await response.json()

			toast({
				title: '✅ Created Successfully',
				description: `Revaluation period for ${formData.session_code} has been created`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Redirect to main page
			router.push('/revaluation-management')
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to create revaluation period',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	if (!isReady) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
							<div className="flex items-center justify-center min-h-[400px]">
								<div className="text-center">
									<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
									<p className="text-sm text-gray-600">Loading...</p>
								</div>
							</div>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
						{/* Breadcrumb */}
						<div className="flex items-center gap-2">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link href="/dashboard">Dashboard</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link href="/revaluation-management">Revaluation Management</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Create Revaluation Period</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Header */}
						<div>
							<h1 className="text-3xl font-bold text-gray-900">Create Revaluation Period</h1>
							<p className="text-gray-600 mt-1">
								Set up a new revaluation registration period with start and end dates
							</p>
						</div>

						{/* Form Card */}
						<Card>
							<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
								<CardTitle className="flex items-center gap-2 text-blue-900">
									<FilePlus className="h-5 w-5" />
									Revaluation Period Details
								</CardTitle>
								<CardDescription className="text-blue-700">
									Configure the revaluation application period for an examination session
								</CardDescription>
							</CardHeader>
							<CardContent className="pt-6">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* Examination Session — hidden when global session selected */}
									{mustSelectSession && (
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="session">
											Examination Session <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.examination_session_id}
											onValueChange={handleSessionChange}
											disabled={loadingSessions}
										>
											<SelectTrigger
												id="session"
												className={errors.examination_session_id ? 'border-red-500' : ''}
											>
												<SelectValue
													placeholder={loadingSessions ? 'Loading...' : 'Select examination session'}
												/>
											</SelectTrigger>
											<SelectContent>
												{sessions.map((session) => (
													<SelectItem key={session.id} value={session.id}>
														{session.session_code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.examination_session_id && (
											<p className="text-sm text-red-500">{errors.examination_session_id}</p>
										)}
									</div>
									)}

									{/* Start Date */}
									<div className="space-y-2">
										<Label htmlFor="start-date">
											Application Start Date <span className="text-red-500">*</span>
										</Label>
										<div className="relative">
											<CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
											<Input
												id="start-date"
												type="datetime-local"
												value={formData.start_date}
												onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
												className={`pl-10 ${errors.start_date ? 'border-red-500' : ''}`}
											/>
										</div>
										{errors.start_date && <p className="text-sm text-red-500">{errors.start_date}</p>}
										<p className="text-xs text-gray-500">When students can start applying for revaluation</p>
									</div>

									{/* End Date */}
									<div className="space-y-2">
										<Label htmlFor="end-date">
											Application End Date <span className="text-red-500">*</span>
										</Label>
										<div className="relative">
											<CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
											<Input
												id="end-date"
												type="datetime-local"
												value={formData.end_date}
												onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
												className={`pl-10 ${errors.end_date ? 'border-red-500' : ''}`}
											/>
										</div>
										{errors.end_date && <p className="text-sm text-red-500">{errors.end_date}</p>}
										<p className="text-xs text-gray-500">
											Last date for students to submit revaluation applications
										</p>
									</div>

									{/* Max Courses */}
									<div className="space-y-2">
										<Label htmlFor="max-courses">Maximum Courses Per Application</Label>
										<Input
											id="max-courses"
											type="number"
											min="1"
											max="20"
											value={formData.max_courses_per_application}
											onChange={(e) =>
												setFormData({ ...formData, max_courses_per_application: Number(e.target.value) })
											}
										/>
										<p className="text-xs text-gray-500">
											Maximum number of courses a student can apply for in one application
										</p>
									</div>

									{/* Active Status */}
									<div className="space-y-2">
										<Label htmlFor="is-active">Enable Registration Period</Label>
										<div className="flex items-center space-x-2 pt-2">
											<Switch
												id="is-active"
												checked={formData.is_active}
												onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
											/>
											<Label htmlFor="is-active" className="text-sm text-gray-600 cursor-pointer">
												{formData.is_active ? 'Active - Students can apply' : 'Inactive - Applications closed'}
											</Label>
										</div>
									</div>

									{/* Instructions */}
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="instructions">Instructions for Students (Optional)</Label>
										<Textarea
											id="instructions"
											rows={4}
											placeholder="Enter any special instructions or notes for students applying for revaluation..."
											value={formData.instructions}
											onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
										/>
										<p className="text-xs text-gray-500">
											These instructions will be displayed to students when they apply for revaluation
										</p>
									</div>
								</div>

								{/* Actions */}
								<div className="flex justify-end gap-3 mt-8 pt-6 border-t">
									<Button variant="outline" onClick={() => router.push('/revaluation-management')}>
										Cancel
									</Button>
									<Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
										{saving ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Creating...
											</>
										) : (
											<>
												<FilePlus className="mr-2 h-4 w-4" />
												Create Revaluation Period
											</>
										)}
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
