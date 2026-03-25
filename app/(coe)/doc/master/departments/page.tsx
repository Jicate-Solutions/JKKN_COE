'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Building2,
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
  ImageIcon
} from 'lucide-react'
import Link from 'next/link'

export default function DepartmentsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Departments</h1>
            <p className="text-muted-foreground">Learn how to manage academic departments in JKKN COE</p>
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
            The <strong>Departments</strong> page allows you to create and manage academic departments
            within your institution. Departments are organizational units that group related programs,
            courses, and faculty members.
          </p>
          <p>
            Each department is linked to an institution and can offer multiple programs. For example,
            the &ldquo;Department of Computer Science&rdquo; might offer programs like B.Sc. Computer Science,
            M.Sc. Computer Science, and BCA.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              Departments must be created before you can assign programs, courses, or faculty to them.
              This is a foundational setup step in your examination system.
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
          <p className="mb-4">Only users with the following roles can access the Departments page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
            <Badge variant="outline">Deputy COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Faculty and office staff can view department information but cannot create or modify department records.
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
            Sidebar → Master → Departments
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Departments&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Departments page</p>
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
          {/* Adding a New Department */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Department
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Department</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Institution</strong> from the dropdown (required).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Department Code</strong> (e.g., &ldquo;CS&rdquo;, &ldquo;ECE&rdquo;, &ldquo;MBA&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Department Name</strong> (e.g., &ldquo;Computer Science&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Optionally add a <strong>Description</strong> for the department.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>HOD Name</strong> (Head of Department) if applicable.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the department.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Department form</p>
            </div>
          </div>

          {/* Editing a Department */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Department
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the department you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing department details pre-filled.</span>
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
              <p className="text-sm text-muted-foreground">Screenshot: Edit Department form</p>
            </div>
          </div>

          {/* Importing Departments */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importing Departments from Excel
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file by clicking &ldquo;Download Template&rdquo;.</span>
              </li>
              <li className="pl-2">
                <span>Fill in the Excel template with your department data. Required columns:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>institution_code (must match an existing institution)</li>
                  <li>department_code</li>
                  <li>department_name</li>
                  <li>description (optional)</li>
                  <li>hod_name (optional)</li>
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
              <p className="text-sm text-muted-foreground">Screenshot: Import Departments dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Department form</CardDescription>
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
                <TableCell>The parent institution this department belongs to. Select from the dropdown list of registered institutions.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Department Code</TableCell>
                <TableCell>A unique short code for the department (e.g., &ldquo;CS&rdquo;, &ldquo;ECE&rdquo;, &ldquo;ME&rdquo;). Used for internal identification and reports.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Department Name</TableCell>
                <TableCell>The full name of the department (e.g., &ldquo;Computer Science and Engineering&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Description</TableCell>
                <TableCell>Additional details about the department, such as focus areas or specializations.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">HOD Name</TableCell>
                <TableCell>Name of the Head of Department. This is for reference and can be updated as needed.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the department is currently Active or Inactive. Inactive departments won&apos;t appear in dropdown selections.</TableCell>
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
                <p className="font-medium">Add Department</p>
                <p className="text-sm text-muted-foreground">Create a new academic department</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Department</p>
                <p className="text-sm text-muted-foreground">Modify existing department details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Department</p>
                <p className="text-sm text-muted-foreground">Remove a department (if no linked data)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download department data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload departments from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find departments by name, code, or institution</p>
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
              <AlertTitle>Using Duplicate Department Codes</AlertTitle>
              <AlertDescription>
                Each department code must be unique within an institution. If you get a duplicate error,
                check existing departments and use a different code.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Invalid Institution Code in Import</AlertTitle>
              <AlertDescription>
                When importing, the institution_code must exactly match an existing institution&apos;s code.
                Check for typos or extra spaces in your Excel file.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Departments with Programs</AlertTitle>
              <AlertDescription>
                You cannot delete a department that has programs assigned to it. First reassign or
                remove the programs, then delete the department.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Setting Wrong Status</AlertTitle>
              <AlertDescription>
                Inactive departments won&apos;t appear in dropdown selections for programs or courses.
                Only mark a department as Inactive if it&apos;s no longer operating.
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
              <AccordionTrigger>Can one department belong to multiple institutions?</AccordionTrigger>
              <AccordionContent>
                No, each department belongs to exactly one institution. If you have similar departments
                across multiple institutions (e.g., &ldquo;Computer Science&rdquo; at both arts and engineering colleges),
                you need to create separate department records for each institution.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How do I transfer a program from one department to another?</AccordionTrigger>
              <AccordionContent>
                Go to the Programs page, find the program you want to transfer, and edit it. In the edit
                form, change the &ldquo;Offering Department&rdquo; field to select the new department. Save the changes.
                The program will now be associated with the new department.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>What happens to students if I deactivate a department?</AccordionTrigger>
              <AccordionContent>
                Deactivating a department does not affect existing student records or their enrolled
                programs. However, you won&apos;t be able to assign new students or create new programs under
                an inactive department. Existing data remains accessible for reporting and records.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Can I change the department code after creation?</AccordionTrigger>
              <AccordionContent>
                Yes, you can edit the department code, but exercise caution. Changing the code may affect
                reports and imports that reference the old code. It&apos;s best to set the correct code during
                initial creation. If you must change it, update any external references accordingly.
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
              href="/doc/master/programs"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Programs</span>
            </Link>
            <Link
              href="/doc/master/degrees"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Degrees</span>
            </Link>
            <Link
              href="/doc/master/courses"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-4 w-4 text-brand-green" />
              <span>Courses</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
