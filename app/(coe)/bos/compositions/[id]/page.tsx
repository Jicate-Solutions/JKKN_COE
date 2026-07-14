'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ProtectedRoute } from '@/components/protected-route'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import {
	ArrowLeft,
	CalendarRange,
	CheckCircle2,
	ClipboardList,
	Loader2,
	Mail,
	Phone,
	ShieldCheck,
	Users,
	XCircle
} from 'lucide-react'

interface BosMember {
	id: string
	member_type: string
	staff_id: string | null
	expert_id: string | null
	display_name: string
	display_designation: string | null
	display_institution: string | null
	address: string | null
	contact_no: string | null
	email: string | null
	sort_order: number
	is_active: boolean
	joined_date: string | null
	left_date: string | null
}

interface BosMeeting {
	id: string
	meeting_number: number
	academic_year: string
	meeting_title: string | null
	meeting_type: string
	status: string
	scheduled_date: string | null
	actual_date: string | null
	venue: string | null
}

interface CompositionDetail {
	id: string
	institutions_id: string
	board_id: string
	composition_title: string
	term_start_date: string
	term_end_date: string
	academic_year: string
	is_active: boolean
	ratified_by_gc: boolean
	ratified_date: string | null
	notes: string | null
	board_code: string | null
	board_name: string | null
	board_type: string | null
	members: BosMember[]
	meetings: BosMeeting[]
}

const MEMBER_TYPE_LABELS: Record<string, string> = {
	chairman: 'Chairman',
	internal_member: 'Internal Member',
	university_nominee: 'University Nominee',
	subject_expert: 'Subject Expert',
	industry_expert: 'Industry Expert',
	alumni: 'Alumni'
}

// Display order for member groups (UGC composition convention)
const MEMBER_TYPE_ORDER = [
	'chairman',
	'internal_member',
	'university_nominee',
	'subject_expert',
	'industry_expert',
	'alumni'
]

const MEETING_STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	principal_approved: 'Principal Approved',
	noticed: 'Noticed',
	expert_invited: 'Expert Invited',
	completed: 'Completed',
	minutes_drafted: 'Minutes Drafted',
	minutes_approved: 'Minutes Approved',
	ratified: 'Ratified'
}

const memberTypeLabel = (t: string) => MEMBER_TYPE_LABELS[t] || t
const meetingStatusLabel = (s: string) => MEETING_STATUS_LABELS[s] || s

function BosCompositionDetailContent() {
	const params = useParams()
	const { toast } = useToast()
	const compositionId = String(params?.id || '')

	const [composition, setComposition] = useState<CompositionDetail | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!compositionId) return
		fetchComposition(compositionId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [compositionId])

	const fetchComposition = async (id: string) => {
		try {
			setLoading(true)
			setError(null)
			const res = await fetch(`/api/bos/compositions/${id}`)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch composition')
			}
			setComposition(await res.json())
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to fetch composition'
			setError(message)
			toast({ title: 'Load Failed', description: message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	// Group members by type in display order
	const groupedMembers = useMemo(() => {
		if (!composition) return []
		const groups = new Map<string, BosMember[]>()
		for (const m of composition.members) {
			if (!groups.has(m.member_type)) groups.set(m.member_type, [])
			groups.get(m.member_type)!.push(m)
		}
		const ordered: { type: string; members: BosMember[] }[] = []
		for (const type of MEMBER_TYPE_ORDER) {
			if (groups.has(type)) {
				ordered.push({ type, members: groups.get(type)! })
				groups.delete(type)
			}
		}
		// Any unknown types appended at the end
		for (const [type, members] of groups) {
			ordered.push({ type, members })
		}
		return ordered
	}, [composition])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
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
									<Link href="/bos/compositions">BoS Compositions</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>{composition?.composition_title || 'Composition'}</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" asChild>
							<Link href="/bos/compositions">
								<ArrowLeft className="h-4 w-4 mr-1" />
								Back
							</Link>
						</Button>
					</div>

					{loading ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="h-6 w-6 animate-spin mr-2" />
							<span>Loading composition...</span>
						</div>
					) : error ? (
						<Card>
							<CardContent className="py-12 text-center text-muted-foreground">
								<XCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
								<p className="font-medium text-red-600">{error}</p>
							</CardContent>
						</Card>
					) : composition ? (
						<>
							{/* Header */}
							<Card>
								<CardHeader>
									<div className="flex items-start justify-between flex-wrap gap-3">
										<div className="flex items-center gap-3">
											<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center">
												<ShieldCheck className="h-5 w-5 text-white" />
											</div>
											<div>
												<CardTitle className="text-xl">{composition.composition_title}</CardTitle>
												<CardDescription>
													{composition.board_name
														? `${composition.board_code ? composition.board_code + ' — ' : ''}${composition.board_name}`
														: 'Board of Studies'}
												</CardDescription>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Badge
												variant={composition.is_active ? 'default' : 'outline'}
												className={composition.is_active ? 'bg-green-600' : 'text-muted-foreground'}
											>
												{composition.is_active ? 'Active' : 'Inactive'}
											</Badge>
											{composition.ratified_by_gc ? (
												<Badge className="bg-blue-600">
													<CheckCircle2 className="h-3 w-3 mr-1" />
													GC Ratified
												</Badge>
											) : (
												<Badge variant="outline" className="text-amber-600 border-amber-300">
													Pending GC Ratification
												</Badge>
											)}
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
										<div>
											<p className="text-xs text-muted-foreground">Academic Year</p>
											<p className="text-sm font-medium">{composition.academic_year}</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground flex items-center gap-1">
												<CalendarRange className="h-3 w-3" /> Term Start
											</p>
											<p className="text-sm font-medium">{composition.term_start_date}</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground flex items-center gap-1">
												<CalendarRange className="h-3 w-3" /> Term End
											</p>
											<p className="text-sm font-medium">{composition.term_end_date}</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground">Ratified Date</p>
											<p className="text-sm font-medium">{composition.ratified_date || '-'}</p>
										</div>
									</div>
									{composition.notes && (
										<div className="mt-4 p-3 bg-muted rounded-lg">
											<p className="text-xs text-muted-foreground mb-1">Notes</p>
											<p className="text-sm">{composition.notes}</p>
										</div>
									)}
								</CardContent>
							</Card>

							{/* Members */}
							<Card>
								<CardHeader className="p-4">
									<div className="flex items-center gap-3">
										<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
											<Users className="h-4 w-4 text-white" />
										</div>
										<div>
											<CardTitle className="text-lg">Members</CardTitle>
											<CardDescription>
												{composition.members.length} member(s) constituted for this term
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="p-4 pt-0 space-y-6">
									{composition.members.length === 0 ? (
										<div className="text-center py-8 text-muted-foreground">
											<Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
											<p>No members recorded for this composition.</p>
										</div>
									) : (
										groupedMembers.map(group => (
											<div key={group.type}>
												<div className="flex items-center gap-2 mb-2">
													<Badge variant="secondary" className="text-xs">
														{memberTypeLabel(group.type)}
													</Badge>
													<span className="text-xs text-muted-foreground">{group.members.length}</span>
												</div>
												<div className="rounded-md border overflow-x-auto">
													<Table>
														<TableHeader className="bg-slate-50 dark:bg-slate-900/50">
															<TableRow>
																<TableHead className="text-xs">Name</TableHead>
																<TableHead className="text-xs">Designation</TableHead>
																<TableHead className="text-xs">Institution</TableHead>
																<TableHead className="text-xs">Contact</TableHead>
																<TableHead className="text-xs text-center">Source</TableHead>
																<TableHead className="text-xs text-center">Status</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{group.members.map(m => (
																<TableRow key={m.id}>
																	<TableCell className="text-sm font-medium">{m.display_name}</TableCell>
																	<TableCell className="text-sm">{m.display_designation || '-'}</TableCell>
																	<TableCell className="text-sm">{m.display_institution || '-'}</TableCell>
																	<TableCell className="text-sm">
																		<div className="flex flex-col gap-0.5">
																			{m.email && (
																				<span className="flex items-center gap-1 text-xs">
																					<Mail className="h-3 w-3 text-muted-foreground" />
																					{m.email}
																				</span>
																			)}
																			{m.contact_no && (
																				<span className="flex items-center gap-1 text-xs">
																					<Phone className="h-3 w-3 text-muted-foreground" />
																					{m.contact_no}
																				</span>
																			)}
																			{!m.email && !m.contact_no && '-'}
																		</div>
																	</TableCell>
																	<TableCell className="text-center">
																		<Badge variant="outline" className="text-xs">
																			{m.expert_id ? 'External' : 'Internal'}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-center">
																		<Badge
																			variant={m.is_active ? 'default' : 'outline'}
																			className={m.is_active ? 'bg-green-600 text-xs' : 'text-xs text-muted-foreground'}
																		>
																			{m.is_active ? 'Active' : 'Inactive'}
																		</Badge>
																	</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</div>
											</div>
										))
									)}
								</CardContent>
							</Card>

							{/* Meetings */}
							<Card>
								<CardHeader className="p-4">
									<div className="flex items-center gap-3">
										<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
											<ClipboardList className="h-4 w-4 text-white" />
										</div>
										<div>
											<CardTitle className="text-lg">Meetings</CardTitle>
											<CardDescription>
												{composition.meetings.length} meeting(s) held under this composition
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="p-4 pt-0">
									{composition.meetings.length === 0 ? (
										<div className="text-center py-8 text-muted-foreground">
											<ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
											<p>No meetings recorded for this composition.</p>
										</div>
									) : (
										<div className="rounded-md border overflow-x-auto">
											<Table>
												<TableHeader className="bg-slate-50 dark:bg-slate-900/50">
													<TableRow>
														<TableHead className="text-xs text-center">No.</TableHead>
														<TableHead className="text-xs">Title</TableHead>
														<TableHead className="text-xs">Academic Year</TableHead>
														<TableHead className="text-xs text-center">Type</TableHead>
														<TableHead className="text-xs text-center">Scheduled</TableHead>
														<TableHead className="text-xs text-center">Held</TableHead>
														<TableHead className="text-xs text-center">Status</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{composition.meetings.map(mt => (
														<TableRow key={mt.id}>
															<TableCell className="text-sm text-center">{mt.meeting_number}</TableCell>
															<TableCell className="text-sm">{mt.meeting_title || '-'}</TableCell>
															<TableCell className="text-sm">{mt.academic_year}</TableCell>
															<TableCell className="text-sm text-center capitalize">{mt.meeting_type}</TableCell>
															<TableCell className="text-sm text-center">{mt.scheduled_date || '-'}</TableCell>
															<TableCell className="text-sm text-center">{mt.actual_date || '-'}</TableCell>
															<TableCell className="text-center">
																<Badge variant="outline" className="text-xs">{meetingStatusLabel(mt.status)}</Badge>
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
					) : null}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}

export default function BosCompositionDetailPage() {
	return (
		<ProtectedRoute requiredRoles={['super_admin']} requireAnyRole>
			<BosCompositionDetailContent />
		</ProtectedRoute>
	)
}
