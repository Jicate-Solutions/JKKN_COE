'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
	GraduationCap,
	Users,
	ChevronRight,
	Plus,
	Edit,
	Trash2,
	Download,
	Upload,
	Search,
	AlertTriangle,
	HelpCircle,
	CheckCircle2,
	FileText,
	Link as LinkIcon,
} from 'lucide-react'
import Link from 'next/link'

export default function DegreesDocPage() {
	return (
		<div className="min-h-screen bg-background">
			<div className="max-w-4xl mx-auto py-10 px-6 space-y-10">

				{/* Page Header */}
				<div className="space-y-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Link href="/doc/master" className="hover:text-foreground">Master</Link>
						<ChevronRight className="h-4 w-4" />
						<span className="text-foreground font-medium">Degrees</span>
					</div>
					<div className="flex items-center gap-4">
						<div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
							<GraduationCap className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-3xl font-bold font-heading">Degrees</h1>
							<p className="text-muted-foreground">Manage academic degree types in the COE system</p>
						</div>
					</div>
				</div>

				<Separator />

				{/* Overview Section */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<FileText className="h-5 w-5 text-green-600" />
						Overview
					</h2>
					<Card>
						<CardContent className="pt-6">
							<p className="text-muted-foreground leading-relaxed">
								The <strong>Degrees</strong> page allows you to manage all academic degree types offered
								by your institutions. A degree represents the type of qualification students receive upon
								completing their studies (e.g., Bachelor of Arts, Master of Science).
							</p>
							<p className="text-muted-foreground leading-relaxed mt-4">
								From this page, you can:
							</p>
							<ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
								<li>View all registered degree types</li>
								<li>Add new undergraduate or postgraduate degrees</li>
								<li>Edit existing degree details</li>
								<li>Activate or deactivate degrees</li>
								<li>Import multiple degrees from Excel</li>
								<li>Export degree data for reports</li>
							</ul>
						</CardContent>
					</Card>
				</section>

				{/* Who Can Access */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<Users className="h-5 w-5 text-green-600" />
						Who Can Access This Page
					</h2>
					<Card>
						<CardContent className="pt-6">
							<div className="flex flex-wrap gap-2">
								<Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
									Super Admin
								</Badge>
							</div>
							<p className="text-sm text-muted-foreground mt-4">
								Only users with the <strong>Super Admin</strong> role can access and manage degrees.
								This ensures that degree configurations remain consistent across all institutions.
							</p>
						</CardContent>
					</Card>
				</section>

				{/* How to Access */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<ChevronRight className="h-5 w-5 text-green-600" />
						How to Access
					</h2>
					<Card>
						<CardContent className="pt-6">
							<p className="text-muted-foreground mb-4">
								Follow this menu path to access the Degrees page:
							</p>
							<div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
								<span className="font-medium">Master</span>
								<ChevronRight className="h-4 w-4" />
								<span className="font-medium text-green-600">Degree</span>
							</div>
							<div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
								<p className="text-xs text-muted-foreground mb-2">[Screenshot: Sidebar navigation showing Master menu expanded with Degree highlighted]</p>
								<div className="h-32 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
									Screenshot Placeholder
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				{/* Step-by-Step Guide */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<CheckCircle2 className="h-5 w-5 text-green-600" />
						Step-by-Step Guide
					</h2>

					{/* Adding a Degree */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								<Plus className="h-5 w-5" />
								Adding a New Degree
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-4">
								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">1</div>
									<div className="flex-1">
										<p className="font-medium">Click the "Add Degree" button</p>
										<p className="text-sm text-muted-foreground mt-1">
											Located in the top-right corner of the Degrees page
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Degree list page with "Add Degree" button highlighted]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">2</div>
									<div className="flex-1">
										<p className="font-medium">Fill in the degree details</p>
										<p className="text-sm text-muted-foreground mt-1">
											Enter the degree code, name, and description in the form
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Create Degree form with all fields visible]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">3</div>
									<div className="flex-1">
										<p className="font-medium">Set the degree status</p>
										<p className="text-sm text-muted-foreground mt-1">
											Toggle the status switch to Active or Inactive
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Status toggle switch in the form]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">4</div>
									<div className="flex-1">
										<p className="font-medium">Click "Save" to create the degree</p>
										<p className="text-sm text-muted-foreground mt-1">
											A success message will appear confirming the degree was created
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Success toast notification after saving]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Editing a Degree */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								<Edit className="h-5 w-5" />
								Editing a Degree
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-4">
								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">1</div>
									<div className="flex-1">
										<p className="font-medium">Find the degree in the list</p>
										<p className="text-sm text-muted-foreground mt-1">
											Use the search box to quickly find the degree by code or name
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Search box with degree search results]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">2</div>
									<div className="flex-1">
										<p className="font-medium">Click the Edit icon (pencil)</p>
										<p className="text-sm text-muted-foreground mt-1">
											Located in the Actions column of the degree row
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Degree row with Edit button highlighted]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">3</div>
									<div className="flex-1">
										<p className="font-medium">Make your changes and click "Update"</p>
										<p className="text-sm text-muted-foreground mt-1">
											Modify the degree name, description, or status and save
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Edit form with Update button]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				{/* Field Explanation */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<FileText className="h-5 w-5 text-green-600" />
						Field Explanation
					</h2>
					<Card>
						<CardContent className="pt-6">
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b">
											<th className="text-left py-3 px-4 font-semibold">Field Name</th>
											<th className="text-left py-3 px-4 font-semibold">What It Means</th>
											<th className="text-left py-3 px-4 font-semibold">Example</th>
										</tr>
									</thead>
									<tbody>
										<tr className="border-b">
											<td className="py-3 px-4 font-medium">Degree Code <span className="text-red-500">*</span></td>
											<td className="py-3 px-4 text-muted-foreground">A unique short identifier for the degree type. Usually an abbreviation.</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">BA</code></td>
										</tr>
										<tr className="border-b">
											<td className="py-3 px-4 font-medium">Degree Name <span className="text-red-500">*</span></td>
											<td className="py-3 px-4 text-muted-foreground">The full official name of the degree type.</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">Bachelor of Arts</code></td>
										</tr>
										<tr className="border-b">
											<td className="py-3 px-4 font-medium">Description</td>
											<td className="py-3 px-4 text-muted-foreground">Additional information about the degree type (optional).</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">Undergraduate degree in arts and humanities</code></td>
										</tr>
										<tr>
											<td className="py-3 px-4 font-medium">Status</td>
											<td className="py-3 px-4 text-muted-foreground">Whether the degree is active in the system. Inactive degrees are hidden from program creation.</td>
											<td className="py-3 px-4"><Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge></td>
										</tr>
									</tbody>
								</table>
							</div>
							<p className="text-xs text-muted-foreground mt-4">
								<span className="text-red-500">*</span> Required fields
							</p>
						</CardContent>
					</Card>
				</section>

				{/* Actions Available */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<CheckCircle2 className="h-5 w-5 text-green-600" />
						Actions Available
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
										<Plus className="h-5 w-5 text-green-600" />
									</div>
									<div>
										<h3 className="font-semibold">Add Degree</h3>
										<p className="text-sm text-muted-foreground">Create a new degree type in the system</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
										<Edit className="h-5 w-5 text-blue-600" />
									</div>
									<div>
										<h3 className="font-semibold">Edit</h3>
										<p className="text-sm text-muted-foreground">Modify degree name, description, or status</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
										<Trash2 className="h-5 w-5 text-red-600" />
									</div>
									<div>
										<h3 className="font-semibold">Delete</h3>
										<p className="text-sm text-muted-foreground">Remove a degree (only if no programs use it)</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
										<Download className="h-5 w-5 text-purple-600" />
									</div>
									<div>
										<h3 className="font-semibold">Export</h3>
										<p className="text-sm text-muted-foreground">Download data as Excel, JSON, or template</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
										<Upload className="h-5 w-5 text-orange-600" />
									</div>
									<div>
										<h3 className="font-semibold">Import</h3>
										<p className="text-sm text-muted-foreground">Bulk upload degrees from Excel file</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
										<Search className="h-5 w-5 text-gray-600" />
									</div>
									<div>
										<h3 className="font-semibold">Search & Filter</h3>
										<p className="text-sm text-muted-foreground">Find degrees by code, name, or status</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* Common Mistakes */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-yellow-600" />
						Common Mistakes
					</h2>
					<div className="space-y-3">
						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Confusing Degree and Program</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> Creating a "BA Tamil" as a degree<br />
								<strong>Solution:</strong> A degree is the type of qualification (e.g., BA, MA, BSc). The specialization (Tamil, English) is defined in the Program, not the Degree. Create "Bachelor of Arts" as the degree, then create a program that combines the institution, degree, and specialization.
							</AlertDescription>
						</Alert>

						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Duplicate Degree Code</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> You see an error "Degree code already exists"<br />
								<strong>Solution:</strong> Each degree must have a unique code. Check the existing degrees list and use a different code.
							</AlertDescription>
						</Alert>

						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Cannot Delete Degree</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> Delete button shows an error<br />
								<strong>Solution:</strong> The degree is used by one or more programs. You must remove all programs using this degree first, or set the degree to "Inactive" instead.
							</AlertDescription>
						</Alert>
					</div>
				</section>

				{/* FAQs */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<HelpCircle className="h-5 w-5 text-green-600" />
						Frequently Asked Questions
					</h2>
					<div className="space-y-4">
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">What is the difference between a Degree and a Program?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									A <strong>Degree</strong> is the type of academic qualification (e.g., Bachelor of Arts, Master of Science).
									A <strong>Program</strong> is a specific offering that combines an institution, a degree, and optionally a
									specialization or department (e.g., "JKKN Arts College - Bachelor of Arts - Tamil").
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">Should I create separate degrees for UG and PG?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Yes, undergraduate (UG) and postgraduate (PG) are different degree types. For example,
									you should create both "Bachelor of Arts" (UG) and "Master of Arts" (PG) as separate degrees.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">Can multiple institutions use the same degree?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Yes, degrees are shared across all institutions. Once you create a degree like "Bachelor of Arts",
									any institution can use it when creating their programs. You don not need to create duplicate degrees
									for each institution.
								</p>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* Related Pages */}
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold font-heading flex items-center gap-2">
						<LinkIcon className="h-5 w-5 text-green-600" />
						Related Pages
					</h2>
					<Card>
						<CardContent className="pt-6">
							<ul className="space-y-3">
								<li>
									<Link href="/doc/master/programs" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Programs</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Create programs using degree types</p>
								</li>
								<li>
									<Link href="/doc/master/institutions" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Institutions</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Manage institutions that offer these degrees</p>
								</li>
								<li>
									<Link href="/doc/master/regulations" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Regulations</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Academic regulations linked to degrees</p>
								</li>
								<li>
									<Link href="/doc/master" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Master Data Overview</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">View all master data modules</p>
								</li>
							</ul>
						</CardContent>
					</Card>
				</section>

			</div>
		</div>
	)
}
