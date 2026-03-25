'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { useToast } from '@/hooks/common/use-toast'
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
import {
	Card,
	CardContent,
	CardHeader,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	FileText,
	Plus,
	Edit2,
	Trash2,
	Eye,
	Copy,
	Check,
	X,
	RefreshCw,
	Loader2,
	Calendar,
	Clock,
} from 'lucide-react'
import { usePdfSettings } from '@/lib/pdf/use-pdf-settings'
import {
	type PdfInstitutionSettings,
	type TemplateType,
	getWefStatus,
} from '@/types/pdf-settings'

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
	{ value: 'default', label: 'Default' },
	{ value: 'certificate', label: 'Certificate' },
	{ value: 'hallticket', label: 'Hall Ticket' },
	{ value: 'marksheet', label: 'Marksheet' },
	{ value: 'report', label: 'Report' },
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PdfSettingsPage() {
	const router = useRouter()
	const { hasPermission } = useAuth()
	const { toast } = useToast()

	// Permission checks - enabled by default for super_admin access
	const canEdit = true // hasPermission('pdf_settings.edit') || hasPermission('pdf_settings.update')
	const canDelete = true // hasPermission('pdf_settings.delete')
	const canCreate = true // hasPermission('pdf_settings.create') || hasPermission('pdf_settings.add')

	// PDF Settings hook
	const {
		allSettings,
		loading,
		error,
		fetchAllSettings,
		deleteSettings,
		toggleActive,
		duplicateSettings,
	} = usePdfSettings({ autoFetch: false })

	// Local state
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
	const [selectedSettings, setSelectedSettings] = useState<PdfInstitutionSettings | null>(null)
	const [selectedDuplicateType, setSelectedDuplicateType] = useState<TemplateType>('certificate')

	// ==========================================================================
	// DATA FETCHING
	// ==========================================================================

	useEffect(() => {
		fetchAllSettings()
	}, [])

	// ==========================================================================
	// HANDLERS
	// ==========================================================================

	const handleDelete = (settings: PdfInstitutionSettings) => {
		setSelectedSettings(settings)
		setDeleteDialogOpen(true)
	}

	const handleDuplicate = (settings: PdfInstitutionSettings) => {
		setSelectedSettings(settings)
		setDuplicateDialogOpen(true)
	}

	const confirmDelete = async () => {
		if (selectedSettings) {
			await deleteSettings(selectedSettings.id)
			setDeleteDialogOpen(false)
			setSelectedSettings(null)
		}
	}

	const confirmDuplicate = async () => {
		if (selectedSettings) {
			await duplicateSettings(selectedSettings.id, selectedDuplicateType)
			setDuplicateDialogOpen(false)
			setSelectedSettings(null)
		}
	}

	// ==========================================================================
	// RENDER
	// ==========================================================================

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
										<BreadcrumbPage>PDF Settings</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Error Alert */}
						{error && (
							<div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
								{error}
							</div>
						)}

						{/* Main Card */}
						<Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm rounded-2xl">
							<CardHeader className="flex-shrink-0 px-8 py-6 border-b border-slate-200">
								<div className="space-y-4">
									{/* Row 1: Title (Left) & Action Buttons (Right) */}
									<div className="flex items-center justify-between">
										{/* Title Section */}
										<div className="flex items-center gap-3">
											<div className="h-12 w-12 rounded-xl bg-[#0b6d41] flex items-center justify-center shadow-lg shadow-[#0b6d41]/30">
												<FileText className="h-6 w-6 text-white" />
											</div>
											<div>
												<h2 className="text-xl font-bold text-slate-900 font-grotesk dark:text-white">PDF Header Settings</h2>
												<p className="text-sm text-slate-600 dark:text-slate-400">
													Manage institution-wise PDF header and footer configurations
												</p>
											</div>
										</div>

										{/* Action Buttons */}
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={fetchAllSettings}
												disabled={loading}
												className="h-9 w-9 rounded-lg hover:bg-[#0b6d41]/10 text-[#0b6d41] hover:text-[#0b6d41] transition-colors border border-[#0b6d41]/30 p-0 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
												title="Refresh"
											>
												<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
											</Button>
											<Button
												size="sm"
												onClick={() => router.push('/master/pdf-settings/add')}
												disabled={loading || !canCreate}
												className="h-9 px-4 rounded-xl bg-[#0b6d41] hover:bg-[#095a36] text-white transition-all duration-200 shadow-lg shadow-[#0b6d41]/30 disabled:opacity-50 disabled:cursor-not-allowed"
												title={canCreate ? 'Add Settings' : "You don't have permission to add settings"}
											>
												<Plus className="h-4 w-4 mr-2" />
												Add Settings
											</Button>
										</div>
									</div>
								</div>
							</CardHeader>

							<CardContent className="flex-1 overflow-auto px-8 py-6 bg-slate-50/50 dark:bg-slate-900/50">
								{loading ? (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-8 w-8 animate-spin text-[#0b6d41]" />
									</div>
								) : allSettings.length === 0 ? (
									<div className="text-center py-12 text-slate-500 dark:text-slate-400">
										<div className="h-16 w-16 rounded-2xl bg-[#0b6d41]/10 flex items-center justify-center mx-auto mb-4">
											<FileText className="h-8 w-8 text-[#0b6d41]" />
										</div>
										<p className="font-medium">No PDF settings configured yet.</p>
										<p className="text-sm mt-1">Create your first settings to get started.</p>
										<Button
											variant="outline"
											className="mt-4 border-[#0b6d41]/30 text-[#0b6d41] hover:bg-[#0b6d41]/10"
											onClick={() => router.push('/master/pdf-settings/add')}
										>
											<Plus className="h-4 w-4 mr-2" />
											Create First Settings
										</Button>
									</div>
								) : (
									<div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
										<Table>
											<TableHeader className="bg-slate-50 border-b border-slate-200">
												<TableRow>
													<TableHead className="text-sm font-semibold text-slate-700">Institution</TableHead>
													<TableHead className="text-sm font-semibold text-slate-700">Template Name</TableHead>
													<TableHead className="text-sm font-semibold text-slate-700">Type</TableHead>
													<TableHead className="text-sm font-semibold text-slate-700">WEF Date & Time</TableHead>
													<TableHead className="text-sm font-semibold text-slate-700">Status</TableHead>
													<TableHead className="text-center text-sm font-semibold text-slate-700">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{allSettings.map((settings) => {
													const wefStatus = settings.wef_date && settings.wef_time ? getWefStatus(settings.wef_date, settings.wef_time) : 'active'
													return (
														<TableRow key={settings.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
															<TableCell>
																<div>
																	<div className="font-medium text-slate-900">{(settings as any).institution?.name || settings.institution_code}</div>
																	<div className="text-sm text-slate-500">{settings.institution_code}</div>
																</div>
															</TableCell>
															<TableCell>
																<div className="font-medium text-slate-900">{settings.template_name || '-'}</div>
															</TableCell>
															<TableCell>
																<Badge variant="outline" className="capitalize bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30">
																	{settings.template_type}
																</Badge>
															</TableCell>
															<TableCell>
																<div className="flex flex-col gap-1">
																	<div className="flex items-center gap-1.5 text-sm text-slate-700">
																		<Calendar className="h-3.5 w-3.5 text-slate-400" />
																		{settings.wef_date ? new Date(settings.wef_date).toLocaleDateString('en-IN') : '-'}
																	</div>
																	<div className="flex items-center gap-1.5 text-sm text-slate-500">
																		<Clock className="h-3.5 w-3.5 text-slate-400" />
																		{settings.wef_time || '00:00'}
																	</div>
																	<Badge className={`text-[10px] mt-1 w-fit ${
																		wefStatus === 'active' ? 'bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30' :
																		wefStatus === 'scheduled' ? 'bg-blue-100 text-blue-700 border-blue-200' :
																		'bg-slate-100 text-slate-500 border-slate-200'
																	}`}>
																		{wefStatus === 'active' ? 'Active Now' : wefStatus === 'scheduled' ? 'Scheduled' : 'Expired'}
																	</Badge>
																</div>
															</TableCell>
															<TableCell>
																<Badge className={`text-xs ${settings.active ? 'bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'}`}>
																	{settings.active ? (
																		<><Check className="h-3 w-3 mr-1" /> Active</>
																	) : (
																		<><X className="h-3 w-3 mr-1" /> Inactive</>
																	)}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																<div className="flex items-center justify-center gap-1">
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 w-8 p-0 rounded-lg hover:bg-[#0b6d41]/10 text-[#0b6d41] transition-colors"
																		onClick={() => toggleActive(settings.id)}
																		title={settings.active ? 'Deactivate' : 'Activate'}
																	>
																		{settings.active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
																	</Button>
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 w-8 p-0 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors dark:hover:bg-blue-900/20 dark:text-blue-400"
																		onClick={() => router.push(`/master/pdf-settings/view/${settings.id}`)}
																		title="View"
																	>
																		<Eye className="h-4 w-4" />
																	</Button>
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 w-8 p-0 rounded-lg hover:bg-[#ffde59]/30 text-[#b89f00] transition-colors"
																		onClick={() => handleDuplicate(settings)}
																		title="Duplicate"
																	>
																		<Copy className="h-4 w-4" />
																	</Button>
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 w-8 p-0 rounded-lg hover:bg-[#0b6d41]/10 text-[#0b6d41] transition-colors"
																		onClick={() => router.push(`/master/pdf-settings/edit/${settings.id}`)}
																		disabled={!canEdit}
																		title={canEdit ? 'Edit' : 'No permission to edit'}
																	>
																		<Edit2 className="h-4 w-4" />
																	</Button>
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 w-8 p-0 rounded-lg hover:bg-red-100 text-red-600 transition-colors dark:hover:bg-red-900/20 dark:text-red-400"
																		onClick={() => handleDelete(settings)}
																		disabled={!canDelete}
																		title={canDelete ? 'Delete' : 'No permission to delete'}
																	>
																		<Trash2 className="h-4 w-4" />
																	</Button>
																</div>
															</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />

				{/* Delete Confirmation Dialog */}
				<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<AlertDialogContent className="rounded-2xl">
						<AlertDialogHeader>
							<AlertDialogTitle>Delete PDF Settings?</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete the PDF settings for{' '}
								<strong>{selectedSettings?.institution_code}</strong> ({selectedSettings?.template_type})?
								This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 rounded-lg">
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{/* Duplicate Dialog */}
				<AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
					<AlertDialogContent className="rounded-2xl">
						<AlertDialogHeader>
							<AlertDialogTitle>Duplicate PDF Settings</AlertDialogTitle>
							<AlertDialogDescription>
								Create a copy of these settings for a different template type.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="py-4">
							<Label>New Template Type</Label>
							<Select value={selectedDuplicateType} onValueChange={(v) => setSelectedDuplicateType(v as TemplateType)}>
								<SelectTrigger className="mt-2">
									<SelectValue placeholder="Select template type" />
								</SelectTrigger>
								<SelectContent>
									{TEMPLATE_TYPES.filter((t) => t.value !== selectedSettings?.template_type).map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={confirmDuplicate} className="bg-[#0b6d41] hover:bg-[#095a36] rounded-lg">
								<Copy className="h-4 w-4 mr-2" />
								Duplicate
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</SidebarInset>
		</SidebarProvider>
	)
}
