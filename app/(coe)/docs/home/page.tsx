'use client'

import { useState } from 'react'
import {
	Book,
	ChevronDown,
	ChevronRight,
	FileText,
	GraduationCap,
	Home,
	HelpCircle,
	AlertTriangle,
	CheckCircle2,
	Lightbulb,
	Search,
	Users,
	Calendar,
	ClipboardCheck,
	BarChart3,
	Shield,
	Database,
	BookText,
	Settings,
	Mail,
	Download,
	Upload,
	Play,
	Calculator,
	Edit,
	ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

// Table of Contents Data
const tableOfContents = [
	{ id: 'overview', title: 'Overview', icon: Home },
	{ id: 'before-you-begin', title: 'Before You Begin', icon: CheckCircle2 },
	{ id: 'getting-started', title: 'Getting Started', icon: Play },
	{ id: 'master-data', title: 'Master Data Setup', icon: Database },
	{ id: 'course-management', title: 'Course Management', icon: BookText },
	{ id: 'student-management', title: 'Student Management', icon: GraduationCap },
	{ id: 'exam-management', title: 'Examination Management', icon: Calendar },
	{ id: 'grading-results', title: 'Grading & Results', icon: BarChart3 },
	{ id: 'reports', title: 'Reports & Analytics', icon: FileText },
	{ id: 'user-management', title: 'User Management', icon: Users },
	{ id: 'tips-notes', title: 'Tips & Notes', icon: Lightbulb },
	{ id: 'faqs', title: 'FAQs', icon: HelpCircle },
	{ id: 'troubleshooting', title: 'Troubleshooting', icon: AlertTriangle },
]

// FAQ Data
const faqs = [
	{
		question: 'How do I register students for an examination?',
		answer: 'Navigate to Pre-Exam > Exam Registrations. Select the examination session, then either add students individually using the "Add Registration" button, or use the bulk import feature by downloading the Excel template, filling in student details, and uploading the file. The system will validate all entries and show a summary of successful and failed registrations.'
	},
	{
		question: 'How do I correct attendance after it has been submitted?',
		answer: 'Only users with COE role can correct attendance. Go to During-Exam > Attendance Correction. Search for the student by registration number, view the current attendance status, make the correction, provide a reason for the change, and submit. The system maintains an audit trail of all corrections.'
	},
	{
		question: 'How do I generate dummy numbers for answer sheets?',
		answer: 'Navigate to Post-Exam > Dummy Numbers. Select the examination session and course(s), then click "Generate". The system creates unique anonymous identification numbers for each registered student. You can export the mapping (which links students to dummy numbers) as a password-protected file for secure storage until results are published.'
	},
	{
		question: 'How do I upload external marks in bulk?',
		answer: 'Go to Post-Exam > External Mark Bulk Upload. Download the marks template which contains all students (by dummy number) for the selected course. Fill in the marks obtained for each student in Excel, then upload the file. The system validates that all marks are within the valid range and shows detailed error messages for any issues.'
	},
	{
		question: 'How do I configure PDF headers and footers for my institution?',
		answer: 'Navigate to Master > PDF Settings. Select your institution and template type (Certificate, Hall Ticket, Marksheet, etc.). You can upload logos, configure header/footer HTML with placeholders like {{institution_name}}, set colors and fonts, configure page numbering, and preview the output before saving.'
	},
]

// Troubleshooting Data
const troubleshootingItems = [
	{
		problem: 'I cannot see certain menu items in the sidebar',
		solution: 'Menu visibility is controlled by your assigned role(s). Contact your administrator to verify your role assignments. Different roles have access to different modules - for example, only Super Admin can access Master Data setup, while COE Office staff have limited access to certain features.'
	},
	{
		problem: 'Bulk upload is failing with validation errors',
		solution: 'Check the error dialog which shows the exact row numbers and error messages. Common issues include: missing required fields, duplicate entries, invalid foreign key references (e.g., institution_code that doesn\'t exist), or values outside valid ranges. Download the error report, fix the issues in your Excel file, and re-upload.'
	},
	{
		problem: 'I cannot edit attendance records',
		solution: 'Attendance records are locked after initial submission to maintain integrity. To make corrections, you must use the "Attendance Correction" feature (During-Exam > Attendance Correction). Note that only COE role users can make attendance corrections - COE Office staff cannot.'
	},
	{
		problem: 'External marks are not being accepted',
		solution: 'Verify that: 1) Dummy numbers are valid and generated for this examination, 2) Marks are within the valid range (0 to maximum marks), 3) The marks entry period is still open, 4) You have the required permissions. Check if marks have already been locked for this course.'
	},
	{
		problem: 'PDF export is showing incorrect headers/footers',
		solution: 'PDF settings are institution-specific. Ensure PDF settings have been configured for your institution in Master > PDF Settings. If settings exist, try clearing the cache (settings are cached for 5 minutes). Verify that all required logos are uploaded and placeholders are correctly formatted.'
	},
	{
		problem: 'Student registration is showing "Student not found" error',
		solution: 'The student must exist in the Students List before they can be registered for examinations. Navigate to Student > Student List and either add the student manually or use bulk import to add students from your institution\'s student database.'
	},
]

export default function DocsHomePage() {
	const [searchQuery, setSearchQuery] = useState('')
	const [activeSection, setActiveSection] = useState('overview')

	const scrollToSection = (sectionId: string) => {
		setActiveSection(sectionId)
		const element = document.getElementById(sectionId)
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'start' })
		}
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container flex h-16 items-center px-4">
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
							<Book className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-xl font-bold font-heading">JKKN COE Documentation</h1>
							<p className="text-xs text-muted-foreground">Controller of Examination User Guide</p>
						</div>
					</div>
					<div className="ml-auto flex items-center gap-4">
						<div className="relative w-64">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="search"
								placeholder="Search documentation..."
								className="pl-9"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
					</div>
				</div>
			</div>

			<div className="container flex">
				{/* Sidebar - Table of Contents */}
				<aside className="hidden lg:block w-64 shrink-0 border-r">
					<ScrollArea className="h-[calc(100vh-4rem)] py-6 pr-4">
						<div className="space-y-1">
							<p className="text-sm font-semibold text-muted-foreground mb-4 px-3">On This Page</p>
							{tableOfContents.map((item) => {
								const Icon = item.icon
								return (
									<button
										key={item.id}
										onClick={() => scrollToSection(item.id)}
										className={cn(
											'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
											activeSection === item.id
												? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 font-medium'
												: 'text-muted-foreground hover:bg-muted hover:text-foreground'
										)}
									>
										<Icon className="h-4 w-4" />
										{item.title}
									</button>
								)
							})}
						</div>
					</ScrollArea>
				</aside>

				{/* Main Content */}
				<main className="flex-1 overflow-auto">
					<ScrollArea className="h-[calc(100vh-4rem)]">
						<div className="max-w-4xl mx-auto py-10 px-6 space-y-16">

							{/* ==================== OVERVIEW ==================== */}
							<section id="overview" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<Badge variant="outline" className="mb-4 text-green-600 border-green-200 bg-green-50">
											Getting Started
										</Badge>
										<h2 className="text-3xl font-bold font-heading tracking-tight">
											JKKN Controller of Examination (COE)
										</h2>
										<p className="text-lg text-muted-foreground mt-2">
											A comprehensive digital examination management system for JKKN Arts Colleges
										</p>
									</div>

									<Card>
										<CardContent className="pt-6">
											<div className="prose prose-gray dark:prose-invert max-w-none">
												<p>
													The JKKN COE system is designed to streamline the entire examination lifecycle
													from pre-examination planning through result publication and certification.
													It provides role-based access control ensuring secure operations while
													maintaining comprehensive audit trails.
												</p>
											</div>
										</CardContent>
									</Card>

									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
										<Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10">
											<CardHeader className="pb-2">
												<CardTitle className="text-base flex items-center gap-2">
													<Calendar className="h-5 w-5 text-green-600" />
													Pre-Examination
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-sm text-muted-foreground">
													Exam scheduling, student registration, timetable generation, and hall ticket printing
												</p>
											</CardContent>
										</Card>

										<Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10">
											<CardHeader className="pb-2">
												<CardTitle className="text-base flex items-center gap-2">
													<ClipboardCheck className="h-5 w-5 text-blue-600" />
													During Examination
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-sm text-muted-foreground">
													Attendance management, exam room allocation, and real-time monitoring
												</p>
											</CardContent>
										</Card>

										<Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-900/10">
											<CardHeader className="pb-2">
												<CardTitle className="text-base flex items-center gap-2">
													<BarChart3 className="h-5 w-5 text-purple-600" />
													Post-Examination
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-sm text-muted-foreground">
													Mark entry, result processing, GPA/CGPA calculation, and certificate generation
												</p>
											</CardContent>
										</Card>
									</div>

									<Alert>
										<Lightbulb className="h-4 w-4" />
										<AlertTitle>Why use JKKN COE?</AlertTitle>
										<AlertDescription>
											<ul className="list-disc list-inside mt-2 space-y-1 text-sm">
												<li>60% reduction in result processing time</li>
												<li>80% reduction in paper consumption</li>
												<li>Same-day digital certificate generation</li>
												<li>Complete audit trail for all operations</li>
												<li>Role-based security with granular permissions</li>
											</ul>
										</AlertDescription>
									</Alert>
								</div>
							</section>

							<Separator />

							{/* ==================== BEFORE YOU BEGIN ==================== */}
							<section id="before-you-begin" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<CheckCircle2 className="h-6 w-6 text-green-600" />
											Before You Begin
										</h2>
										<p className="text-muted-foreground mt-2">
											Requirements and prerequisites for using the COE system
										</p>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">System Requirements</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div className="space-y-2">
													<h4 className="font-medium">Browser Requirements</h4>
													<ul className="text-sm text-muted-foreground space-y-1">
														<li>• Google Chrome (recommended) - version 90+</li>
														<li>• Mozilla Firefox - version 88+</li>
														<li>• Microsoft Edge - version 90+</li>
														<li>• Safari - version 14+</li>
													</ul>
												</div>
												<div className="space-y-2">
													<h4 className="font-medium">Network Requirements</h4>
													<ul className="text-sm text-muted-foreground space-y-1">
														<li>• Stable internet connection</li>
														<li>• Minimum 2 Mbps bandwidth</li>
														<li>• Access to *.supabase.co domains</li>
													</ul>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">User Account Setup</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="space-y-3">
												<div className="flex items-start gap-3">
													<div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700">1</div>
													<div>
														<p className="font-medium">Contact your administrator</p>
														<p className="text-sm text-muted-foreground">Request access to the JKKN COE system with your institutional email</p>
													</div>
												</div>
												<div className="flex items-start gap-3">
													<div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700">2</div>
													<div>
														<p className="font-medium">Verify your email</p>
														<p className="text-sm text-muted-foreground">Click the verification link sent to your email address</p>
													</div>
												</div>
												<div className="flex items-start gap-3">
													<div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700">3</div>
													<div>
														<p className="font-medium">Sign in with Google</p>
														<p className="text-sm text-muted-foreground">Use your institutional Google account to sign in</p>
													</div>
												</div>
												<div className="flex items-start gap-3">
													<div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700">4</div>
													<div>
														<p className="font-medium">Role assignment</p>
														<p className="text-sm text-muted-foreground">Your administrator will assign appropriate roles based on your responsibilities</p>
													</div>
												</div>
											</div>
										</CardContent>
									</Card>

									<Alert variant="destructive" className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800">
										<AlertTriangle className="h-4 w-4" />
										<AlertTitle>Important</AlertTitle>
										<AlertDescription>
											You must be assigned at least one role by an administrator before you can access any features.
											If you see a blank dashboard or limited menu items, contact your administrator.
										</AlertDescription>
									</Alert>
								</div>
							</section>

							<Separator />

							{/* ==================== GETTING STARTED ==================== */}
							<section id="getting-started" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<Play className="h-6 w-6 text-green-600" />
											Getting Started
										</h2>
										<p className="text-muted-foreground mt-2">
											Your first steps in the JKKN COE system
										</p>
									</div>

									<Tabs defaultValue="login" className="w-full">
										<TabsList className="grid w-full grid-cols-3">
											<TabsTrigger value="login">Logging In</TabsTrigger>
											<TabsTrigger value="dashboard">Dashboard</TabsTrigger>
											<TabsTrigger value="navigation">Navigation</TabsTrigger>
										</TabsList>

										<TabsContent value="login" className="mt-4">
											<Card>
												<CardHeader>
													<CardTitle>How to Log In</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<ol className="space-y-4">
														<li className="flex items-start gap-3">
															<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">1</span>
															<div>
																<p className="font-medium">Navigate to the login page</p>
																<p className="text-sm text-muted-foreground">Open your browser and go to the JKKN COE URL provided by your institution</p>
																<div className="mt-2 p-3 bg-muted rounded-md">
																	<p className="text-xs text-muted-foreground">[Screenshot: Login page with Google Sign-in button]</p>
																</div>
															</div>
														</li>
														<li className="flex items-start gap-3">
															<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">2</span>
															<div>
																<p className="font-medium">Click "Sign in with Google"</p>
																<p className="text-sm text-muted-foreground">Use your institutional Google account (@jkkn.ac.in or similar)</p>
															</div>
														</li>
														<li className="flex items-start gap-3">
															<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">3</span>
															<div>
																<p className="font-medium">Grant permissions</p>
																<p className="text-sm text-muted-foreground">Allow the application to access your email and profile information</p>
															</div>
														</li>
														<li className="flex items-start gap-3">
															<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">4</span>
															<div>
																<p className="font-medium">Access the dashboard</p>
																<p className="text-sm text-muted-foreground">You will be redirected to the dashboard after successful authentication</p>
															</div>
														</li>
													</ol>
												</CardContent>
											</Card>
										</TabsContent>

										<TabsContent value="dashboard" className="mt-4">
											<Card>
												<CardHeader>
													<CardTitle>Understanding the Dashboard</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<p className="text-sm text-muted-foreground">
														The dashboard provides an at-a-glance view of your examination system with key statistics and upcoming events.
													</p>
													<div className="mt-2 p-3 bg-muted rounded-md">
														<p className="text-xs text-muted-foreground">[Screenshot: Dashboard showing statistics cards and upcoming exams]</p>
													</div>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
														<div className="space-y-2">
															<h4 className="font-medium">Statistics Cards</h4>
															<ul className="text-sm text-muted-foreground space-y-1">
																<li>• <strong>Total Students</strong> - Count of registered students</li>
																<li>• <strong>Active Courses</strong> - Courses offered this session</li>
																<li>• <strong>Total Programs</strong> - UG and PG programs</li>
																<li>• <strong>Exam Attendance</strong> - Present/absent ratio</li>
															</ul>
														</div>
														<div className="space-y-2">
															<h4 className="font-medium">Upcoming Exams</h4>
															<ul className="text-sm text-muted-foreground space-y-1">
																<li>• Shows next 5 scheduled examinations</li>
																<li>• Displays course code, name, and mode</li>
																<li>• Click to view full timetable</li>
															</ul>
														</div>
													</div>
												</CardContent>
											</Card>
										</TabsContent>

										<TabsContent value="navigation" className="mt-4">
											<Card>
												<CardHeader>
													<CardTitle>Navigating the System</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<p className="text-sm text-muted-foreground">
														The sidebar on the left provides access to all modules based on your assigned roles.
													</p>
													<div className="mt-2 p-3 bg-muted rounded-md">
														<p className="text-xs text-muted-foreground">[Screenshot: Sidebar navigation with expanded menu items]</p>
													</div>
													<div className="space-y-3 mt-4">
														<div className="flex items-start gap-2">
															<Database className="h-5 w-5 text-muted-foreground mt-0.5" />
															<div>
																<p className="font-medium">Master</p>
																<p className="text-sm text-muted-foreground">Configure institutions, degrees, departments, programs, and other foundational data</p>
															</div>
														</div>
														<div className="flex items-start gap-2">
															<BookText className="h-5 w-5 text-muted-foreground mt-0.5" />
															<div>
																<p className="font-medium">Courses</p>
																<p className="text-sm text-muted-foreground">Manage course catalog, offerings, and mappings</p>
															</div>
														</div>
														<div className="flex items-start gap-2">
															<Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
															<div>
																<p className="font-medium">Pre-Exam</p>
																<p className="text-sm text-muted-foreground">Set up exam types, sessions, registrations, and timetables</p>
															</div>
														</div>
														<div className="flex items-start gap-2">
															<ClipboardCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
															<div>
																<p className="font-medium">During-Exam</p>
																<p className="text-sm text-muted-foreground">Mark attendance, manage rooms, handle corrections</p>
															</div>
														</div>
														<div className="flex items-start gap-2">
															<BarChart3 className="h-5 w-5 text-muted-foreground mt-0.5" />
															<div>
																<p className="font-medium">Grading</p>
																<p className="text-sm text-muted-foreground">Process marks, calculate GPA/CGPA, publish results</p>
															</div>
														</div>
													</div>
												</CardContent>
											</Card>
										</TabsContent>
									</Tabs>
								</div>
							</section>

							<Separator />

							{/* ==================== MASTER DATA ==================== */}
							<section id="master-data" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<Database className="h-6 w-6 text-green-600" />
											Master Data Setup
										</h2>
										<p className="text-muted-foreground mt-2">
											Configure foundational data for your institution
										</p>
									</div>

									<Alert>
										<Shield className="h-4 w-4" />
										<AlertTitle>Access Restriction</AlertTitle>
										<AlertDescription>
											Master Data setup is only available to users with the <strong>Super Admin</strong> role.
											Contact your administrator if you need to modify master data.
										</AlertDescription>
									</Alert>

									<Accordion type="single" collapsible className="w-full">
										<AccordionItem value="institutions">
											<AccordionTrigger>
												<div className="flex items-center gap-2">
													<Settings className="h-4 w-4" />
													Institutions
												</div>
											</AccordionTrigger>
											<AccordionContent>
												<div className="space-y-4 pt-2">
													<p className="text-sm text-muted-foreground">
														Institutions are the top-level organizational units in the system.
														Each institution has its own courses, programs, and examination settings.
													</p>
													<div className="space-y-2">
														<h4 className="font-medium text-sm">To add an institution:</h4>
														<ol className="text-sm text-muted-foreground space-y-2 ml-4">
															<li>1. Navigate to <strong>Master → Institutions</strong></li>
															<li>2. Click the <strong>"Add Institution"</strong> button</li>
															<li>3. Fill in the institution code (unique identifier), name, and type</li>
															<li>4. Set the status to Active</li>
															<li>5. Click <strong>Save</strong></li>
														</ol>
													</div>
													<div className="mt-2 p-3 bg-muted rounded-md">
														<p className="text-xs text-muted-foreground">[Screenshot: Add Institution form with fields highlighted]</p>
													</div>
												</div>
											</AccordionContent>
										</AccordionItem>

										<AccordionItem value="degrees">
											<AccordionTrigger>
												<div className="flex items-center gap-2">
													<GraduationCap className="h-4 w-4" />
													Degrees
												</div>
											</AccordionTrigger>
											<AccordionContent>
												<div className="space-y-4 pt-2">
													<p className="text-sm text-muted-foreground">
														Degrees represent the academic qualifications offered (e.g., Bachelor of Arts, Master of Science).
													</p>
													<div className="space-y-2">
														<h4 className="font-medium text-sm">To add a degree:</h4>
														<ol className="text-sm text-muted-foreground space-y-2 ml-4">
															<li>1. Navigate to <strong>Master → Degree</strong></li>
															<li>2. Click <strong>"Add Degree"</strong></li>
															<li>3. Enter the degree code (e.g., BA, MSC) and full name</li>
															<li>4. Add a description if needed</li>
															<li>5. Click <strong>Save</strong></li>
														</ol>
													</div>
												</div>
											</AccordionContent>
										</AccordionItem>

										<AccordionItem value="programs">
											<AccordionTrigger>
												<div className="flex items-center gap-2">
													<BookText className="h-4 w-4" />
													Programs
												</div>
											</AccordionTrigger>
											<AccordionContent>
												<div className="space-y-4 pt-2">
													<p className="text-sm text-muted-foreground">
														Programs combine an institution with a degree and optionally a department.
														For example: "JKKNAC - Bachelor of Arts - Tamil Department"
													</p>
													<div className="space-y-2">
														<h4 className="font-medium text-sm">To create a program:</h4>
														<ol className="text-sm text-muted-foreground space-y-2 ml-4">
															<li>1. Navigate to <strong>Master → Program</strong></li>
															<li>2. Click <strong>"Add Program"</strong></li>
															<li>3. Select the Institution from the dropdown</li>
															<li>4. Select the Degree</li>
															<li>5. Optionally select the Offering Department</li>
															<li>6. Enter a program code and name</li>
															<li>7. Click <strong>Save</strong></li>
														</ol>
													</div>
													<Alert className="mt-4">
														<Lightbulb className="h-4 w-4" />
														<AlertDescription className="text-sm">
															The system automatically maps institution, degree, and department codes to their database IDs.
															You only need to select from dropdowns - no need to know internal IDs.
														</AlertDescription>
													</Alert>
												</div>
											</AccordionContent>
										</AccordionItem>

										<AccordionItem value="pdf-settings">
											<AccordionTrigger>
												<div className="flex items-center gap-2">
													<FileText className="h-4 w-4" />
													PDF Settings
												</div>
											</AccordionTrigger>
											<AccordionContent>
												<div className="space-y-4 pt-2">
													<p className="text-sm text-muted-foreground">
														Configure institution-specific PDF headers, footers, logos, and styling for all generated documents.
													</p>
													<div className="space-y-2">
														<h4 className="font-medium text-sm">Available template types:</h4>
														<ul className="text-sm text-muted-foreground space-y-1 ml-4">
															<li>• <strong>Default</strong> - General purpose documents</li>
															<li>• <strong>Certificate</strong> - Degree and course certificates</li>
															<li>• <strong>Hall Ticket</strong> - Examination hall tickets</li>
															<li>• <strong>Marksheet</strong> - Student marksheets and transcripts</li>
															<li>• <strong>Report</strong> - Administrative reports</li>
														</ul>
													</div>
													<div className="space-y-2 mt-4">
														<h4 className="font-medium text-sm">Configuration options:</h4>
														<ul className="text-sm text-muted-foreground space-y-1 ml-4">
															<li>• Primary and secondary logos with positioning</li>
															<li>• Header/footer HTML with placeholders ({"{{institution_name}}"}, {"{{date}}"}, etc.)</li>
															<li>• Watermark settings with opacity</li>
															<li>• Paper size (A4, Letter, Legal) and orientation</li>
															<li>• Custom margins and colors</li>
															<li>• Font families and sizes</li>
															<li>• Page numbering format and position</li>
														</ul>
													</div>
												</div>
											</AccordionContent>
										</AccordionItem>
									</Accordion>
								</div>
							</section>

							<Separator />

							{/* ==================== COURSE MANAGEMENT ==================== */}
							<section id="course-management" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<BookText className="h-6 w-6 text-green-600" />
											Course Management
										</h2>
										<p className="text-muted-foreground mt-2">
											Manage your course catalog and offerings
										</p>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Creating a Course</CardTitle>
											<CardDescription>Step-by-step guide to add a new course</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<ol className="space-y-4">
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">1</span>
													<div>
														<p className="font-medium">Navigate to Courses → Courses</p>
														<p className="text-sm text-muted-foreground">Click the "Add Course" button in the top right</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">2</span>
													<div>
														<p className="font-medium">Fill in basic information</p>
														<ul className="text-sm text-muted-foreground mt-1 space-y-1">
															<li>• <strong>Institution</strong> - Select from dropdown</li>
															<li>• <strong>Regulation</strong> - Academic regulation this course follows</li>
															<li>• <strong>Course Code</strong> - Unique identifier (letters, numbers, hyphens only)</li>
															<li>• <strong>Course Title</strong> - Full name of the course</li>
														</ul>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">3</span>
													<div>
														<p className="font-medium">Configure course type and credits</p>
														<ul className="text-sm text-muted-foreground mt-1 space-y-1">
															<li>• <strong>Course Type</strong> - Theory, Practical, or Theory-Practical</li>
															<li>• <strong>Credits</strong> - Total credit value (0-10)</li>
															<li>• <strong>Split Credit</strong> - Enable to specify separate theory/practical credits</li>
														</ul>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">4</span>
													<div>
														<p className="font-medium">Set marks configuration</p>
														<ul className="text-sm text-muted-foreground mt-1 space-y-1">
															<li>• <strong>Internal Marks</strong> - Maximum marks for internal assessment</li>
															<li>• <strong>External Marks</strong> - Maximum marks for external examination</li>
														</ul>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">5</span>
													<div>
														<p className="font-medium">Save the course</p>
														<p className="text-sm text-muted-foreground">Click Save to create the course. It will appear in the courses list.</p>
													</div>
												</li>
											</ol>
											<div className="mt-4 p-3 bg-muted rounded-md">
												<p className="text-xs text-muted-foreground">[Screenshot: Course creation form with all fields]</p>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Course Offering</CardTitle>
											<CardDescription>Assign courses to specific sessions and programs</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<p className="text-sm text-muted-foreground">
												Course Offering links a course to a specific examination session, program, and semester.
												This determines which students can register for the course.
											</p>
											<ol className="space-y-3">
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">1</span>
													<div>
														<p className="text-sm">Navigate to <strong>Courses → Course Offering</strong></p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">2</span>
													<div>
														<p className="text-sm">Select <strong>Institution</strong> - filters all subsequent dropdowns</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">3</span>
													<div>
														<p className="text-sm">Select <strong>Examination Session</strong> (e.g., "Nov 2025 Regular")</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">4</span>
													<div>
														<p className="text-sm">Select <strong>Program</strong> and <strong>Semester</strong></p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">5</span>
													<div>
														<p className="text-sm">Choose <strong>Course(s)</strong> to offer and assign <strong>Section</strong></p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">6</span>
													<div>
														<p className="text-sm">Click <strong>Save</strong> to create the offering</p>
													</div>
												</li>
											</ol>
										</CardContent>
									</Card>
								</div>
							</section>

							<Separator />

							{/* ==================== STUDENT MANAGEMENT ==================== */}
							<section id="student-management" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<GraduationCap className="h-6 w-6 text-green-600" />
											Student Management
										</h2>
										<p className="text-muted-foreground mt-2">
											Manage student records and enrollments
										</p>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Bulk Student Import</CardTitle>
											<CardDescription>Upload multiple students at once using Excel</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<ol className="space-y-4">
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">1</span>
													<div>
														<p className="font-medium">Download the template</p>
														<p className="text-sm text-muted-foreground">
															Navigate to Student → Student List, click the <Download className="inline h-4 w-4" /> dropdown and select "Download Template"
														</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">2</span>
													<div>
														<p className="font-medium">Fill in student details</p>
														<p className="text-sm text-muted-foreground">
															Open the Excel file and enter student information in the provided columns.
															Required fields are marked with asterisks.
														</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">3</span>
													<div>
														<p className="font-medium">Upload the file</p>
														<p className="text-sm text-muted-foreground">
															Click <Upload className="inline h-4 w-4" /> Import and select your completed Excel file
														</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-green-100 text-sm font-medium text-green-700">4</span>
													<div>
														<p className="font-medium">Review results</p>
														<p className="text-sm text-muted-foreground">
															The system shows a summary with successful and failed records.
															Click on errors to see detailed row-by-row feedback.
														</p>
													</div>
												</li>
											</ol>
											<div className="mt-4 p-3 bg-muted rounded-md">
												<p className="text-xs text-muted-foreground">[Screenshot: Upload summary showing success/failure counts]</p>
											</div>
										</CardContent>
									</Card>
								</div>
							</section>

							<Separator />

							{/* ==================== EXAM MANAGEMENT ==================== */}
							<section id="exam-management" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<Calendar className="h-6 w-6 text-green-600" />
											Examination Management
										</h2>
										<p className="text-muted-foreground mt-2">
											Complete examination lifecycle management
										</p>
									</div>

									<Tabs defaultValue="pre-exam" className="w-full">
										<TabsList className="grid w-full grid-cols-3">
											<TabsTrigger value="pre-exam">Pre-Examination</TabsTrigger>
											<TabsTrigger value="during-exam">During Examination</TabsTrigger>
											<TabsTrigger value="post-exam">Post-Examination</TabsTrigger>
										</TabsList>

										<TabsContent value="pre-exam" className="mt-4 space-y-4">
											<Card>
												<CardHeader>
													<CardTitle>Pre-Examination Workflow</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<div className="space-y-3">
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-medium text-blue-700">1</div>
															<div>
																<p className="font-medium">Create Exam Types</p>
																<p className="text-sm text-muted-foreground">
																	Define exam types (Quiz, Online, Offline) with associated grade systems.
																	Navigate to Pre-Exam → Exam Types.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-medium text-blue-700">2</div>
															<div>
																<p className="font-medium">Create Examination Session</p>
																<p className="text-sm text-muted-foreground">
																	Set up the exam period (e.g., "Nov 2025 Regular") with start/end dates.
																	Navigate to Pre-Exam → Examination Sessions.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-medium text-blue-700">3</div>
															<div>
																<p className="font-medium">Register Students</p>
																<p className="text-sm text-muted-foreground">
																	Register eligible students for the examination session.
																	Navigate to Pre-Exam → Exam Registrations.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-medium text-blue-700">4</div>
															<div>
																<p className="font-medium">Generate Timetable</p>
																<p className="text-sm text-muted-foreground">
																	Create the examination schedule with dates, sessions, and course assignments.
																	Navigate to Pre-Exam → Exam Timetable.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-medium text-blue-700">5</div>
															<div>
																<p className="font-medium">Upload Internal Marks</p>
																<p className="text-sm text-muted-foreground">
																	Bulk upload internal assessment marks before the examination.
																	Navigate to Pre-Exam → Bulk Internal Marks.
																</p>
															</div>
														</div>
													</div>
												</CardContent>
											</Card>
										</TabsContent>

										<TabsContent value="during-exam" className="mt-4 space-y-4">
											<Card>
												<CardHeader>
													<CardTitle>During Examination Operations</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<div className="space-y-3">
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<ClipboardCheck className="h-5 w-5 text-green-600 mt-1" />
															<div>
																<p className="font-medium">Mark Attendance</p>
																<p className="text-sm text-muted-foreground">
																	Record student attendance for each exam session. Navigate to During-Exam → Exam Attendance.
																	Select the course and date, then check the box for each present student.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<Edit className="h-5 w-5 text-orange-600 mt-1" />
															<div>
																<p className="font-medium">Attendance Correction</p>
																<p className="text-sm text-muted-foreground">
																	Correct attendance records after submission (COE only).
																	Navigate to During-Exam → Attendance Correction.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<Settings className="h-5 w-5 text-blue-600 mt-1" />
															<div>
																<p className="font-medium">Exam Rooms</p>
																<p className="text-sm text-muted-foreground">
																	Manage examination hall allocations and capacity.
																	Navigate to During-Exam → Exam Rooms.
																</p>
															</div>
														</div>
													</div>
												</CardContent>
											</Card>
										</TabsContent>

										<TabsContent value="post-exam" className="mt-4 space-y-4">
											<Card>
												<CardHeader>
													<CardTitle>Post-Examination Workflow</CardTitle>
												</CardHeader>
												<CardContent className="space-y-4">
													<div className="space-y-3">
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-medium text-purple-700">1</div>
															<div>
																<p className="font-medium">Generate Dummy Numbers</p>
																<p className="text-sm text-muted-foreground">
																	Create anonymous identification numbers for answer scripts.
																	Navigate to Post-Exam → Dummy Numbers.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-medium text-purple-700">2</div>
															<div>
																<p className="font-medium">Create Answer Sheet Packets</p>
																<p className="text-sm text-muted-foreground">
																	Group answer sheets into packets for evaluation.
																	Navigate to Post-Exam → Answer Sheet Packets.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-medium text-purple-700">3</div>
															<div>
																<p className="font-medium">Enter External Marks</p>
																<p className="text-sm text-muted-foreground">
																	Record marks from examiner evaluation. Use single entry or bulk upload.
																	Navigate to Post-Exam → External Mark Entry or External Mark Bulk Upload.
																</p>
															</div>
														</div>
														<div className="flex items-start gap-3 p-3 border rounded-lg">
															<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-medium text-purple-700">4</div>
															<div>
																<p className="font-medium">Process Results</p>
																<p className="text-sm text-muted-foreground">
																	Generate final marks, calculate GPA/CGPA, and publish results.
																	Navigate to Grading → Generate Final Marks, then Semester Results.
																</p>
															</div>
														</div>
													</div>
												</CardContent>
											</Card>
										</TabsContent>
									</Tabs>
								</div>
							</section>

							<Separator />

							{/* ==================== GRADING & RESULTS ==================== */}
							<section id="grading-results" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<BarChart3 className="h-6 w-6 text-green-600" />
											Grading & Results
										</h2>
										<p className="text-muted-foreground mt-2">
											Grade configuration and result processing
										</p>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">GPA/CGPA Calculation</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<p className="text-sm text-muted-foreground">
												The system calculates GPA and CGPA using the following formulas:
											</p>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div className="p-4 border rounded-lg bg-muted/50">
													<h4 className="font-medium mb-2">GPA (Semester)</h4>
													<p className="text-sm font-mono">
														GPA = Σ(Credit × Grade Point) / Σ(Credits)
													</p>
													<p className="text-xs text-muted-foreground mt-2">
														Calculated for each semester based on courses taken
													</p>
												</div>
												<div className="p-4 border rounded-lg bg-muted/50">
													<h4 className="font-medium mb-2">CGPA (Cumulative)</h4>
													<p className="text-sm font-mono">
														CGPA = Σ(All Semester Credits × GPA) / Σ(All Credits)
													</p>
													<p className="text-xs text-muted-foreground mt-2">
														Calculated across all completed semesters
													</p>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Generating Final Marks</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<ol className="space-y-3">
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">1</span>
													<div>
														<p className="text-sm">Navigate to <strong>Grading → Generate Final Marks</strong></p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">2</span>
													<div>
														<p className="text-sm">Select Institution, Session, Program, Semester, and Course</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">3</span>
													<div>
														<p className="text-sm">Click <strong>"Generate"</strong> to calculate final marks</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">4</span>
													<div>
														<p className="text-sm">Review the calculated marks (Internal + External weighted totals)</p>
													</div>
												</li>
												<li className="flex items-start gap-3">
													<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">5</span>
													<div>
														<p className="text-sm">Click <strong>"Lock Marks"</strong> to finalize (prevents further changes)</p>
													</div>
												</li>
											</ol>
										</CardContent>
									</Card>
								</div>
							</section>

							<Separator />

							{/* ==================== REPORTS ==================== */}
							<section id="reports" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<FileText className="h-6 w-6 text-green-600" />
											Reports & Analytics
										</h2>
										<p className="text-muted-foreground mt-2">
											Generate reports and analyze examination data
										</p>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Available Reports</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="space-y-4">
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<BarChart3 className="h-5 w-5 text-blue-600 mt-1" />
													<div>
														<p className="font-medium">Attendance Report</p>
														<p className="text-sm text-muted-foreground">
															View attendance statistics by session, course, program, or semester.
															Export as PDF with institution branding or Excel for further analysis.
														</p>
														<p className="text-xs text-muted-foreground mt-1">
															Location: Reports → Attendance Report
														</p>
													</div>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">Exporting Data</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3">
											<p className="text-sm text-muted-foreground">
												Most data tables support multiple export formats:
											</p>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
												<div className="p-3 border rounded-lg text-center">
													<FileText className="h-6 w-6 mx-auto text-red-600" />
													<p className="font-medium mt-2">PDF</p>
													<p className="text-xs text-muted-foreground">With institution headers</p>
												</div>
												<div className="p-3 border rounded-lg text-center">
													<FileText className="h-6 w-6 mx-auto text-green-600" />
													<p className="font-medium mt-2">Excel</p>
													<p className="text-xs text-muted-foreground">For spreadsheet analysis</p>
												</div>
												<div className="p-3 border rounded-lg text-center">
													<FileText className="h-6 w-6 mx-auto text-blue-600" />
													<p className="font-medium mt-2">JSON</p>
													<p className="text-xs text-muted-foreground">For system integration</p>
												</div>
											</div>
										</CardContent>
									</Card>
								</div>
							</section>

							<Separator />

							{/* ==================== USER MANAGEMENT ==================== */}
							<section id="user-management" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<Users className="h-6 w-6 text-green-600" />
											User Management
										</h2>
										<p className="text-muted-foreground mt-2">
											Manage users, roles, and permissions
										</p>
									</div>

									<Alert>
										<Shield className="h-4 w-4" />
										<AlertTitle>Admin Access Required</AlertTitle>
										<AlertDescription>
											User management features are only available to users with <strong>Admin</strong> or <strong>Super Admin</strong> roles.
										</AlertDescription>
									</Alert>

									<Card>
										<CardHeader>
											<CardTitle className="text-lg">System Roles</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="space-y-3">
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="default" className="mt-0.5">Super Admin</Badge>
													<p className="text-sm text-muted-foreground">
														Full system access across all institutions. Can configure master data, manage all users, and access all features.
													</p>
												</div>
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="secondary" className="mt-0.5">COE</Badge>
													<p className="text-sm text-muted-foreground">
														Controller of Examination. Can manage examinations, registrations, marks, and results for their institution.
													</p>
												</div>
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="secondary" className="mt-0.5">Deputy COE</Badge>
													<p className="text-sm text-muted-foreground">
														Deputy Controller. Similar access to COE with some restrictions.
													</p>
												</div>
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="outline" className="mt-0.5">COE Office</Badge>
													<p className="text-sm text-muted-foreground">
														Office staff. Limited access - can mark attendance and manage registrations but cannot correct attendance or modify marks.
													</p>
												</div>
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="outline" className="mt-0.5">Faculty COE</Badge>
													<p className="text-sm text-muted-foreground">
														Faculty member with examination duties. Can upload internal marks for their courses.
													</p>
												</div>
												<div className="flex items-start gap-3 p-3 border rounded-lg">
													<Badge variant="outline" className="mt-0.5">Admin</Badge>
													<p className="text-sm text-muted-foreground">
														System administrator. Can manage users and roles within their institution.
													</p>
												</div>
											</div>
										</CardContent>
									</Card>
								</div>
							</section>

							<Separator />

							{/* ==================== TIPS & NOTES ==================== */}
							<section id="tips-notes" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<Lightbulb className="h-6 w-6 text-green-600" />
											Tips & Notes
										</h2>
										<p className="text-muted-foreground mt-2">
											Helpful hints and best practices
										</p>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10">
											<CardHeader className="pb-2">
												<CardTitle className="text-sm flex items-center gap-2">
													<CheckCircle2 className="h-4 w-4 text-green-600" />
													Best Practices
												</CardTitle>
											</CardHeader>
											<CardContent>
												<ul className="text-sm text-muted-foreground space-y-2">
													<li>• Always download templates before bulk uploads</li>
													<li>• Review error messages carefully - they show exact row numbers</li>
													<li>• Lock marks only after thorough verification</li>
													<li>• Use descriptive session names (e.g., "Nov 2025 Regular")</li>
													<li>• Test PDF settings with preview before saving</li>
												</ul>
											</CardContent>
										</Card>

										<Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10">
											<CardHeader className="pb-2">
												<CardTitle className="text-sm flex items-center gap-2">
													<AlertTriangle className="h-4 w-4 text-yellow-600" />
													Common Pitfalls
												</CardTitle>
											</CardHeader>
											<CardContent>
												<ul className="text-sm text-muted-foreground space-y-2">
													<li>• Don't lock marks until all corrections are done</li>
													<li>• Ensure students exist before registering for exams</li>
													<li>• Create course offerings before student registration</li>
													<li>• Generate dummy numbers before entering external marks</li>
													<li>• Double-check institution selection - it filters all data</li>
												</ul>
											</CardContent>
										</Card>
									</div>

									<Alert>
										<Mail className="h-4 w-4" />
										<AlertTitle>SMTP Configuration</AlertTitle>
										<AlertDescription>
											To send emails (examiner appointments, notifications), configure SMTP settings in Master → SMTP Configuration.
											The system will not send emails until SMTP is properly configured.
										</AlertDescription>
									</Alert>
								</div>
							</section>

							<Separator />

							{/* ==================== FAQs ==================== */}
							<section id="faqs" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<HelpCircle className="h-6 w-6 text-green-600" />
											Frequently Asked Questions
										</h2>
										<p className="text-muted-foreground mt-2">
											Common questions and answers
										</p>
									</div>

									<Accordion type="single" collapsible className="w-full">
										{faqs.map((faq, index) => (
											<AccordionItem key={index} value={`faq-${index}`}>
												<AccordionTrigger className="text-left">
													{faq.question}
												</AccordionTrigger>
												<AccordionContent>
													<p className="text-sm text-muted-foreground">{faq.answer}</p>
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								</div>
							</section>

							<Separator />

							{/* ==================== TROUBLESHOOTING ==================== */}
							<section id="troubleshooting" className="scroll-mt-20">
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
											<AlertTriangle className="h-6 w-6 text-green-600" />
											Troubleshooting
										</h2>
										<p className="text-muted-foreground mt-2">
											Solutions to common problems
										</p>
									</div>

									<div className="space-y-4">
										{troubleshootingItems.map((item, index) => (
											<Card key={index}>
												<CardHeader className="pb-2">
													<CardTitle className="text-base flex items-center gap-2">
														<AlertTriangle className="h-4 w-4 text-orange-500" />
														{item.problem}
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="flex items-start gap-2">
														<CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
														<p className="text-sm text-muted-foreground">{item.solution}</p>
													</div>
												</CardContent>
											</Card>
										))}
									</div>

									<Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
										<CardHeader>
											<CardTitle className="text-base">Need More Help?</CardTitle>
										</CardHeader>
										<CardContent className="space-y-2">
											<p className="text-sm text-muted-foreground">
												If you're experiencing issues not covered here:
											</p>
											<ul className="text-sm text-muted-foreground space-y-1">
												<li>• Contact your system administrator</li>
												<li>• Check if your account has the required roles</li>
												<li>• Clear your browser cache and try again</li>
												<li>• Try using a different browser (Chrome recommended)</li>
											</ul>
										</CardContent>
									</Card>
								</div>
							</section>

							{/* Related Articles */}
							<Separator />
							<section className="pb-10">
								<h3 className="text-lg font-semibold mb-4">Related Articles</h3>
								<div className="space-y-2">
									<a href="/dashboard" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
										<ExternalLink className="h-4 w-4" />
										Go to Dashboard
									</a>
									<a href="/master/institutions" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
										<ExternalLink className="h-4 w-4" />
										Institution Setup Guide
									</a>
									<a href="/exam-management/exam-registrations" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
										<ExternalLink className="h-4 w-4" />
										Exam Registration Guide
									</a>
									<a href="/grading/semester-results" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
										<ExternalLink className="h-4 w-4" />
										Results Processing Guide
									</a>
								</div>
							</section>

						</div>
					</ScrollArea>
				</main>
			</div>
		</div>
	)
}
