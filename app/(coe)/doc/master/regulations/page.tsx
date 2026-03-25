'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Scale,
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
  BookOpen
} from 'lucide-react'
import Link from 'next/link'

export default function RegulationsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <Scale className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Regulations</h1>
            <p className="text-muted-foreground">Learn how to manage academic regulations in JKKN COE</p>
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
            The <strong>Regulations</strong> page allows you to define and manage academic regulations
            that govern curriculum, grading systems, examination patterns, and evaluation criteria.
            Regulations are typically issued by universities and apply to specific batches of students.
          </p>
          <p>
            Each regulation defines the rules for a specific period (e.g., Regulation 2020, Regulation 2023)
            and determines the curriculum structure, credit system, grading scale, and examination patterns
            that apply to students admitted under that regulation.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Why Regulations Matter</AlertTitle>
            <AlertDescription>
              Students follow the regulation under which they were admitted throughout their program.
              Even if a new regulation is introduced, existing students continue under their original
              regulation. This ensures consistency in curriculum and evaluation criteria for each batch.
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
          <p className="mb-4">Only users with the following roles can access the Regulations page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Regulations are critical academic governance documents. Only senior administrators can create
            or modify them to ensure compliance with university guidelines.
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
            Sidebar → Master → Regulations
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Regulations&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Regulations page</p>
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
          {/* Adding a New Regulation */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Regulation
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Regulation</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Institution</strong> from the dropdown.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Regulation Code</strong> (e.g., &ldquo;R2020&rdquo;, &ldquo;REG-2023&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Regulation Name</strong> (e.g., &ldquo;Regulation 2020&rdquo;, &ldquo;CBCS Regulation 2023&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Effective From Year</strong> (when this regulation starts applying).</span>
              </li>
              <li className="pl-2">
                <span>Optionally set the <strong>Effective To Year</strong> (when this regulation stops applying to new batches).</span>
              </li>
              <li className="pl-2">
                <span>Add a <strong>Description</strong> with key highlights of the regulation.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the regulation.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Regulation form</p>
            </div>
          </div>

          {/* Editing a Regulation */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Regulation
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the regulation you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing regulation details pre-filled.</span>
              </li>
              <li className="pl-2">
                <span>Make your changes to any of the fields.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Update</Badge> to save the changes.</span>
              </li>
            </ol>

            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Caution</AlertTitle>
              <AlertDescription>
                Modifying a regulation that already has batches assigned to it may affect grading and
                curriculum for those students. Consult with academic authorities before making changes
                to active regulations.
              </AlertDescription>
            </Alert>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Edit Regulation form</p>
            </div>
          </div>

          {/* Importing Regulations */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importing Regulations from Excel
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file by clicking &ldquo;Download Template&rdquo;.</span>
              </li>
              <li className="pl-2">
                <span>Fill in the Excel template with your regulation data. Required columns:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>institution_code (must match existing institution)</li>
                  <li>regulation_code</li>
                  <li>regulation_name</li>
                  <li>effective_from_year</li>
                  <li>effective_to_year (optional)</li>
                  <li>description (optional)</li>
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
              <p className="text-sm text-muted-foreground">Screenshot: Import Regulations dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Regulation form</CardDescription>
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
                <TableCell>The institution where this regulation applies. Select from the dropdown.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Regulation Code</TableCell>
                <TableCell>A unique code identifying the regulation (e.g., &ldquo;R2020&rdquo;, &ldquo;CBCS-2023&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Regulation Name</TableCell>
                <TableCell>The full display name (e.g., &ldquo;Regulation 2020&rdquo;, &ldquo;Choice Based Credit System 2023&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Effective From Year</TableCell>
                <TableCell>The year when this regulation starts applying to new admissions (e.g., 2020).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Effective To Year</TableCell>
                <TableCell>The last year this regulation applies to new admissions. Leave blank if still active.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Description</TableCell>
                <TableCell>Key highlights of the regulation: grading system, credit structure, exam patterns, etc.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the regulation is Active or Inactive. Inactive regulations won&apos;t appear in selections.</TableCell>
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
                <p className="font-medium">Add Regulation</p>
                <p className="text-sm text-muted-foreground">Create a new academic regulation</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Regulation</p>
                <p className="text-sm text-muted-foreground">Modify existing regulation details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Regulation</p>
                <p className="text-sm text-muted-foreground">Remove a regulation (if no linked batches)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download regulation data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload regulations from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find regulations by code or year</p>
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
              <AlertTitle>Overlapping Effective Years</AlertTitle>
              <AlertDescription>
                Be careful with effective year ranges. If Regulation 2020 is effective from 2020 to 2022,
                Regulation 2023 should start from 2023. Overlapping ranges can cause confusion when
                assigning batches.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Modifying Active Regulations</AlertTitle>
              <AlertDescription>
                Avoid modifying regulations that have batches currently studying under them. Changes to
                grading scales or credit structures can affect student results and transcripts. Create
                a new regulation instead if significant changes are needed.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Regulations with Batches</AlertTitle>
              <AlertDescription>
                You cannot delete a regulation that has batches assigned to it. First reassign those
                batches to a different regulation (with proper approvals) before attempting to delete.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Missing Critical Details in Description</AlertTitle>
              <AlertDescription>
                The description should include key information like grading scale (10-point, letter grade),
                minimum passing marks, credit requirements, and examination patterns. This helps users
                understand the regulation without referring to external documents.
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
              <AccordionTrigger>What happens when a new regulation is introduced?</AccordionTrigger>
              <AccordionContent>
                When a new regulation is introduced (e.g., Regulation 2023), it applies only to
                <strong> newly admitted batches</strong> from that year onwards. Existing batches continue
                under their original regulation until they graduate. This ensures fairness and consistency
                for all students.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can students switch between regulations?</AccordionTrigger>
              <AccordionContent>
                Generally, no. Students follow the regulation under which they were admitted. However,
                in exceptional cases (like readmission after a gap, lateral entry), the institution may
                assign students to a different regulation based on policy. This requires administrative
                approval and manual record updates.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How do regulations affect course curriculum?</AccordionTrigger>
              <AccordionContent>
                Regulations define the curriculum framework: credit requirements, course structure,
                elective options, and practical components. When you create course mappings in the
                Curriculum section, you specify which regulation they apply to. This allows different
                batches to have different curriculum structures based on their regulation.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Should I create institution-specific or common regulations?</AccordionTrigger>
              <AccordionContent>
                This depends on your governance structure. If all institutions under a university follow
                the same regulations, you can create one regulation and link it to all institutions.
                If each institution has autonomy over academic policies, create separate regulations
                for each. The system supports both approaches.
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
              href="/doc/master/institutions"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-brand-green" />
              <span>Institutions</span>
            </Link>
            <Link
              href="/doc/master/boards"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Scale className="h-4 w-4 text-brand-green" />
              <span>Boards</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
