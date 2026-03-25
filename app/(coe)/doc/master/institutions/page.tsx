'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
	School,
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

export default function InstitutionsDocPage() {
	return (
		<div className="min-h-screen bg-background">
			<div className="max-w-4xl mx-auto py-10 px-6 space-y-10">

				{/* Page Header */}
				<div className="space-y-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Link href="/doc/master" className="hover:text-foreground">Master</Link>
						<ChevronRight className="h-4 w-4" />
						<span className="text-foreground font-medium">Institutions</span>
					</div>
					<div className="flex items-center gap-4">
						<div className="h-12 w-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
							<School className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-3xl font-bold font-heading">Institutions</h1>
							<p className="text-muted-foreground">Manage educational institutions in the COE system</p>
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
								The <strong>Institutions</strong> page allows you to manage all educational institutions
								registered in the JKKN COE system. An institution is the top-level organizational unit
								that contains departments, programs, courses, and students.
							</p>
							<p className="text-muted-foreground leading-relaxed mt-4">
								From this page, you can:
							</p>
							<ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
								<li>View all registered institutions</li>
								<li>Add new institutions to the system</li>
								<li>Edit existing institution details</li>
								<li>Activate or deactivate institutions</li>
								<li>Import multiple institutions from Excel</li>
								<li>Export institution data for reports</li>
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
								Only users with the <strong>Super Admin</strong> role can access and manage institutions.
								This restriction ensures that only authorized personnel can modify the foundational
								organizational structure of the system.
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
								Follow this menu path to access the Institutions page:
							</p>
							<div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
								<span className="font-medium">Master</span>
								<ChevronRight className="h-4 w-4" />
								<span className="font-medium text-green-600">Institutions</span>
							</div>
							<div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
								<p className="text-xs text-muted-foreground mb-2">[Screenshot: Sidebar navigation showing Master menu expanded with Institutions highlighted]</p>
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

					{/* Adding an Institution */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								<Plus className="h-5 w-5" />
								Adding a New Institution
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-4">
								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">1</div>
									<div className="flex-1">
										<p className="font-medium">Click the "Add Institution" button</p>
										<p className="text-sm text-muted-foreground mt-1">
											Located in the top-right corner of the Institutions page
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Institution list page with "Add Institution" button highlighted]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">2</div>
									<div className="flex-1">
										<p className="font-medium">Fill in the institution details</p>
										<p className="text-sm text-muted-foreground mt-1">
											Enter the institution code, name, and type in the form that appears
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Create Institution form with all fields visible]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">3</div>
									<div className="flex-1">
										<p className="font-medium">Set the institution status</p>
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
										<p className="font-medium">Click "Save" to create the institution</p>
										<p className="text-sm text-muted-foreground mt-1">
											A success message will appear confirming the institution was created
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

					{/* Editing an Institution */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								<Edit className="h-5 w-5" />
								Editing an Institution
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-4">
								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">1</div>
									<div className="flex-1">
										<p className="font-medium">Find the institution in the list</p>
										<p className="text-sm text-muted-foreground mt-1">
											Use the search box to quickly find the institution by code or name
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Search box with institution search results]</p>
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
											Located in the Actions column of the institution row
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Institution row with Edit button highlighted]</p>
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
											Modify any field and save the changes
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

					{/* Importing Institutions */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								<Upload className="h-5 w-5" />
								Importing Institutions from Excel
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-4">
								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-700 shrink-0">1</div>
									<div className="flex-1">
										<p className="font-medium">Download the Excel template</p>
										<p className="text-sm text-muted-foreground mt-1">
											Click the dropdown arrow next to the Export button and select "Download Template"
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Export dropdown showing "Download Template" option]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-700 shrink-0">2</div>
									<div className="flex-1">
										<p className="font-medium">Fill in the template with your institution data</p>
										<p className="text-sm text-muted-foreground mt-1">
											Open the downloaded Excel file and enter institution details in each row
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Excel template with sample data filled in]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-700 shrink-0">3</div>
									<div className="flex-1">
										<p className="font-medium">Click the "Import" button and select your file</p>
										<p className="text-sm text-muted-foreground mt-1">
											Browse and select the completed Excel file
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Import button and file selection dialog]</p>
											<div className="h-24 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center text-sm text-muted-foreground">
												Screenshot Placeholder
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-start gap-4">
									<div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-700 shrink-0">4</div>
									<div className="flex-1">
										<p className="font-medium">Review the import summary</p>
										<p className="text-sm text-muted-foreground mt-1">
											Check the results showing successful and failed imports
										</p>
										<div className="mt-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
											<p className="text-xs text-muted-foreground mb-2">[Screenshot: Import summary showing total, successful, and failed counts]</p>
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
											<td className="py-3 px-4 font-medium">Institution Code <span className="text-red-500">*</span></td>
											<td className="py-3 px-4 text-muted-foreground">A unique short identifier for the institution. Cannot be changed after creation.</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">JKKNAC</code></td>
										</tr>
										<tr className="border-b">
											<td className="py-3 px-4 font-medium">Institution Name <span className="text-red-500">*</span></td>
											<td className="py-3 px-4 text-muted-foreground">The full official name of the institution.</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">JKKN Arts College</code></td>
										</tr>
										<tr className="border-b">
											<td className="py-3 px-4 font-medium">Institution Type</td>
											<td className="py-3 px-4 text-muted-foreground">Category of the institution (College, University, etc.)</td>
											<td className="py-3 px-4"><code className="bg-muted px-2 py-1 rounded">Arts College</code></td>
										</tr>
										<tr>
											<td className="py-3 px-4 font-medium">Status</td>
											<td className="py-3 px-4 text-muted-foreground">Whether the institution is active in the system. Inactive institutions are hidden from most operations.</td>
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
										<h3 className="font-semibold">Add Institution</h3>
										<p className="text-sm text-muted-foreground">Create a new institution record in the system</p>
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
										<p className="text-sm text-muted-foreground">Modify institution name, type, or status</p>
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
										<p className="text-sm text-muted-foreground">Remove an institution (only if no dependent data exists)</p>
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
										<p className="text-sm text-muted-foreground">Bulk upload institutions from Excel file</p>
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
										<p className="text-sm text-muted-foreground">Find institutions by code, name, or status</p>
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
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Duplicate Institution Code</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> You see an error "Institution code already exists"<br />
								<strong>Solution:</strong> Each institution must have a unique code. Check the existing institutions list and use a different code.
							</AlertDescription>
						</Alert>

						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Cannot Delete Institution</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> Delete button shows an error<br />
								<strong>Solution:</strong> The institution has programs, departments, or other data linked to it. You must remove all linked data first, or set the institution to "Inactive" instead.
							</AlertDescription>
						</Alert>

						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Import Fails with Errors</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> Excel import shows many failed rows<br />
								<strong>Solution:</strong> Check the error dialog for specific row numbers and issues. Common causes: missing required fields, duplicate codes, or incorrect format. Use the provided template for correct formatting.
							</AlertDescription>
						</Alert>

						<Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
							<AlertTriangle className="h-4 w-4 text-yellow-600" />
							<AlertTitle className="text-yellow-800 dark:text-yellow-200">Institution Not Showing in Dropdowns</AlertTitle>
							<AlertDescription className="text-yellow-700 dark:text-yellow-300">
								<strong>Problem:</strong> A newly created institution does not appear in other forms<br />
								<strong>Solution:</strong> Make sure the institution status is set to "Active". Inactive institutions are hidden from selection dropdowns.
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
								<CardTitle className="text-base font-medium">Can I change an institution code after creating it?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									No, the institution code cannot be changed after creation because it is used as a reference
									throughout the system (in programs, courses, students, etc.). If you need a different code,
									you should create a new institution and migrate the data.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">What happens when I set an institution to Inactive?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									When an institution is set to Inactive: (1) It will not appear in dropdown selections
									for new records, (2) Existing data linked to it will remain intact, (3) Users assigned
									to that institution may have limited access. This is the recommended approach instead of
									deleting an institution.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">How many institutions can I import at once?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									There is no hard limit, but we recommend importing no more than 100 institutions at a time
									for optimal performance. The system will process each row individually and show you a
									detailed summary of successes and failures.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base font-medium">Can I export institutions to share with another system?</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Yes, use the Export button and select either "Excel" for spreadsheet format or "JSON" for
									system integration. The exported file will contain all institution data including codes,
									names, types, and status.
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
									<Link href="/doc/master/departments" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Departments</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Manage departments within institutions</p>
								</li>
								<li>
									<Link href="/doc/master/programs" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>Programs</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Configure academic programs for institutions</p>
								</li>
								<li>
									<Link href="/doc/master/pdf-settings" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline">
										<ChevronRight className="h-4 w-4" />
										<span>PDF Settings</span>
									</Link>
									<p className="text-sm text-muted-foreground ml-6">Configure institution-specific PDF headers and footers</p>
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
