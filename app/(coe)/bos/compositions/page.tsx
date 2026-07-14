'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/protected-route'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import {
	CheckCircle2,
	ChevronRight,
	Loader2,
	Search,
	ShieldCheck,
	Users
} from 'lucide-react'

interface CompositionRow {
	id: string
	board_id: string
	composition_title: string
	term_start_date: string
	term_end_date: string
	academic_year: string
	is_active: boolean
	ratified_by_gc: boolean
	board_code: string | null
	board_name: string | null
	member_count: number
}

function BosCompositionsContent() {
	const { toast } = useToast()
	const {
		isReady,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		institutionId
	} = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()

	const [selectedInstitution, setSelectedInstitution] = useState('')
	const [compositions, setCompositions] = useState<CompositionRow[]>([])
	const [loading, setLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')

	useEffect(() => {
		if (!isReady) return
		if (mustSelectInstitution) {
			setSelectedInstitution('')
			return
		}
		const autoId = getInstitutionIdForCreate()
		if (autoId) setSelectedInstitution(autoId)
	}, [isReady, mustSelectInstitution, institutionId, getInstitutionIdForCreate]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (selectedInstitution) {
			fetchCompositions(selectedInstitution)
		} else {
			setCompositions([])
		}
	}, [selectedInstitution])

	const fetchCompositions = async (instId: string) => {
		try {
			setLoading(true)
			const res = await fetch(`/api/bos/compositions?institutionId=${instId}`)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch compositions')
			}
			setCompositions(await res.json())
		} catch (e) {
			console.error('Failed to fetch compositions:', e)
			toast({
				title: 'Load Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch compositions',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	const filtered = compositions.filter(c => {
		const s = searchTerm.toLowerCase()
		return (
			c.composition_title.toLowerCase().includes(s) ||
			(c.board_name || '').toLowerCase().includes(s) ||
			(c.board_code || '').toLowerCase().includes(s) ||
			c.academic_year.toLowerCase().includes(s)
		)
	})

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>BoS Compositions</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center">
							<ShieldCheck className="h-5 w-5 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold">BoS Compositions</h1>
							<p className="text-sm text-muted-foreground">
								Board of Studies constitutions per board and term (super admin only)
							</p>
						</div>
					</div>

					{mustSelectInstitution && (
						<Card>
							<CardContent className="p-4">
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div className="space-y-2">
										<Label>Institution *</Label>
										<Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
											<SelectTrigger>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{availableInstitutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.institution_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					<Card>
						<CardHeader className="p-4">
							<div className="flex items-center justify-between flex-wrap gap-2">
								<div>
									<CardTitle className="text-lg">Constituted Boards</CardTitle>
									<CardDescription>{compositions.length} composition(s)</CardDescription>
								</div>
								<div className="relative">
									<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										placeholder="Search..."
										className="pl-7 h-8 w-48 text-xs"
									/>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-0">
							{!selectedInstitution ? (
								<div className="text-center py-8 text-muted-foreground">
									<ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
									<p>Select an institution to view BoS compositions.</p>
								</div>
							) : loading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin mr-2" />
									<span>Loading compositions...</span>
								</div>
							) : filtered.length === 0 ? (
								<div className="text-center py-8 text-muted-foreground">
									<ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
									<p>{searchTerm ? 'No matching compositions.' : 'No BoS compositions found for this institution.'}</p>
								</div>
							) : (
								<div className="rounded-md border overflow-x-auto">
									<Table>
										<TableHeader className="bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="text-xs">Composition</TableHead>
												<TableHead className="text-xs">Board</TableHead>
												<TableHead className="text-xs">Academic Year</TableHead>
												<TableHead className="text-xs text-center">Term</TableHead>
												<TableHead className="text-xs text-center">Members</TableHead>
												<TableHead className="text-xs text-center">GC Ratified</TableHead>
												<TableHead className="text-xs text-center">Status</TableHead>
												<TableHead className="text-xs text-center w-[80px]"></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filtered.map(c => (
												<TableRow key={c.id}>
													<TableCell className="text-sm font-medium">{c.composition_title}</TableCell>
													<TableCell className="text-sm">
														{c.board_name ? (
															<span>{c.board_code ? `${c.board_code} — ` : ''}{c.board_name}</span>
														) : '-'}
													</TableCell>
													<TableCell className="text-sm">{c.academic_year}</TableCell>
													<TableCell className="text-sm text-center">
														{c.term_start_date} → {c.term_end_date}
													</TableCell>
													<TableCell className="text-center">
														<Badge variant="outline" className="text-xs">
															<Users className="h-3 w-3 mr-1" />
															{c.member_count}
														</Badge>
													</TableCell>
													<TableCell className="text-center">
														{c.ratified_by_gc ? (
															<CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</TableCell>
													<TableCell className="text-center">
														<Badge
															variant={c.is_active ? 'default' : 'outline'}
															className={c.is_active ? 'bg-green-600 text-xs' : 'text-xs text-muted-foreground'}
														>
															{c.is_active ? 'Active' : 'Inactive'}
														</Badge>
													</TableCell>
													<TableCell className="text-center">
														<Button variant="ghost" size="sm" className="h-7 px-2" asChild>
															<Link href={`/bos/compositions/${c.id}`}>
																View
																<ChevronRight className="h-3 w-3 ml-1" />
															</Link>
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
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}

export default function BosCompositionsPage() {
	return (
		<ProtectedRoute requiredRoles={['super_admin']} requireAnyRole>
			<BosCompositionsContent />
		</ProtectedRoute>
	)
}
