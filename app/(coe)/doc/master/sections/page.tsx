'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  LayoutGrid,
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
  Users2,
  Calendar
} from 'lucide-react'
import Link from 'next/link'

export default function SectionsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <LayoutGrid className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Sections</h1>
            <p className="text-muted-foreground">Learn how to manage class sections in JKKN COE</p>
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
            The <strong>Sections</strong> page allows you to create and manage class sections within
            a batch. Sections are subdivisions of a batch used for classroom management, especially
            when a batch has more learners than a single classroom can accommodate.
          </p>
          <p>
            For example, if a B.Sc. Computer Science batch has 120 learners, you might create
            Section A (60 learners) and Section B (60 learners). Each section can have its own
            timetable and seating arrangements while following the same curriculum.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Section vs Batch</AlertTitle>
            <AlertDescription>
              A <strong>Batch</strong> is a cohort of learners admitted in the same year (e.g., 2024-27 batch),
              while a <strong>Section</strong> is a classroom division within that batch (e.g., Section A, B, C).
              All sections within a batch follow the same curriculum and take the same exams.
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
          <p className="mb-4">Only users with the following roles can access the Sections page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
            <Badge variant="outline">Deputy COE</Badge>
            <Badge variant="outline">COE Office</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sections are typically created when new batches are formed and learners are divided for
            classroom management purposes.
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
            Sidebar → Master → Sections
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Sections&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Sections page</p>
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
          {/* Adding a New Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Section
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Section</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Institution</strong> from the dropdown.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Program</strong> for which this section is being created.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Batch</strong> to which this section belongs.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Section Code</strong> (e.g., &ldquo;A&rdquo;, &ldquo;B&rdquo;, &ldquo;SEC-A&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Section Name</strong> (e.g., &ldquo;Section A&rdquo;, &ldquo;Morning Batch&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Optionally set the <strong>Maximum Capacity</strong> (number of learners this section can hold).</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the section.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Section form</p>
            </div>
          </div>

          {/* Editing a Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Section
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the section you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing section details pre-filled.</span>
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
              <p className="text-sm text-muted-foreground">Screenshot: Edit Section form</p>
            </div>
          </div>

          {/* Importing Sections */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importing Sections from Excel
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file by clicking &ldquo;Download Template&rdquo;.</span>
              </li>
              <li className="pl-2">
                <span>Fill in the Excel template with your section data. Required columns:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>institution_code (must match existing institution)</li>
                  <li>program_code (must match existing program)</li>
                  <li>batch_code (must match existing batch)</li>
                  <li>section_code</li>
                  <li>section_name</li>
                  <li>max_capacity (optional)</li>
                  <li>status (Active/Inactive)</li>
                </ul>
              </li>
              <li className="pl-2">
                <span>Upload your completed Excel file.</span>
              </li>
              <li className="pl-2">
                <span>Review the import summary and fix any errors if displayed.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Import Sections dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Section form</CardDescription>
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
                <TableCell className="font-medium">Institution</TableCell>
                <TableCell>The institution where this section belongs. Select from the dropdown.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Program</TableCell>
                <TableCell>The academic program for this section (e.g., B.Sc. Computer Science).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Batch</TableCell>
                <TableCell>The batch to which this section belongs (e.g., 2024-27 Batch).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Section Code</TableCell>
                <TableCell>A unique code identifying the section within the batch (e.g., &ldquo;A&rdquo;, &ldquo;B&rdquo;, &ldquo;M1&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Section Name</TableCell>
                <TableCell>The display name (e.g., &ldquo;Section A&rdquo;, &ldquo;Morning Section&rdquo;, &ldquo;Honours Section&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Capacity</TableCell>
                <TableCell>Maximum number of learners this section can accommodate. Helps prevent over-enrollment.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the section is Active or Inactive. Inactive sections won&apos;t appear in selections.</TableCell>
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
                <p className="font-medium">Add Section</p>
                <p className="text-sm text-muted-foreground">Create a new class section</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Section</p>
                <p className="text-sm text-muted-foreground">Modify existing section details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Section</p>
                <p className="text-sm text-muted-foreground">Remove a section (if no enrolled learners)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download section data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload sections from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find sections by batch, program, or name</p>
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
              <AlertTitle>Duplicate Section Codes in Same Batch</AlertTitle>
              <AlertDescription>
                Each section code must be unique within a batch. You cannot have two &ldquo;Section A&rdquo;
                entries in the same batch. Use distinct codes like A, B, C or M1, M2, E1.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Creating Sections Without a Batch</AlertTitle>
              <AlertDescription>
                You must first create the batch before creating sections for it. Sections cannot exist
                independently - they are subdivisions of an existing batch.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Sections with Learners</AlertTitle>
              <AlertDescription>
                You cannot delete a section that has learners enrolled. First transfer the learners
                to another section or remove their enrollment, then delete the section.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Exceeding Maximum Capacity</AlertTitle>
              <AlertDescription>
                If you set a maximum capacity, the system will warn (but not prevent) you from
                enrolling more learners. Plan your section capacities carefully based on classroom size.
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
              <AccordionTrigger>How many sections should I create for a batch?</AccordionTrigger>
              <AccordionContent>
                The number of sections depends on the batch size and classroom capacity. A general rule:
                if your classrooms hold 60 learners and you have 150 learners, create 3 sections.
                Some institutions also create separate sections for different shifts (morning/evening)
                or specializations within a program.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can learners move between sections?</AccordionTrigger>
              <AccordionContent>
                Yes, learners can be transferred between sections within the same batch. Go to the
                Learners page, find the learner, edit their profile, and change the section assignment.
                This is commonly done at the start of a semester to balance section sizes or accommodate
                learner requests.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Do sections affect examination seating?</AccordionTrigger>
              <AccordionContent>
                Sections can be used to organize examination seating arrangements. The exam management
                module allows you to assign seating by section, making it easier to manage large batches.
                However, for final exams, learners from different sections are often mixed to prevent
                malpractice.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>What naming convention should I use for sections?</AccordionTrigger>
              <AccordionContent>
                Use a consistent naming convention across all programs. Common approaches include:
                <ul className="list-disc list-inside mt-2">
                  <li>Letters: A, B, C, D...</li>
                  <li>Numbers: 1, 2, 3, 4...</li>
                  <li>Shift-based: M1 (Morning 1), E1 (Evening 1)</li>
                  <li>Descriptive: Shift-A, Shift-B, Honours, Regular</li>
                </ul>
                Choose one pattern and apply it consistently.
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
              href="/doc/master/batches"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Users2 className="h-4 w-4 text-brand-green" />
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
              href="/doc/master/academic-years"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Calendar className="h-4 w-4 text-brand-green" />
              <span>Academic Years</span>
            </Link>
            <Link
              href="/doc/master/institutions"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <LayoutGrid className="h-4 w-4 text-brand-green" />
              <span>Institutions</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
