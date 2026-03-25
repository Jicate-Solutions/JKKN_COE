'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  FileText,
  Info,
  Users,
  MousePointer,
  ListChecks,
  AlertTriangle,
  HelpCircle,
  Link2,
  Plus,
  Pencil,
  Download,
  Settings,
  ImageIcon,
  Building2,
  FileImage,
  Palette
} from 'lucide-react'
import Link from 'next/link'

export default function PDFSettingsDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">PDF Settings</h1>
            <p className="text-muted-foreground">Learn how to configure PDF generation settings in JKKN COE</p>
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
            The <strong>PDF Settings</strong> page allows you to configure how official documents are
            generated, including hall tickets, mark sheets, certificates, and reports. These settings
            control the visual appearance, branding, and layout of all PDF documents produced by the system.
          </p>
          <p>
            Each institution can have its own PDF settings, allowing customization of logos, signatures,
            watermarks, headers, footers, and other branding elements. This ensures all generated documents
            reflect the institution&apos;s official identity.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Institution-Specific Settings</AlertTitle>
            <AlertDescription>
              PDF settings are configured per institution. If you manage multiple institutions, each
              can have its own logos, signatures, and formatting preferences. Make sure to select
              the correct institution when configuring settings.
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
          <p className="mb-4">Only users with the following roles can access the PDF Settings page:</p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-brand-green text-white">Super Admin</Badge>
            <Badge variant="outline">COE</Badge>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            PDF settings affect official document generation and should only be modified by authorized
            administrators to maintain document authenticity.
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
            Sidebar → Master → PDF Settings
          </div>
          <p className="mt-4 text-muted-foreground">
            Navigate to the Master section in the sidebar, then click on &ldquo;PDF Settings&rdquo; to open this page.
          </p>

          {/* Screenshot Placeholder */}
          <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Screenshot: Navigation to PDF Settings page</p>
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
          {/* Configuring Institution PDF Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuring Institution PDF Settings
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Select the <strong>Institution</strong> you want to configure from the dropdown.</span>
              </li>
              <li className="pl-2">
                <span>If settings exist, they will load automatically. If not, click <Badge variant="outline" className="mx-1">+ Add Settings</Badge>.</span>
              </li>
              <li className="pl-2">
                <span>Upload the <strong>Institution Logo</strong> (recommended: PNG, transparent background, 200x200px).</span>
              </li>
              <li className="pl-2">
                <span>Upload the <strong>University Logo</strong> if different from institution logo.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Institution Name</strong> as it should appear on documents.</span>
              </li>
              <li className="pl-2">
                <span>Enter the <strong>Institution Address</strong> for the document header.</span>
              </li>
              <li className="pl-2">
                <span>Configure <strong>Header Text</strong> and <strong>Footer Text</strong> for documents.</span>
              </li>
              <li className="pl-2">
                <span>Upload <strong>Authorized Signature</strong> images if required.</span>
              </li>
              <li className="pl-2">
                <span>Click <Badge className="bg-brand-green text-white mx-1">Save Settings</Badge> to apply the configuration.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: PDF Settings configuration form</p>
            </div>
          </div>

          {/* Uploading Logos and Images */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileImage className="h-4 w-4" />
              Uploading Logos and Images
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Click the upload area for the image you want to add (logo, signature, watermark).</span>
              </li>
              <li className="pl-2">
                <span>Select an image file from your computer (supported: PNG, JPG, JPEG).</span>
              </li>
              <li className="pl-2">
                <span>The image will be uploaded and a preview will be shown.</span>
              </li>
              <li className="pl-2">
                <span>To remove or replace an image, click the remove button or upload a new file.</span>
              </li>
            </ol>

            <Alert className="mt-4">
              <Info className="h-4 w-4" />
              <AlertTitle>Image Recommendations</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><strong>Logos:</strong> PNG with transparent background, 200x200px minimum</li>
                  <li><strong>Signatures:</strong> PNG with transparent background, high resolution</li>
                  <li><strong>Watermarks:</strong> Light/faded PNG images, typically 50% opacity</li>
                  <li><strong>File size:</strong> Keep under 2MB for faster loading</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Image upload interface</p>
            </div>
          </div>

          {/* Customizing Document Appearance */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Customizing Document Appearance
            </h3>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="pl-2">
                <span>Configure <strong>Font Settings</strong>: Choose font family and sizes for different elements.</span>
              </li>
              <li className="pl-2">
                <span>Set <strong>Page Margins</strong>: Define top, bottom, left, and right margins.</span>
              </li>
              <li className="pl-2">
                <span>Configure <strong>Colors</strong>: Set header color, accent color, and text colors.</span>
              </li>
              <li className="pl-2">
                <span>Enable/disable <strong>Watermark</strong>: Add background watermark to documents.</span>
              </li>
              <li className="pl-2">
                <span>Configure <strong>Page Numbers</strong>: Choose position and format.</span>
              </li>
              <li className="pl-2">
                <span>Preview changes by generating a sample document.</span>
              </li>
            </ol>

            {/* Screenshot Placeholder */}
            <div className="mt-4 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Screenshot: Document appearance customization</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Explanation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Field Explanation</CardTitle>
          <CardDescription>Understanding each setting in the PDF Settings configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Setting Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Institution</TableCell>
                <TableCell>The institution for which these PDF settings apply.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Institution Logo</TableCell>
                <TableCell>The institution&apos;s logo to display on documents (appears in header).</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">University Logo</TableCell>
                <TableCell>The affiliating university&apos;s logo (if different from institution).</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Institution Name</TableCell>
                <TableCell>Official name as it should appear on documents.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Institution Address</TableCell>
                <TableCell>Full address for document headers.</TableCell>
                <TableCell><Badge variant="destructive">Yes</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Header Text</TableCell>
                <TableCell>Additional text to appear in the document header area.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Footer Text</TableCell>
                <TableCell>Text to appear at the bottom of each page (e.g., &ldquo;This is a computer-generated document&rdquo;).</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">COE Signature</TableCell>
                <TableCell>Controller of Examinations signature image for certificates.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Principal Signature</TableCell>
                <TableCell>Principal/Director signature image for certificates.</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Watermark</TableCell>
                <TableCell>Background watermark image (e.g., institution logo at low opacity).</TableCell>
                <TableCell><Badge variant="outline">No</Badge></TableCell>
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
                <p className="font-medium">Add Settings</p>
                <p className="text-sm text-muted-foreground">Create PDF settings for an institution</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Pencil className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Edit Settings</p>
                <p className="text-sm text-muted-foreground">Modify existing PDF settings</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <FileImage className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Upload Images</p>
                <p className="text-sm text-muted-foreground">Upload logos, signatures, watermarks</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Download className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium">Preview Document</p>
                <p className="text-sm text-muted-foreground">Generate sample PDF to test settings</p>
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
              <AlertTitle>Using Low-Resolution Images</AlertTitle>
              <AlertDescription>
                Low-resolution logos and signatures will appear pixelated when printed. Always use
                high-resolution images (minimum 300 DPI) for professional-looking documents.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Uploading Images Without Transparent Background</AlertTitle>
              <AlertDescription>
                Logos and signatures should have transparent backgrounds (PNG format). White backgrounds
                will show as white boxes on documents, looking unprofessional.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Not Testing Before Going Live</AlertTitle>
              <AlertDescription>
                Always generate a sample document and review it before using settings for actual
                certificates or mark sheets. Check alignment, image quality, and text formatting.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Incorrect Institution Name Spelling</AlertTitle>
              <AlertDescription>
                Double-check the institution name spelling before saving. Errors will appear on all
                generated documents and may require re-issuing certificates.
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
              <AccordionTrigger>What image formats are supported for logos?</AccordionTrigger>
              <AccordionContent>
                The system supports PNG, JPG, and JPEG formats. PNG is strongly recommended for
                logos and signatures because it supports transparent backgrounds. JPG/JPEG should
                only be used for photographs where transparency isn&apos;t needed.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can I use different settings for different document types?</AccordionTrigger>
              <AccordionContent>
                Currently, PDF settings apply to all documents from an institution. However, specific
                document types (hall tickets, mark sheets, certificates) may use different sections
                of the settings. For example, certificates use signature images while hall tickets
                may not. Future versions may support per-document-type customization.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How do I update the signature when the COE changes?</AccordionTrigger>
              <AccordionContent>
                Simply upload a new signature image to replace the existing one. Go to PDF Settings,
                find the signature upload area, click to upload the new image, and save. All future
                documents will use the new signature. Previously generated documents retain the
                signature that was active at the time of generation.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>What happens to already generated PDFs if I change settings?</AccordionTrigger>
              <AccordionContent>
                Previously generated PDFs remain unchanged - they keep their original appearance.
                Only newly generated documents will use the updated settings. If you need to update
                existing documents (like re-issuing a certificate), you&apos;ll need to regenerate them
                after changing the settings.
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
              <FileText className="h-4 w-4 text-brand-green" />
              <span>Regulations</span>
            </Link>
            <Link
              href="/doc/master/boards"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 text-brand-green" />
              <span>Boards</span>
            </Link>
            <Link
              href="/doc/master/degrees"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 text-brand-green" />
              <span>Degrees</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
