'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Landmark,
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
  Scale,
  Building2,
  GraduationCap
} from 'lucide-react'
import Link from 'next/link'

export default function BoardsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <Landmark className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Boards</h1>
            <p className="text-muted-foreground">Learn how to manage examination boards in JKKN COE</p>
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
            The <strong>Boards</strong> page allows you to define and manage examination boards or
            governing bodies that oversee academic standards and examinations. Boards can be university
            examination boards, affiliated boards, or internal examination committees.
          </p>
          <p>
            Each board defines the examination patterns, grading policies, and certification standards
            that apply to institutions and programs under its jurisdiction. Multiple institutions can
            be affiliated with the same board.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Board vs Regulation</AlertTitle>
            <AlertDescription>
              A <strong>Board</strong> is an examination authority (e.g., State University, UGC, Autonomous Board),
              while a <strong>Regulation</strong> is a specific set of academic rules issued by a board
              (e.g., &ldquo;CBCS Regulation 2020&rdquo;). A board can issue multiple regulations over time.
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
          <p className="mb-4">Only users with the following roles can access the Boards page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Boards are foundational entities that govern multiple institutions. Only Super Admins can
            create or modify board records to ensure data integrity.
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
            Sidebar → Master → Boards
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;Boards&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to Boards page</p>
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
          {/* Adding a New Board */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adding a New Board
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">+ Add Board</Badge> button at the top right of the page.</span>
              </li>
              <li className="pl-2">
                <span>A form panel will slide open from the right side.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Board Code</strong> (e.g., &ldquo;TNAU&rdquo;, &ldquo;AUTONOMOUS&rdquo;, &ldquo;UGC&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Board Name</strong> (e.g., &ldquo;Tamil Nadu Agricultural University&rdquo;).</span>
              </li>
              <li className="pl-2">
                <span>Select the <strong>Board Type</strong> (University, Autonomous, Affiliated, etc.).</span>
              </li>
              <li className="pl-2">
                <span>Optionally add a <strong>Description</strong> with details about the board.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Website URL</strong> if the board has an official website.</span>
              </li>
              <li className="pl-2">
                <span>Set the <strong>Status</strong> to Active or Inactive.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save</Badge> to create the board.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Add Board form</p>
            </div>
          </div>

          {/* Editing a Board */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing a Board
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Find the board you want to edit in the list.</span>
              </li>
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Edit</Badge> button (pencil icon) in the Actions column.</span>
              </li>
              <li className="pl-2">
                <span>The form will open with the existing board details pre-filled.</span>
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
              <p className="text-sm text-muted-foreground">Screenshot: Edit Board form</p>
            </div>
          </div>

          {/* Importing Boards */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importing Boards from Excel
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the <Badge variant="outline" className="mx-1">Import</Badge> button.</span>
              </li>
              <li className="pl-2">
                <span>Download the template file by clicking &ldquo;Download Template&rdquo;.</span>
              </li>
              <li className="pl-2">
                <span>Fill in the Excel template with your board data. Required columns:</span>
                <ul className="list-disc list-inside ml-6 mt-2 text-muted-foreground">
                  <li>board_code</li>
                  <li>board_name</li>
                  <li>board_type</li>
                  <li>description (optional)</li>
                  <li>website_url (optional)</li>
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
              <p className="text-sm text-muted-foreground">Screenshot: Import Boards dialog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each field in the Board form</CardDescription>
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
                <TableCell className="font-medium">Board Code</TableCell>
                <TableCell>A unique short code identifying the board (e.g., &ldquo;TNAU&rdquo;, &ldquo;MKU&rdquo;, &ldquo;UGC&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Board Name</TableCell>
                <TableCell>The full official name of the board (e.g., &ldquo;Tamil Nadu Agricultural University&rdquo;).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Board Type</TableCell>
                <TableCell>The category of the board: University, Autonomous, Affiliated, Central, State, Professional Body, etc.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Description</TableCell>
                <TableCell>Additional details about the board, its jurisdiction, and examination patterns.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Website URL</TableCell>
                <TableCell>The official website of the board for reference.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>Whether the board is Active or Inactive. Inactive boards won&apos;t appear in selections.</TableCell>
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
                <p className="font-medium">Add Board</p>
                <p className="text-sm text-muted-foreground">Create a new examination board</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Board</p>
                <p className="text-sm text-muted-foreground">Modify existing board details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Delete Board</p>
                <p className="text-sm text-muted-foreground">Remove a board (if no linked institutions)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Export</p>
                <p className="text-sm text-muted-foreground">Download board data as Excel/JSON</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Import</p>
                <p className="text-sm text-muted-foreground">Bulk upload boards from Excel</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Search className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Search & Filter</p>
                <p className="text-sm text-muted-foreground">Find boards by name, type, or code</p>
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
              <AlertTitle>Confusing Board with Institution</AlertTitle>
              <AlertDescription>
                A Board is an examination authority (like a university), while an Institution is a
                college or school that operates under that board. Don&apos;t create boards for individual
                colleges - they should be created as Institutions affiliated to a Board.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate Board Codes</AlertTitle>
              <AlertDescription>
                Each board code must be unique across the system. Before creating a new board, search
                to ensure it doesn&apos;t already exist under a different name or code.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Deleting Boards with Institutions</AlertTitle>
              <AlertDescription>
                You cannot delete a board that has institutions affiliated to it. First remove the
                institution affiliations or reassign them to another board before attempting to delete.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Incorrect Board Type Selection</AlertTitle>
              <AlertDescription>
                Choose the correct board type as it affects how the system handles examinations and
                certifications. &ldquo;Autonomous&rdquo; boards can set their own exam patterns, while &ldquo;Affiliated&rdquo;
                institutions must follow the parent university&apos;s patterns.
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
              <AccordionTrigger>What&apos;s the difference between a Board and a Regulation?</AccordionTrigger>
              <AccordionContent>
                A <strong>Board</strong> is an examination authority or governing body (like a university
                or autonomous council), while a <strong>Regulation</strong> is a specific set of academic
                rules issued by that board. For example, &ldquo;Madurai Kamaraj University&rdquo; is a board, and
                &ldquo;MKU CBCS Regulation 2020&rdquo; is a regulation issued by that board.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can an institution be affiliated with multiple boards?</AccordionTrigger>
              <AccordionContent>
                In most cases, an institution is affiliated with one primary board for degree programs.
                However, some institutions may have different programs under different boards (e.g.,
                technical programs under AICTE, management programs under a state university). The system
                supports this through program-level board assignments.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How does autonomous status affect board setup?</AccordionTrigger>
              <AccordionContent>
                Autonomous institutions can set their own examination patterns and curriculum within
                the framework of the parent university. In the system, you can either: (1) Create
                an &ldquo;Autonomous&rdquo; type board for such institutions, or (2) Keep them under the
                university board but flag them as autonomous in the institution settings.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>When should I create a new board vs using an existing one?</AccordionTrigger>
              <AccordionContent>
                Create a new board only when there&apos;s a genuinely distinct examination authority that
                sets its own patterns and issues certificates. If your institution follows an existing
                university&apos;s examination patterns, use that university as the board rather than
                creating a duplicate. Check existing boards before creating new ones.
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
              href="/doc/master/regulations"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <Scale className="h-4 w-4 text-brand-green" />
              <span>Regulations</span>
            </Link>
            <Link
              href="/doc/master/programs"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Programs</span>
            </Link>
            <Link
              href="/doc/master/degrees"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <GraduationCap className="h-4 w-4 text-brand-green" />
              <span>Degrees</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
