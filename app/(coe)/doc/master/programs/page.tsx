'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  GraduationCap,
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
  Building2
} from 'lucide-react'
import Link from 'next/link'

export default function ProgramsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Programs</h1>
            <p className="text-muted-foreground">Learn how to manage academic programs in JKKN COE</p>
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
            The <strong>Programs</strong> page allows you to create and manage academic programs offered
            by your institution. A program represents a specific course of study that leads to a degree,
            such as &ldquo;B.Sc. Computer Science&rdquo; or &ldquo;MBA Finance&rdquo;.
          </p>
          <p>
            Programs connect several master data entities together: they are linked to an institution,
            a degree type, a department that offers them, and regulations that govern them. Students
            enroll in programs, not just degrees.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Program vs Degree</AlertTitle>
            <AlertDescription>
              A <strong>Degree</strong> is a qualification type (e.g., B.Sc., M.A., MBA), while a <strong>Program</strong> is
              a specific course of study under that degree (e.g., B.Sc. Computer Science, B.Sc. Physics).
              Multiple programs can share the same degree type.
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
          <p className="mb-4">Only users with the following roles can access the Programs page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
            <Badge variant="outline">Deputy COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Faculty and office staff can view program information but cannot create or modify program records.
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
            Sidebar → Master → Programs
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Programs&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Programs page</p>
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
          {/* Adding a New Program */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Program
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Program</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Institution</strong> from the dropdown (required).</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Degree</strong> type (e.g., B.Sc., M.A., MBA).</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Offering Department</strong> that will conduct this program.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Program Code</strong> (e.g., &ldquo;BSC-CS&rdquo;, &ldquo;MBA-FIN&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Program Name</strong> (e.g., &ldquo;Bachelor of Science in Computer Science&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Duration</strong> in years (e.g., 3 for undergraduate, 2 for postgraduate).</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Total Semesters</strong> (e.g., 6 for a 3-year program with 2 semesters per year).</span>
              </li>
              <li className="pl-2">
                <span>Optionally add a <strong>Description</strong> for the program.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the program.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Program form</p>
            </div>
          </div>

          {/* Editing a Program */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Program
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the program you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing program details pre-filled.</span>
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
              <p className="text-sm text-muted-foreground">Screenshot: Edit Program form</p>
            </div>
          </div>

          {/* Importing Programs */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importing Programs from Excel
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file by clicking &ldquo;Download Template&rdquo;.</span>
              </li>
              <li className="pl-2">
                <span>Fill in the Excel template with your program data. Required columns:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>institution_code (must match existing institution)</li>
                  <li>degree_code (must match existing degree)</li>
                  <li>offering_department_code (must match existing department)</li>
                  <li>program_code</li>
                  <li>program_name</li>
                  <li>duration_years</li>
                  <li>total_semesters</li>
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
              <p className="text-sm text-muted-foreground">Screenshot: Import Programs dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Program form</CardDescription>
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
                <TableCell>The institution offering this program. Select from the dropdown.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Degree</TableCell>
                <TableCell>The degree type this program awards (e.g., B.Sc., M.A., MBA).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Offering Department</TableCell>
                <TableCell>The department responsible for conducting this program.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Program Code</TableCell>
                <TableCell>A unique short code for the program (e.g., &ldquo;BSC-CS&rdquo;, &ldquo;MBA-HR&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Program Name</TableCell>
                <TableCell>The full name of the program (e.g., &ldquo;Bachelor of Science in Computer Science&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Duration (Years)</TableCell>
                <TableCell>How many years the program takes to complete (e.g., 3, 4, 2).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Total Semesters</TableCell>
                <TableCell>Total number of semesters in the program (e.g., 6 for 3-year program).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Description</TableCell>
                <TableCell>Additional details about the program, specializations, or focus areas.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the program is currently Active or Inactive for new admissions.</TableCell>
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
                <p className="font-medium">Add Program</p>
                <p className="text-sm text-muted-foreground">Create a new academic program</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Program</p>
                <p className="text-sm text-muted-foreground">Modify existing program details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Program</p>
                <p className="text-sm text-muted-foreground">Remove a program (if no enrolled students)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download program data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload programs from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find programs by name, degree, or department</p>
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
              <AlertTitle>Mismatched Duration and Semesters</AlertTitle>
              <AlertDescription>
                Ensure the total semesters matches the duration. A 3-year program with 2 semesters per year
                should have 6 total semesters, not 3.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Using Wrong Foreign Key Codes in Import</AlertTitle>
              <AlertDescription>
                When importing, ensure institution_code, degree_code, and department_code exactly match
                existing records. Check for typos, extra spaces, or case sensitivity issues.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Programs with Students</AlertTitle>
              <AlertDescription>
                You cannot delete a program that has enrolled students. First transfer or graduate the
                students, then delete the program. Consider marking it Inactive instead.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Creating Duplicate Program Codes</AlertTitle>
              <AlertDescription>
                Each program code must be unique within an institution. If you offer the same program at
                multiple campuses, use distinct codes like &ldquo;BSC-CS-MAIN&rdquo; and &ldquo;BSC-CS-NORTH&rdquo;.
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
              <AccordionTrigger>What&apos;s the difference between a Program and a Degree?</AccordionTrigger>
              <AccordionContent>
                A <strong>Degree</strong> is a type of academic qualification (like B.Sc., M.A., or MBA),
                while a <strong>Program</strong> is a specific course of study that leads to that degree.
                For example, &ldquo;B.Sc. Computer Science&rdquo; and &ldquo;B.Sc. Physics&rdquo; are two different programs
                that both award the same B.Sc. degree.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can I change the degree type of an existing program?</AccordionTrigger>
              <AccordionContent>
                Yes, you can edit the program and change its degree type. However, this is not recommended
                if students are already enrolled, as it may affect their academic records and certificates.
                In such cases, it&apos;s better to create a new program with the correct degree type.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How do I add courses to a program?</AccordionTrigger>
              <AccordionContent>
                Courses are linked to programs through the curriculum structure. After creating a program,
                go to the Courses page to create courses, then use the Curriculum page to map courses to
                specific programs and semesters. This creates the complete program curriculum.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Can multiple departments offer the same program?</AccordionTrigger>
              <AccordionContent>
                In this system, each program is offered by one department (the &ldquo;Offering Department&rdquo;).
                If you have an interdisciplinary program, assign it to the primary coordinating department.
                If the same program is truly offered independently by multiple departments, create separate
                program records with distinct codes.
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
              href="/doc/master/institutions"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Institutions</span>
            </Link>
            <Link
              href="/doc/master/degrees"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Degrees</span>
            </Link>
            <Link
              href="/doc/master/departments"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Departments</span>
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
