'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Calendar,
  Info,
  Users,
  MousePointer,
  ListChecks,
  AlertTriangle,
  HelpCircle,
  Link2,
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
  Search,
  ImageIcon,
  GraduationCap,
  Building2
} from 'lucide-react'
import Link from 'next/link'

export default function SemestersDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Semesters</h1>
            <p className="text-muted-foreground">Learn how to manage academic semesters in JKKN COE</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-brand-green/10 text-brand-green border-brand-green/20">
            Master Data
          </Badge>
          <Badge variant="outline">
            Admin Access
          </Badge>
        </div>
      </div>

      {/* Overview Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-brand-green" />
            <CardTitle>Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The <strong>Semesters</strong> page allows you to define the semester structure for your
            academic programs. Semesters represent the academic periods during which courses are taught
            and exams are conducted.
          </p>
          <p>
            Most undergraduate programs have 6 semesters (3 years), while postgraduate programs typically
            have 4 semesters (2 years). Each semester is identified by a number (1, 2, 3, etc.) and
            can have a descriptive name.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Semesters vs Academic Years</AlertTitle>
            <AlertDescription>
              <strong>Semesters</strong> are structural divisions of a program (Semester 1, 2, 3...), while
              <strong> Academic Years</strong> are calendar periods (2024-25, 2025-26). A student in &ldquo;Semester 3&rdquo;
              during &ldquo;Academic Year 2024-25&rdquo; takes specific courses mapped to that combination.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Who Can Access Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-green" />
            <CardTitle>Who Can Access This Page</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4">Only users with the following roles can access the Semesters page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
            <Badge variant="outline">Deputy COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This is a foundational setup that typically only needs to be configured once during initial system setup.
          </p>
        </CardContent>
      </Card>

      {/* How to Access Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MousePointer className="h-5 w-5 text-brand-green" />
            <CardTitle>How to Access</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm">
            Sidebar → Master → Semesters
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Semesters&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Semesters page</p>
          </div>
        </CardContent>
      </Card>

      {/* Step-by-Step Guide */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-brand-green" />
            <CardTitle>Step-by-Step Guide</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Adding a New Semester */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Semester
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Semester</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Semester Number</strong> (e.g., 1, 2, 3, 4, 5, 6).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Semester Name</strong> (e.g., &ldquo;Semester I&rdquo;, &ldquo;First Semester&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Optionally add a <strong>Description</strong> for additional context.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the semester.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Semester form</p>
            </div>
          </div>

          {/* Editing a Semester */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Semester
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the semester you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing semester details pre-filled.</span>
              </li>
              <li className="pl-2">
                <span>Make your changes to any of the fields.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Update</Badge> to save the changes.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Edit Semester form</p>
            </div>
          </div>

          {/* Bulk Setup */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Quick Setup: Creating All Semesters
            </h3>
            <p className="mb-4 text-muted-foreground">
              For a typical setup, you&apos;ll want to create semesters 1 through 8 (or 6 for 3-year programs).
              You can either add them one by one or import from Excel.
            </p>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file.</span>
              </li>
              <li className="pl-2">
                <span>Fill in all semester numbers and names:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>1, Semester I</li>
                  <li>2, Semester II</li>
                  <li>3, Semester III</li>
                  <li>... and so on</li>
                </ul>
              </li>
              <li className="pl-2">
                <span>Upload and import all semesters at once.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Import Semesters dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Semester form</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Field Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Semester Number</TableCell>
                <TableCell>A numeric identifier for the semester (1, 2, 3, etc.). Used for sorting and reference.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Semester Name</TableCell>
                <TableCell>Display name for the semester (e.g., &ldquo;Semester I&rdquo;, &ldquo;First Semester&rdquo;, &ldquo;Odd Semester&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Description</TableCell>
                <TableCell>Additional notes about the semester, such as typical months or focus areas.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the semester is Active or Inactive. Inactive semesters won&apos;t appear in selections.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Actions Available */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Actions Available</CardTitle>
          <CardDescription>All operations you can perform on this page</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Plus className="h-5 w-5 text-brand-green mt-0.5" />
              <div>
                <p className="font-medium">Add Semester</p>
                <p className="text-sm text-muted-foreground">Create a new semester entry</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Semester</p>
                <p className="text-sm text-muted-foreground">Modify existing semester details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Semester</p>
                <p className="text-sm text-muted-foreground">Remove a semester (if not in use)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download semester data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload semesters from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find semesters by number or name</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Common Mistakes */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle>Common Mistakes to Avoid</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Creating Duplicate Semester Numbers</AlertTitle>
              <AlertDescription>
                Each semester number should be unique. Don&apos;t create two &ldquo;Semester 1&rdquo; entries.
                If you have different naming conventions, use only one.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Skipping Semester Numbers</AlertTitle>
              <AlertDescription>
                Maintain continuous numbering (1, 2, 3, 4...). Don&apos;t skip numbers like (1, 2, 4, 5)
                as this can cause issues with course mapping and student progression.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Semesters with Course Mappings</AlertTitle>
              <AlertDescription>
                You cannot delete a semester that has courses mapped to it. First remove the course
                mappings, then delete the semester. Consider marking it Inactive instead.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Inconsistent Naming Conventions</AlertTitle>
              <AlertDescription>
                Use a consistent naming pattern. Either &ldquo;Semester I, II, III&rdquo; (Roman numerals) or
                &ldquo;Semester 1, 2, 3&rdquo; (Arabic numerals), but not a mix of both.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* FAQs */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-brand-green" />
            <CardTitle>Frequently Asked Questions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>How many semesters should I create?</AccordionTrigger>
              <AccordionContent>
                Create semesters based on your longest program duration. If you have 4-year programs
                with 2 semesters per year, create 8 semesters. For 3-year programs, 6 semesters are
                sufficient. The system will only show relevant semesters based on each program&apos;s
                total semester count.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>What&apos;s the difference between Semester and Academic Year?</AccordionTrigger>
              <AccordionContent>
                <strong>Semester</strong> is a structural division of a program (1st, 2nd, 3rd semester, etc.),
                representing the student&apos;s progression through the program. <strong>Academic Year</strong>
                is a calendar period (2024-25, 2025-26) when classes are conducted. A student in
                &ldquo;Semester 3&rdquo; during &ldquo;Academic Year 2024-25&rdquo; is taking 3rd semester courses in that year.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Can I rename semesters after courses are mapped?</AccordionTrigger>
              <AccordionContent>
                Yes, you can change the semester name without affecting course mappings, as the system
                uses the semester number (not name) for internal references. However, reports generated
                before the rename will show the old name.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Do I need separate semesters for different programs?</AccordionTrigger>
              <AccordionContent>
                No, semesters are shared across all programs. &ldquo;Semester 1&rdquo; applies to all programs
                that have a first semester. The course content differs based on the program&apos;s curriculum,
                not the semester definition.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Related Pages */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-brand-green" />
            <CardTitle>Related Pages</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              href="/doc/master/academic-years"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Calendar className="h-4 w-4 text-brand-green" />
              <span>Academic Years</span>
            </Link>
            <Link
              href="/doc/master/programs"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Programs</span>
            </Link>
            <Link
              href="/doc/master/batches"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Batches</span>
            </Link>
            <Link
              href="/doc/master/regulations"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Regulations</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
