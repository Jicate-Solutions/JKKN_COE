'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	FileText,
	ArrowLeft,
	Edit,
	Loader2,
	Layout,
	Type,
	FileSignature,
	Palette,
	Stamp,
	Calendar,
	Clock,
	Check,
	X,
} from 'lucide-react'
import { type PdfInstitutionSettings, getWefStatus } from '@/types/pdf-settings'

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ViewPdfSettingsPage() {
	const router = useRouter()
	const params = useParams()
	const { toast } = useToast()
	const [loading, setLoading] = useState(true)
	const [notFound, setNotFound] = useState(false)
	const [settings, setSettings] = useState<PdfInstitutionSettings | null>(null)
	const [activeTab, setActiveTab] = useState('basic')

	useEffect(() => {
		const fetchSettings = async () => {
			try {
				setLoading(true)
				const response = await fetch(`/api/pdf-settings/${params.id}`)

				if (!response.ok) {
					setNotFound(true)
					return
				}

				const data = await response.json()
				setSettings(data)
			} catch (error) {
				console.error('Error fetching PDF settings:', error)
				toast({
					title: '❌ Error',
					description: 'Failed to load PDF settings data.',
					variant: 'destructive',
					className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
				})
				setNotFound(true)
			} finally {
				setLoading(false)
			}
		}

		if (params.id) {
			fetchSettings()
		}
	}, [params.id, toast])

	const handleEdit = () => {
		router.push(`/master/pdf-settings/edit/${params.id}`)
	}

	const handleBack = () => {
		router.push('/master/pdf-settings')
	}

	// Tab styling - Brand colors: Primary Green #0b6d41
	const getTabStyle = (tabValue: string) => {
		const isActive = activeTab === tabValue
		const baseStyle = 'flex items-center gap-2 transition-all duration-200 font-medium rounded-lg px-3 py-2'
		return `${baseStyle} ${isActive ? 'bg-[#0b6d41] text-white shadow-lg shadow-[#0b6d41]/30' : 'text-[#0b6d41] hover:bg-[#0b6d41]/10 dark:text-green-400 dark:hover:bg-green-900/20'}`
	}

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 items-center justify-center">
							<div className="flex flex-col items-center gap-2">
								<Loader2 className="h-8 w-8 animate-spin text-[#0b6d41]" />
								<p className="text-sm text-muted-foreground">Loading PDF settings data...</p>
							</div>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	if (notFound || !settings) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 items-center justify-center">
							<div className="text-center">
								<div className="h-16 w-16 rounded-2xl bg-[#0b6d41]/10 flex items-center justify-center mx-auto mb-4">
									<FileText className="h-8 w-8 text-[#0b6d41]" />
								</div>
								<h2 className="text-2xl font-bold mb-2">PDF Settings Not Found</h2>
								<p className="text-muted-foreground mb-4">The PDF settings you're looking for doesn't exist.</p>
								<Button onClick={handleBack} className="bg-[#0b6d41] hover:bg-[#095a36]">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Back to PDF Settings
								</Button>
							</div>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	// Normalize wef_time for display (DB may store HH:mm:ss)
	const displayWefTime = settings.wef_time?.length > 5 ? settings.wef_time.slice(0, 5) : settings.wef_time
	const wefStatus = settings.wef_date && settings.wef_time ? getWefStatus(settings.wef_date, settings.wef_time) : 'active'

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
											<Link href="/master/pdf-settings">PDF Settings</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>View PDF Settings</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Main Card */}
						<Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm rounded-2xl">
							<CardHeader className="flex-shrink-0 px-8 py-6 border-b border-slate-200">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-12 w-12 rounded-xl bg-[#0b6d41] flex items-center justify-center shadow-lg shadow-[#0b6d41]/30">
											<FileText className="h-6 w-6 text-white" />
										</div>
										<div>
											<h1 className="text-2xl font-bold text-slate-900 font-grotesk tracking-tight dark:text-white">
												{settings.template_name}
											</h1>
											<p className="text-sm text-slate-600 mt-0.5 dark:text-slate-400">
												{(settings as any).institution?.name || settings.institution_code}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={handleBack}
											className="rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
										>
											<ArrowLeft className="h-4 w-4 mr-2" />
											Back to List
										</Button>
										<Button
											size="sm"
											onClick={handleEdit}
											className="rounded-xl bg-[#0b6d41] hover:bg-[#095a36] text-white shadow-lg shadow-[#0b6d41]/30 transition-all duration-200"
										>
											<Edit className="h-4 w-4 mr-2" />
											Edit
										</Button>
									</div>
								</div>
							</CardHeader>

							<CardContent className="flex-1 overflow-auto px-8 py-8 bg-slate-50/50 dark:bg-slate-900/50">
								<div className="max-w-5xl mx-auto">
									<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
										<TabsList className="grid w-full grid-cols-5 gap-2 bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-xl mb-6">
											<TabsTrigger value="basic" className={getTabStyle('basic')}>
												<Layout className="h-4 w-4" />
												<span className="hidden sm:inline">Basic</span>
											</TabsTrigger>
											<TabsTrigger value="header" className={getTabStyle('header')}>
												<Type className="h-4 w-4" />
												<span className="hidden sm:inline">Header</span>
											</TabsTrigger>
											<TabsTrigger value="footer" className={getTabStyle('footer')}>
												<FileSignature className="h-4 w-4" />
												<span className="hidden sm:inline">Footer</span>
											</TabsTrigger>
											<TabsTrigger value="style" className={getTabStyle('style')}>
												<Palette className="h-4 w-4" />
												<span className="hidden sm:inline">Style</span>
											</TabsTrigger>
											<TabsTrigger value="watermark" className={getTabStyle('watermark')}>
												<Stamp className="h-4 w-4" />
												<span className="hidden sm:inline">Watermark</span>
											</TabsTrigger>
										</TabsList>

										{/* Basic Tab */}
										<TabsContent value="basic" className="space-y-6">
											{/* Template Identification Section */}
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-[#0b6d41]/10 flex items-center justify-center">
														<Layout className="h-4 w-4 text-[#0b6d41]" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Template Identification</h2>
												</div>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Institution</Label>
														<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={(settings as any).institution?.name || settings.institution_code || ''} />
													</div>
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Template Name</Label>
														<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.template_name || ''} />
													</div>
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Template Type</Label>
														<div>
															<Badge variant="outline" className="capitalize bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30">
																{settings.template_type}
															</Badge>
														</div>
													</div>
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
															<Calendar className="h-4 w-4 text-[#0b6d41]" />
															WEF (With Effect From)
														</Label>
														<div className="flex items-center gap-4">
															<div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
																<Calendar className="h-3.5 w-3.5 text-slate-400" />
																{settings.wef_date ? new Date(settings.wef_date).toLocaleDateString('en-IN') : '-'}
															</div>
															<div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
																<Clock className="h-3.5 w-3.5 text-slate-400" />
																{displayWefTime || '00:00'}
															</div>
															<Badge className={`text-xs ${
																wefStatus === 'active' ? 'bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30' :
																wefStatus === 'scheduled' ? 'bg-blue-100 text-blue-700 border-blue-200' :
																'bg-slate-100 text-slate-500 border-slate-200'
															}`}>
																{wefStatus === 'active' ? 'Active Now' : wefStatus === 'scheduled' ? 'Scheduled' : 'Expired'}
															</Badge>
														</div>
													</div>
												</div>
											</div>

											{/* Document Configuration Section */}
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
														<FileText className="h-4 w-4 text-blue-700 dark:text-blue-400" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Document Configuration</h2>
												</div>
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Paper Size</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.paper_size || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Orientation</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.orientation || ''} />
														</div>
													</div>

													<div className="grid grid-cols-4 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Top</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.margin_top || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Bottom</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.margin_bottom || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Left</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.margin_left || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Right</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.margin_right || ''} />
														</div>
													</div>

													<div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</Label>
														<Badge className={`text-xs ${settings.active ? 'bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/30' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'}`}>
															{settings.active ? (
																<><Check className="h-3 w-3 mr-1" /> Active</>
															) : (
																<><X className="h-3 w-3 mr-1" /> Inactive</>
															)}
														</Badge>
													</div>
												</div>
											</div>
										</TabsContent>

										{/* Header Tab */}
										<TabsContent value="header" className="space-y-6">
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-[#0b6d41]/10 flex items-center justify-center">
														<Type className="h-4 w-4 text-[#0b6d41]" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Header Configuration</h2>
												</div>
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo URL</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.logo_url || ''} />
														</div>
														<div className="grid grid-cols-2 gap-2">
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo Width</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.logo_width || ''} />
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo Height</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.logo_height || ''} />
															</div>
														</div>
													</div>

													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Secondary Logo URL</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.secondary_logo_url || ''} />
														</div>
														<div className="grid grid-cols-2 gap-2">
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Width</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.secondary_logo_width || ''} />
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Height</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.secondary_logo_height || ''} />
															</div>
														</div>
													</div>

													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Header HTML Template</Label>
														<div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
															{settings.header_html || <span className="text-slate-400">No header HTML configured</span>}
														</div>
													</div>

													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Header Height</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.header_height || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Header Background</Label>
															<div className="flex gap-2">
																<div
																	className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																	style={{ backgroundColor: settings.header_background_color }}
																/>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.header_background_color || ''} />
															</div>
														</div>
													</div>
												</div>
											</div>
										</TabsContent>

										{/* Footer Tab */}
										<TabsContent value="footer" className="space-y-6">
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-[#0b6d41]/10 flex items-center justify-center">
														<FileSignature className="h-4 w-4 text-[#0b6d41]" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Footer Configuration</h2>
												</div>
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer HTML Template</Label>
														<div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
															{settings.footer_html || <span className="text-slate-400">No footer HTML configured</span>}
														</div>
													</div>

													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer Height</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.footer_height || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer Background</Label>
															<div className="flex gap-2">
																<div
																	className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																	style={{ backgroundColor: settings.footer_background_color }}
																/>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.footer_background_color || ''} />
															</div>
														</div>
													</div>

													{/* Page Numbering */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400">Page Numbering</h4>
														<div className="flex items-center gap-3">
															<Badge className={settings.page_numbering_enabled ? 'bg-[#0b6d41]/10 text-[#0b6d41]' : 'bg-slate-100 text-slate-500'}>
																{settings.page_numbering_enabled ? 'Enabled' : 'Disabled'}
															</Badge>
														</div>
														<div className="grid grid-cols-2 gap-4">
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Format</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.page_numbering_format || ''} />
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Position</Label>
																<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.page_numbering_position || ''} />
															</div>
														</div>
													</div>

													{/* Signature Section */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400">Signature Section</h4>
														<div className="flex items-center gap-3">
															<Badge className={settings.signature_section_enabled ? 'bg-[#0b6d41]/10 text-[#0b6d41]' : 'bg-slate-100 text-slate-500'}>
																{settings.signature_section_enabled ? 'Enabled' : 'Disabled'}
															</Badge>
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Signature Labels</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={(settings.signature_labels || []).join(', ')} />
														</div>
													</div>
												</div>
											</div>
										</TabsContent>

										{/* Style Tab */}
										<TabsContent value="style" className="space-y-6">
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-[#0b6d41]/10 flex items-center justify-center">
														<Palette className="h-4 w-4 text-[#0b6d41]" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Typography & Colors</h2>
												</div>
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Font Family</Label>
														<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.font_family || ''} />
													</div>

													<div className="grid grid-cols-3 gap-4">
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Heading Size</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.font_size_heading || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subheading Size</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.font_size_subheading || ''} />
														</div>
														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Body Size</Label>
															<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.font_size_body || ''} />
														</div>
													</div>

													{/* Color Scheme */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400 mb-4">Color Scheme</h4>
														<div className="grid grid-cols-2 gap-4">
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Primary Color</Label>
																<div className="flex gap-2">
																	<div
																		className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																		style={{ backgroundColor: settings.primary_color }}
																	/>
																	<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.primary_color || ''} />
																</div>
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Secondary Color</Label>
																<div className="flex gap-2">
																	<div
																		className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																		style={{ backgroundColor: settings.secondary_color }}
																	/>
																	<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.secondary_color || ''} />
																</div>
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Accent Color</Label>
																<div className="flex gap-2">
																	<div
																		className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																		style={{ backgroundColor: settings.accent_color }}
																	/>
																	<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.accent_color || ''} />
																</div>
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Border Color</Label>
																<div className="flex gap-2">
																	<div
																		className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600"
																		style={{ backgroundColor: settings.border_color }}
																	/>
																	<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.border_color || ''} />
																</div>
															</div>
														</div>
													</div>
												</div>
											</div>
										</TabsContent>

										{/* Watermark Tab */}
										<TabsContent value="watermark" className="space-y-6">
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="h-8 w-8 rounded-lg bg-[#0b6d41]/10 flex items-center justify-center">
														<Stamp className="h-4 w-4 text-[#0b6d41]" />
													</div>
													<h2 className="text-lg font-semibold text-slate-900 font-grotesk dark:text-white">Watermark Configuration</h2>
												</div>
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
													<div className="flex items-center gap-3">
														<Badge className={settings.watermark_enabled ? 'bg-[#0b6d41]/10 text-[#0b6d41]' : 'bg-slate-100 text-slate-500'}>
															{settings.watermark_enabled ? 'Enabled' : 'Disabled'}
														</Badge>
													</div>

													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Watermark Image URL</Label>
														<Input disabled className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700" value={settings.watermark_url || ''} />
													</div>

													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Opacity</Label>
														<div className="flex items-center gap-4">
															<div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
																<div
																	className="h-full bg-[#0b6d41] rounded-full"
																	style={{ width: `${(settings.watermark_opacity || 0.1) * 100}%` }}
																/>
															</div>
															<span className="text-sm font-medium text-[#0b6d41] bg-[#0b6d41]/10 dark:text-green-400 dark:bg-green-900/20 px-2 py-0.5 rounded">
																{((settings.watermark_opacity || 0.1) * 100).toFixed(0)}%
															</span>
														</div>
													</div>
												</div>
											</div>
										</TabsContent>
									</Tabs>
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
