'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CalendarDays,
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
  Calendar,
  GraduationCap
} from 'lucide-react'
import Link from 'next/link'

export default function AcademicYearsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <CalendarDays className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Academic Years</h1>
            <p className="text-muted-foreground">Learn how to manage academic year periods in JKKN COE</p>
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
            The <strong>Academic Years</strong> page allows you to define the calendar periods during
            which academic activities take place. An academic year typically runs from June/July to
            May/June of the following year (e.g., 2024-25).
          </p>
          <p>
            Academic years are used to schedule exams, track student admissions, generate reports, and
            organize all time-sensitive academic data. Each academic year has a start date, end date,
            and can be marked as the current active year.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Current Academic Year</AlertTitle>
            <AlertDescription>
              Only one academic year can be marked as &ldquo;Current&rdquo; at a time. This setting determines
              which year is used by default for new student registrations, exam schedules, and
              reports throughout the system.
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
          <p className="mb-4">Only users with the following roles can access the Academic Years page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Setting the current academic year affects the entire system, so this access is restricted
            to senior administrators only.
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
            Sidebar → Master → Academic Years
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Academic Years&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Academic Years page</p>
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
          {/* Adding a New Academic Year */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Academic Year
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Academic Year</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Academic Year Code</strong> (e.g., &ldquo;2024-25&rdquo;, &ldquo;AY2024&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Academic Year Name</strong> (e.g., &ldquo;Academic Year 2024-2025&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Start Date</strong> (typically June or July).</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>End Date</strong> (typically May or June of the next year).</span>
              </li>
              <li className="pl-2">
                <span>Toggle <strong>Is Current</strong> if this is the active academic year.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the academic year.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Academic Year form</p>
            </div>
          </div>

          {/* Setting Current Academic Year */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Setting the Current Academic Year
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the academic year you want to set as current in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon).</span>
              </li>
              <li className="pl-2">
                <span>Toggle the <strong>Is Current</strong> switch to ON.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Update</Badge> to save.</span>
              </li>
              <li className="pl-2">
                <span>The previous current academic year will automatically be unmarked.</span>
              </li>
            </ol>

            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Changing the current academic year affects exam schedules, student registrations, and
                default filters across the system. Make this change at the start of a new academic year.
              </AlertDescription>
            </Alert>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Setting Current Academic Year</p>
            </div>
          </div>

          {/* Editing an Academic Year */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing an Academic Year
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the academic year you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon).</span>
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
              <p className="text-sm text-muted-foreground">Screenshot: Edit Academic Year form</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Academic Year form</CardDescription>
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
                <TableCell className="font-medium">Academic Year Code</TableCell>
                <TableCell>A unique short code for the academic year (e.g., &ldquo;2024-25&rdquo;, &ldquo;AY2024&rdquo;). Used in reports and references.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Academic Year Name</TableCell>
                <TableCell>The full display name (e.g., &ldquo;Academic Year 2024-2025&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Start Date</TableCell>
                <TableCell>When the academic year begins. Typically June or July.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">End Date</TableCell>
                <TableCell>When the academic year ends. Typically May or June of the next calendar year.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Is Current</TableCell>
                <TableCell>Whether this is the currently active academic year. Only one can be current at a time.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the academic year is Active or Inactive. Inactive years won&apos;t appear in selections.</TableCell>
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
                <p className="font-medium">Add Academic Year</p>
                <p className="text-sm text-muted-foreground">Create a new academic year period</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Academic Year</p>
                <p className="text-sm text-muted-foreground">Modify existing academic year details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Academic Year</p>
                <p className="text-sm text-muted-foreground">Remove an academic year (if no linked data)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download academic year data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload academic years from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find academic years by code or date range</p>
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
              <AlertTitle>Overlapping Date Ranges</AlertTitle>
              <AlertDescription>
                Ensure academic year dates don&apos;t overlap with other years. Each academic year should
                have distinct start and end dates that don&apos;t conflict with adjacent years.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Forgetting to Set Current Year</AlertTitle>
              <AlertDescription>
                After creating a new academic year at the start of the session, remember to mark it
                as &ldquo;Is Current&rdquo;. Otherwise, the system will continue using the old year for defaults.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting the Current Academic Year</AlertTitle>
              <AlertDescription>
                You cannot delete an academic year that is marked as current. First assign another
                year as current, then delete the old one (if it has no linked records).
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>End Date Before Start Date</AlertTitle>
              <AlertDescription>
                The end date must be after the start date. An academic year spanning 2024-25 would
                start in June 2024 and end in May 2025.
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
              <AccordionTrigger>When should I create a new academic year?</AccordionTrigger>
              <AccordionContent>
                Create the new academic year before the session starts (typically in April-May for a
                June start). This allows you to set up exam schedules, register new students, and
                prepare course mappings in advance. Mark it as current only when the session actually begins.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>What happens when I change the current academic year?</AccordionTrigger>
              <AccordionContent>
                When you mark a new year as current: (1) The previous current year is automatically
                unmarked, (2) Default filters in reports and forms switch to the new year,
                (3) New student registrations default to the new year, (4) Exam scheduling defaults
                to the new year. Existing data from previous years remains unchanged.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Can I have multiple active academic years?</AccordionTrigger>
              <AccordionContent>
                Yes, you can have multiple <strong>Active</strong> (status) academic years, which means
                they appear in dropdown selections. However, only one can be marked as <strong>Current</strong>
                (Is Current toggle), which determines system defaults. This allows you to reference
                previous years while working primarily in the current year.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>How far ahead should I create academic years?</AccordionTrigger>
              <AccordionContent>
                Create academic years one year in advance at minimum. For planning purposes, you may
                create 2-3 years ahead. However, don&apos;t mark future years as current until their
                session actually begins. This helps with long-term scheduling while maintaining
                accurate current-year operations.
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
              href="/doc/master/semesters"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Calendar className="h-4 w-4 text-brand-green" />
              <span>Semesters</span>
            </Link>
            <Link
              href="/doc/master/batches"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Batches</span>
            </Link>
            <Link
              href="/doc/master/programs"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Programs</span>
            </Link>
            <Link
              href="/doc/master/regulations"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <CalendarDays className="h-4 w-4 text-brand-green" />
              <span>Regulations</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
