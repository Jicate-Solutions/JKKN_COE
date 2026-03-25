'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import {
	FileText,
	ArrowLeft,
	Layout,
	Type,
	FileSignature,
	Palette,
	Stamp,
	Calendar,
	Code,
	PenTool,
	Loader2,
	Eye,
	X,
} from 'lucide-react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { LogoUpload } from '@/components/ui/logo-upload'
import { usePdfSettingsForm } from '@/lib/pdf/use-pdf-settings'
import {
	type TemplateType,
	type PaperSize,
	type Orientation,
	type PageNumberPosition,
	DEFAULT_PDF_SETTINGS,
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

const PAPER_SIZES: { value: PaperSize; label: string }[] = [
	{ value: 'A4', label: 'A4 (210 x 297 mm)' },
	{ value: 'Letter', label: 'Letter (8.5 x 11 in)' },
	{ value: 'Legal', label: 'Legal (8.5 x 14 in)' },
]

const ORIENTATIONS: { value: Orientation; label: string }[] = [
	{ value: 'portrait', label: 'Portrait' },
	{ value: 'landscape', label: 'Landscape' },
]

const PAGE_NUMBER_POSITIONS: { value: PageNumberPosition; label: string }[] = [
	{ value: 'top-left', label: 'Top Left' },
	{ value: 'top-center', label: 'Top Center' },
	{ value: 'top-right', label: 'Top Right' },
	{ value: 'bottom-left', label: 'Bottom Left' },
	{ value: 'bottom-center', label: 'Bottom Center' },
	{ value: 'bottom-right', label: 'Bottom Right' },
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AddPdfSettingsPage() {
	const router = useRouter()
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)
	const [institutions, setInstitutions] = useState<any[]>([])
	const [activeTab, setActiveTab] = useState('basic')
	const [headerEditorMode, setHeaderEditorMode] = useState<'visual' | 'html'>('visual')
	const [footerEditorMode, setFooterEditorMode] = useState<'visual' | 'html'>('visual')
	const [previewLoading, setPreviewLoading] = useState(false)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [showPreview, setShowPreview] = useState(false)

	// Form hook
	const { formData, setFormData, updateField, errors, validate } = usePdfSettingsForm()

	// Initialize with defaults
	useEffect(() => {
		setFormData({ ...DEFAULT_PDF_SETTINGS, institution_code: '' })
		fetchInstitutions()
	}, [])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (err) {
			console.error('Failed to fetch institutions:', err)
		}
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please fix all validation errors before saving.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
			return
		}

		try {
			setLoading(true)
			const response = await fetch('/api/pdf-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to create PDF settings')
			}

			const newSettings = await response.json()

			toast({
				title: '✅ PDF Settings Created',
				description: `Template "${newSettings.template_name}" has been successfully created.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})

			router.push('/master/pdf-settings')
		} catch (error) {
			console.error('Error creating PDF settings:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to create PDF settings. Please try again.'
			toast({
				title: '❌ Save Failed',
				description: errorMessage,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setLoading(false)
		}
	}

	const handleCancel = () => {
		router.push('/master/pdf-settings')
	}

	const handlePreview = async () => {
		try {
			setPreviewLoading(true)
			const response = await fetch('/api/pdf-settings/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					settings: formData,
					sample_data: {
						institution_name: institutions.find(i => i.institution_code === formData.institution_code)?.name || 'Sample Institution',
						exam_name: 'End Semester Examination - December 2025',
						student_name: 'Sample Student',
						register_number: '2024001234',
					},
				}),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to generate preview')
			}

			const data = await response.json()
			setPreviewUrl(data.preview_url)
			setShowPreview(true)

			toast({
				title: '✅ Preview Generated',
				description: 'PDF preview has been generated successfully.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})
		} catch (error) {
			console.error('Preview error:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate preview'
			toast({
				title: '❌ Preview Failed',
				description: errorMessage,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setPreviewLoading(false)
		}
	}

	// Tab styling - Brand colors: Primary Green #0b6d41, Secondary Yellow #ffde59
	const getTabStyle = (tabValue: string) => {
		const isActive = activeTab === tabValue
		const baseStyle = 'flex items-center gap-2 transition-all duration-200 font-medium rounded-lg px-3 py-2'
		return `${baseStyle} ${isActive ? 'bg-[#0b6d41] text-white shadow-lg shadow-[#0b6d41]/30' : 'text-[#0b6d41] hover:bg-[#0b6d41]/10 dark:text-green-400 dark:hover:bg-green-900/20'}`
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
											<Link href="/master/pdf-settings">PDF Settings</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Add PDF Settings</BreadcrumbPage>
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
												Add PDF Settings
											</h1>
											<p className="text-sm text-slate-600 mt-0.5 dark:text-slate-400">
												Create a new PDF template configuration
											</p>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={handleCancel}
										className="rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
									>
										<ArrowLeft className="h-4 w-4 mr-2" />
										Back to List
									</Button>
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
														<Label htmlFor="institution_code" className="text-sm font-medium text-slate-700 dark:text-slate-300">
															Institution <span className="text-red-500">*</span>
														</Label>
														<Select
															value={formData.institution_code}
															onValueChange={(v) => updateField('institution_code', v)}
														>
															<SelectTrigger className={`h-10 rounded-lg ${errors.institution_code ? 'border-red-500' : 'border-slate-300'}`}>
																<SelectValue placeholder="Select institution" />
															</SelectTrigger>
															<SelectContent>
																{institutions.map((inst) => (
																	<SelectItem key={inst.id} value={inst.institution_code}>
																		{inst.name} ({inst.institution_code})
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														{errors.institution_code && (
															<p className="text-sm text-red-500">{errors.institution_code}</p>
														)}
													</div>

													<div className="space-y-2">
														<Label htmlFor="template_name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
															Template Name <span className="text-red-500">*</span>
														</Label>
														<Input
															value={formData.template_name || ''}
															onChange={(e) => updateField('template_name', e.target.value)}
															placeholder="e.g., Hallticket_Dec2025, Marksheet_R2021"
															className={`h-10 rounded-lg ${errors.template_name ? 'border-red-500' : 'border-slate-300'}`}
														/>
														{errors.template_name && (
															<p className="text-sm text-red-500">{errors.template_name}</p>
														)}
														<p className="text-xs text-slate-500">
															Unique identifier for this template. Used to resolve templates during PDF generation.
														</p>
													</div>

													<div className="space-y-2">
														<Label htmlFor="template_type" className="text-sm font-medium text-slate-700 dark:text-slate-300">Template Type</Label>
														<Select
															value={formData.template_type}
															onValueChange={(v) => updateField('template_type', v as TemplateType)}
														>
															<SelectTrigger className="h-10 rounded-lg border-slate-300">
																<SelectValue placeholder="Select template type" />
															</SelectTrigger>
															<SelectContent>
																{TEMPLATE_TYPES.map((type) => (
																	<SelectItem key={type.value} value={type.value}>
																		{type.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<p className="text-xs text-slate-500">
															Multiple templates with the same type are allowed for different WEF dates.
														</p>
													</div>

													<div className="space-y-2">
														<Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
															<Calendar className="h-4 w-4 text-[#0b6d41]" />
															WEF (With Effect From)
														</Label>
														<div className="grid grid-cols-2 gap-2">
															<Input
																type="date"
																value={formData.wef_date || ''}
																onChange={(e) => updateField('wef_date', e.target.value)}
																className="h-10 rounded-lg border-slate-300"
															/>
															<Input
																type="time"
																value={formData.wef_time || '00:00'}
																onChange={(e) => updateField('wef_time', e.target.value)}
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<p className="text-xs text-slate-500">
															Template becomes active from this date and time. Most recent active template is used.
														</p>
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
															<Label htmlFor="paper_size" className="text-sm font-medium text-slate-700 dark:text-slate-300">Paper Size</Label>
															<Select
																value={formData.paper_size}
																onValueChange={(v) => updateField('paper_size', v as PaperSize)}
															>
																<SelectTrigger className="h-10 rounded-lg border-slate-300">
																	<SelectValue placeholder="Select paper size" />
																</SelectTrigger>
																<SelectContent>
																	{PAPER_SIZES.map((size) => (
																		<SelectItem key={size.value} value={size.value}>
																			{size.label}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>

														<div className="space-y-2">
															<Label htmlFor="orientation" className="text-sm font-medium text-slate-700 dark:text-slate-300">Orientation</Label>
															<Select
																value={formData.orientation}
																onValueChange={(v) => updateField('orientation', v as Orientation)}
															>
																<SelectTrigger className="h-10 rounded-lg border-slate-300">
																	<SelectValue placeholder="Select orientation" />
																</SelectTrigger>
																<SelectContent>
																	{ORIENTATIONS.map((orient) => (
																		<SelectItem key={orient.value} value={orient.value}>
																			{orient.label}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>
													</div>

													<div className="grid grid-cols-4 gap-4">
														<div className="space-y-2">
															<Label htmlFor="margin_top" className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Top</Label>
															<Input
																value={formData.margin_top}
																onChange={(e) => updateField('margin_top', e.target.value)}
																placeholder="20mm"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="margin_bottom" className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Bottom</Label>
															<Input
																value={formData.margin_bottom}
																onChange={(e) => updateField('margin_bottom', e.target.value)}
																placeholder="20mm"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="margin_left" className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Left</Label>
															<Input
																value={formData.margin_left}
																onChange={(e) => updateField('margin_left', e.target.value)}
																placeholder="15mm"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="margin_right" className="text-sm font-medium text-slate-700 dark:text-slate-300">Margin Right</Label>
															<Input
																value={formData.margin_right}
																onChange={(e) => updateField('margin_right', e.target.value)}
																placeholder="15mm"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
													</div>

													<div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
														<Switch
															id="active"
															checked={formData.active}
															onCheckedChange={(v) => updateField('active', v)}
														/>
														<Label htmlFor="active" className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</Label>
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
												<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-6">
													{/* Primary Logo */}
													<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
														<LogoUpload
															value={formData.logo_url || ''}
															onChange={(url) => updateField('logo_url', url)}
															institutionCode={formData.institution_code}
															logoType="primary"
															label="Primary Logo (Left)"
															placeholder="/jkkn_logo.png or https://..."
														/>
														<div className="space-y-4">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo Dimensions</Label>
															<div className="grid grid-cols-2 gap-3">
																<div className="space-y-2">
																	<Label htmlFor="logo_width" className="text-xs text-slate-500">Width</Label>
																	<Input
																		value={formData.logo_width}
																		onChange={(e) => updateField('logo_width', e.target.value)}
																		placeholder="60px"
																		className="h-10 rounded-lg border-slate-300"
																	/>
																</div>
																<div className="space-y-2">
																	<Label htmlFor="logo_height" className="text-xs text-slate-500">Height</Label>
																	<Input
																		value={formData.logo_height}
																		onChange={(e) => updateField('logo_height', e.target.value)}
																		placeholder="60px"
																		className="h-10 rounded-lg border-slate-300"
																	/>
																</div>
															</div>
														</div>
													</div>

													{/* Secondary Logo */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-6">
														<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
															<LogoUpload
																value={formData.secondary_logo_url || ''}
																onChange={(url) => updateField('secondary_logo_url', url)}
																institutionCode={formData.institution_code}
																logoType="secondary"
																label="Secondary Logo (Right)"
																placeholder="/jkkn_logo.png or https://..."
															/>
															<div className="space-y-4">
																<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Secondary Logo Dimensions</Label>
																<div className="grid grid-cols-2 gap-3">
																	<div className="space-y-2">
																		<Label htmlFor="secondary_logo_width" className="text-xs text-slate-500">Width</Label>
																		<Input
																			value={formData.secondary_logo_width}
																			onChange={(e) => updateField('secondary_logo_width', e.target.value)}
																			placeholder="60px"
																			className="h-10 rounded-lg border-slate-300"
																		/>
																	</div>
																	<div className="space-y-2">
																		<Label htmlFor="secondary_logo_height" className="text-xs text-slate-500">Height</Label>
																		<Input
																			value={formData.secondary_logo_height}
																			onChange={(e) => updateField('secondary_logo_height', e.target.value)}
																			placeholder="60px"
																			className="h-10 rounded-lg border-slate-300"
																		/>
																	</div>
																</div>
															</div>
														</div>
													</div>

													{/* Header HTML Editor */}
													<div className="space-y-3">
														<div className="flex items-center justify-between">
															<Label htmlFor="header_html" className="text-sm font-medium text-slate-700 dark:text-slate-300">Header HTML Template</Label>
															<div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() => setHeaderEditorMode('visual')}
																	className={`h-8 px-3 rounded-md text-xs font-medium transition-all ${
																		headerEditorMode === 'visual'
																			? 'bg-[#0b6d41] text-white shadow-sm'
																			: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600'
																	}`}
																>
																	<PenTool className="h-3.5 w-3.5 mr-1.5" />
																	Visual
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() => setHeaderEditorMode('html')}
																	className={`h-8 px-3 rounded-md text-xs font-medium transition-all ${
																		headerEditorMode === 'html'
																			? 'bg-[#0b6d41] text-white shadow-sm'
																			: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600'
																	}`}
																>
																	<Code className="h-3.5 w-3.5 mr-1.5" />
																	HTML
																</Button>
															</div>
														</div>

														{headerEditorMode === 'visual' ? (
															<RichTextEditor
																value={formData.header_html || ''}
																onChange={(html) => updateField('header_html', html)}
																placeholder="Design your header content here..."
																minHeight="200px"
																institutionCode={formData.institution_code}
															/>
														) : (
															<Textarea
																value={formData.header_html || ''}
																onChange={(e) => updateField('header_html', e.target.value)}
																placeholder="Enter HTML template for header..."
																rows={10}
																className="font-mono text-sm bg-slate-900 text-green-400 dark:bg-slate-950"
															/>
														)}
														<p className="text-xs text-[#0b6d41] dark:text-green-400">
															Placeholders: {'{{institution_name}}'}, {'{{institution_code}}'}, {'{{exam_name}}'}, {'{{date}}'}, {'{{logo_url}}'}, {'{{primary_color}}'}
														</p>
													</div>

													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label htmlFor="header_height" className="text-sm font-medium text-slate-700 dark:text-slate-300">Header Height</Label>
															<Input
																value={formData.header_height}
																onChange={(e) => updateField('header_height', e.target.value)}
																placeholder="80px"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="header_background_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Header Background</Label>
															<div className="flex gap-2">
																<Input
																	type="color"
																	value={formData.header_background_color}
																	onChange={(e) => updateField('header_background_color', e.target.value)}
																	className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																/>
																<Input
																	value={formData.header_background_color}
																	onChange={(e) => updateField('header_background_color', e.target.value)}
																	placeholder="#ffffff"
																	className="h-10 rounded-lg border-slate-300"
																/>
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
													{/* Footer HTML Editor */}
													<div className="space-y-3">
														<div className="flex items-center justify-between">
															<Label htmlFor="footer_html" className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer HTML Template</Label>
															<div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() => setFooterEditorMode('visual')}
																	className={`h-8 px-3 rounded-md text-xs font-medium transition-all ${
																		footerEditorMode === 'visual'
																			? 'bg-[#0b6d41] text-white shadow-sm'
																			: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600'
																	}`}
																>
																	<PenTool className="h-3.5 w-3.5 mr-1.5" />
																	Visual
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() => setFooterEditorMode('html')}
																	className={`h-8 px-3 rounded-md text-xs font-medium transition-all ${
																		footerEditorMode === 'html'
																			? 'bg-[#0b6d41] text-white shadow-sm'
																			: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600'
																	}`}
																>
																	<Code className="h-3.5 w-3.5 mr-1.5" />
																	HTML
																</Button>
															</div>
														</div>

														{footerEditorMode === 'visual' ? (
															<RichTextEditor
																value={formData.footer_html || ''}
																onChange={(html) => updateField('footer_html', html)}
																placeholder="Design your footer content here..."
																minHeight="150px"
																institutionCode={formData.institution_code}
															/>
														) : (
															<Textarea
																value={formData.footer_html || ''}
																onChange={(e) => updateField('footer_html', e.target.value)}
																placeholder="Enter HTML template for footer..."
																rows={8}
																className="font-mono text-sm bg-slate-900 text-green-400 dark:bg-slate-950"
															/>
														)}
														<p className="text-xs text-[#0b6d41] dark:text-green-400">
															Placeholders: {'{{page_number}}'}, {'{{total_pages}}'}, {'{{generation_date}}'}, {'{{institution_name}}'}
														</p>
													</div>

													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label htmlFor="footer_height" className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer Height</Label>
															<Input
																value={formData.footer_height}
																onChange={(e) => updateField('footer_height', e.target.value)}
																placeholder="40px"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="footer_background_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Footer Background</Label>
															<div className="flex gap-2">
																<Input
																	type="color"
																	value={formData.footer_background_color}
																	onChange={(e) => updateField('footer_background_color', e.target.value)}
																	className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																/>
																<Input
																	value={formData.footer_background_color}
																	onChange={(e) => updateField('footer_background_color', e.target.value)}
																	placeholder="#ffffff"
																	className="h-10 rounded-lg border-slate-300"
																/>
															</div>
														</div>
													</div>

													{/* Page Numbering */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400">Page Numbering</h4>
														<div className="flex items-center gap-3">
															<Switch
																id="page_numbering_enabled"
																checked={formData.page_numbering_enabled}
																onCheckedChange={(v) => updateField('page_numbering_enabled', v)}
															/>
															<Label htmlFor="page_numbering_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Page Numbers</Label>
														</div>

														<div className="grid grid-cols-2 gap-4">
															<div className="space-y-2">
																<Label htmlFor="page_numbering_format" className="text-sm font-medium text-slate-700 dark:text-slate-300">Format</Label>
																<Input
																	value={formData.page_numbering_format}
																	onChange={(e) => updateField('page_numbering_format', e.target.value)}
																	placeholder="Page {page} of {total}"
																	disabled={!formData.page_numbering_enabled}
																	className="h-10 rounded-lg border-slate-300"
																/>
															</div>
															<div className="space-y-2">
																<Label htmlFor="page_numbering_position" className="text-sm font-medium text-slate-700 dark:text-slate-300">Position</Label>
																<Select
																	value={formData.page_numbering_position}
																	onValueChange={(v) => updateField('page_numbering_position', v as PageNumberPosition)}
																	disabled={!formData.page_numbering_enabled}
																>
																	<SelectTrigger className="h-10 rounded-lg border-slate-300">
																		<SelectValue placeholder="Select position" />
																	</SelectTrigger>
																	<SelectContent>
																		{PAGE_NUMBER_POSITIONS.map((pos) => (
																			<SelectItem key={pos.value} value={pos.value}>
																				{pos.label}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														</div>
													</div>

													{/* Signature Section */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400">Signature Section</h4>
														<div className="flex items-center gap-3">
															<Switch
																id="signature_section_enabled"
																checked={formData.signature_section_enabled}
																onCheckedChange={(v) => updateField('signature_section_enabled', v)}
															/>
															<Label htmlFor="signature_section_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Signature Section</Label>
														</div>

														<div className="space-y-2">
															<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Signature Labels (comma-separated)</Label>
															<Input
																value={(formData.signature_labels || []).join(', ')}
																onChange={(e) => updateField('signature_labels', e.target.value.split(',').map((s) => s.trim()))}
																placeholder="Prepared by, Verified by, Controller of Examinations"
																disabled={!formData.signature_section_enabled}
																className="h-10 rounded-lg border-slate-300"
															/>
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
														<Label htmlFor="font_family" className="text-sm font-medium text-slate-700 dark:text-slate-300">Font Family</Label>
														<Input
															value={formData.font_family}
															onChange={(e) => updateField('font_family', e.target.value)}
															placeholder="Times New Roman, serif"
															className="h-10 rounded-lg border-slate-300"
														/>
													</div>

													<div className="grid grid-cols-3 gap-4">
														<div className="space-y-2">
															<Label htmlFor="font_size_heading" className="text-sm font-medium text-slate-700 dark:text-slate-300">Heading Size</Label>
															<Input
																value={formData.font_size_heading}
																onChange={(e) => updateField('font_size_heading', e.target.value)}
																placeholder="14pt"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="font_size_subheading" className="text-sm font-medium text-slate-700 dark:text-slate-300">Subheading Size</Label>
															<Input
																value={formData.font_size_subheading}
																onChange={(e) => updateField('font_size_subheading', e.target.value)}
																placeholder="12pt"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
														<div className="space-y-2">
															<Label htmlFor="font_size_body" className="text-sm font-medium text-slate-700 dark:text-slate-300">Body Size</Label>
															<Input
																value={formData.font_size_body}
																onChange={(e) => updateField('font_size_body', e.target.value)}
																placeholder="11pt"
																className="h-10 rounded-lg border-slate-300"
															/>
														</div>
													</div>

													{/* Color Scheme */}
													<div className="border-t border-slate-200 dark:border-slate-700 pt-4">
														<h4 className="font-medium text-[#0b6d41] dark:text-green-400 mb-4">Color Scheme</h4>
														<div className="grid grid-cols-2 gap-4">
															<div className="space-y-2">
																<Label htmlFor="primary_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Primary Color</Label>
																<div className="flex gap-2">
																	<Input
																		type="color"
																		value={formData.primary_color}
																		onChange={(e) => updateField('primary_color', e.target.value)}
																		className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																	/>
																	<Input
																		value={formData.primary_color}
																		onChange={(e) => updateField('primary_color', e.target.value)}
																		placeholder="#1a365d"
																		className={`h-10 rounded-lg ${errors.primary_color ? 'border-red-500' : 'border-slate-300'}`}
																	/>
																</div>
																{errors.primary_color && (
																	<p className="text-sm text-red-500">{errors.primary_color}</p>
																)}
															</div>

															<div className="space-y-2">
																<Label htmlFor="secondary_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Secondary Color</Label>
																<div className="flex gap-2">
																	<Input
																		type="color"
																		value={formData.secondary_color}
																		onChange={(e) => updateField('secondary_color', e.target.value)}
																		className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																	/>
																	<Input
																		value={formData.secondary_color}
																		onChange={(e) => updateField('secondary_color', e.target.value)}
																		placeholder="#4a5568"
																		className="h-10 rounded-lg border-slate-300"
																	/>
																</div>
															</div>

															<div className="space-y-2">
																<Label htmlFor="accent_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Accent Color</Label>
																<div className="flex gap-2">
																	<Input
																		type="color"
																		value={formData.accent_color}
																		onChange={(e) => updateField('accent_color', e.target.value)}
																		className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																	/>
																	<Input
																		value={formData.accent_color}
																		onChange={(e) => updateField('accent_color', e.target.value)}
																		placeholder="#2b6cb0"
																		className="h-10 rounded-lg border-slate-300"
																	/>
																</div>
															</div>

															<div className="space-y-2">
																<Label htmlFor="border_color" className="text-sm font-medium text-slate-700 dark:text-slate-300">Border Color</Label>
																<div className="flex gap-2">
																	<Input
																		type="color"
																		value={formData.border_color}
																		onChange={(e) => updateField('border_color', e.target.value)}
																		className="w-14 h-10 p-1 cursor-pointer rounded-lg"
																	/>
																	<Input
																		value={formData.border_color}
																		onChange={(e) => updateField('border_color', e.target.value)}
																		placeholder="#e2e8f0"
																		className="h-10 rounded-lg border-slate-300"
																	/>
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
														<Switch
															id="watermark_enabled"
															checked={formData.watermark_enabled}
															onCheckedChange={(v) => updateField('watermark_enabled', v)}
														/>
														<Label htmlFor="watermark_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Watermark</Label>
													</div>

													<div className="space-y-2">
														<Label htmlFor="watermark_url" className="text-sm font-medium text-slate-700 dark:text-slate-300">Watermark Image URL</Label>
														<Input
															value={formData.watermark_url || ''}
															onChange={(e) => updateField('watermark_url', e.target.value)}
															placeholder="https://example.com/watermark.png"
															disabled={!formData.watermark_enabled}
															className="h-10 rounded-lg border-slate-300"
														/>
													</div>

													<div className="space-y-3">
														<div className="flex items-center justify-between">
															<Label htmlFor="watermark_opacity" className="text-sm font-medium text-slate-700 dark:text-slate-300">Opacity</Label>
															<span className="text-sm font-medium text-[#0b6d41] bg-[#0b6d41]/10 dark:text-green-400 dark:bg-green-900/20 px-2 py-0.5 rounded">
																{((formData.watermark_opacity || 0.1) * 100).toFixed(0)}%
															</span>
														</div>
														<Slider
															value={[(formData.watermark_opacity || 0.1) * 100]}
															onValueChange={(v) => updateField('watermark_opacity', v[0] / 100)}
															min={0}
															max={100}
															step={5}
															disabled={!formData.watermark_enabled}
															className="py-4"
														/>
														{errors.watermark_opacity && (
															<p className="text-sm text-red-500">{errors.watermark_opacity}</p>
														)}
													</div>
												</div>
											</div>
										</TabsContent>
									</Tabs>

									{/* Action Buttons */}
									<div className="flex justify-end gap-3 pt-8 border-t border-slate-200 dark:border-slate-700 mt-8">
										<Button
											variant="outline"
											size="default"
											className="h-11 px-8 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
											onClick={handleCancel}
											disabled={loading || previewLoading}
										>
											Cancel
										</Button>
										<Button
											variant="outline"
											size="default"
											className="h-11 px-8 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 transition-all duration-200"
											onClick={handlePreview}
											disabled={loading || previewLoading}
										>
											{previewLoading ? (
												<>
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
													Generating...
												</>
											) : (
												<>
													<Eye className="h-4 w-4 mr-2" />
													Preview PDF
												</>
											)}
										</Button>
										<Button
											size="default"
											className="h-11 px-8 rounded-xl bg-[#0b6d41] hover:bg-[#095a36] text-white shadow-lg shadow-[#0b6d41]/30 transition-all duration-200"
											onClick={handleSave}
											disabled={loading || previewLoading}
										>
											{loading ? (
												<>
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
													Creating...
												</>
											) : (
												'Create PDF Settings'
											)}
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />

				{/* PDF Preview Modal */}
				{showPreview && previewUrl && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
						<div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[90vw] max-w-5xl h-[90vh] flex flex-col">
							<div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
									</div>
									<div>
										<h3 className="text-lg font-semibold text-slate-900 dark:text-white">PDF Preview</h3>
										<p className="text-sm text-slate-500 dark:text-slate-400">Preview of your PDF header configuration</p>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setShowPreview(false)}
									className="h-10 w-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
								>
									<X className="h-5 w-5" />
								</Button>
							</div>
							<div className="flex-1 p-4 overflow-hidden">
								<iframe
									src={previewUrl}
									className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-700"
									title="PDF Preview"
								/>
							</div>
							<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
								<Button
									variant="outline"
									onClick={() => setShowPreview(false)}
									className="h-10 px-6 rounded-xl"
								>
									Close
								</Button>
								<Button
									onClick={() => {
										const link = document.createElement('a')
										link.href = previewUrl
										link.download = `pdf-preview-${formData.template_name || 'settings'}.pdf`
										link.click()
									}}
									className="h-10 px-6 rounded-xl bg-[#0b6d41] hover:bg-[#095a36] text-white"
								>
									Download Preview
								</Button>
							</div>
						</div>
					</div>
				)}
			</SidebarInset>
		</SidebarProvider>
	)
}
