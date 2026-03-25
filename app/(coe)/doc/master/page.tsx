'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Building2,
  GraduationCap,
  BookOpen,
  Calendar,
  CalendarDays,
  Users2,
  Scale,
  LayoutGrid,
  Landmark,
  FileText,
  Info,
  ArrowRight,
  CheckCircle2
} from 'lucide-react'
import Link from 'next/link'

const masterModules = [
  {
    title: 'Institutions',
    description: 'Manage colleges and educational institutions under JKKN',
    icon: Building2,
    href: '/doc/master/institutions',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    features: ['Add/Edit institutions', 'Configure institution details', 'Manage affiliations']
  },
  {
    title: 'Degrees',
    description: 'Define degree types like B.Sc., M.A., MBA, etc.',
    icon: GraduationCap,
    href: '/doc/master/degrees',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    features: ['Create degree types', 'Set degree abbreviations', 'Manage degree categories']
  },
  {
    title: 'Departments',
    description: 'Manage academic departments within institutions',
    icon: BookOpen,
    href: '/doc/master/departments',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    features: ['Create departments', 'Assign HOD details', 'Link to institutions']
  },
  {
    title: 'Programs',
    description: 'Create academic programs offered by institutions',
    icon: GraduationCap,
    href: '/doc/master/programs',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    features: ['Define programs', 'Set duration & semesters', 'Link to degrees & departments']
  },
  {
    title: 'Semesters',
    description: 'Configure semester structure for programs',
    icon: Calendar,
    href: '/doc/master/semesters',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    features: ['Define semester numbers', 'Set semester names', 'Configure for all programs']
  },
  {
    title: 'Academic Years',
    description: 'Manage academic year periods (e.g., 2024-25)',
    icon: CalendarDays,
    href: '/doc/master/academic-years',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    features: ['Create academic years', 'Set current year', 'Define date ranges']
  },
  {
    title: 'Batches',
    description: 'Create learner batches for each admission year',
    icon: Users2,
    href: '/doc/master/batches',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    features: ['Create batches', 'Link to programs', 'Assign regulations']
  },
  {
    title: 'Regulations',
    description: 'Define academic regulations and curriculum frameworks',
    icon: Scale,
    href: '/doc/master/regulations',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    features: ['Create regulations', 'Set effective years', 'Define grading rules']
  },
  {
    title: 'Sections',
    description: 'Create class sections within batches',
    icon: LayoutGrid,
    href: '/doc/master/sections',
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    features: ['Create sections (A, B, C)', 'Set capacity limits', 'Manage classroom divisions']
  },
  {
    title: 'Boards',
    description: 'Manage examination boards and governing bodies',
    icon: Landmark,
    href: '/doc/master/boards',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    features: ['Define boards', 'Set board types', 'Link to institutions']
  },
  {
    title: 'PDF Settings',
    description: 'Configure document generation settings',
    icon: FileText,
    href: '/doc/master/pdf-settings',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    features: ['Upload logos', 'Configure signatures', 'Set document layouts']
  }
]

const setupOrder = [
  { step: 1, name: 'Boards', description: 'Create examination boards first' },
  { step: 2, name: 'Institutions', description: 'Add institutions affiliated to boards' },
  { step: 3, name: 'Departments', description: 'Create departments within institutions' },
  { step: 4, name: 'Degrees', description: 'Define degree types (B.Sc., M.A., etc.)' },
  { step: 5, name: 'Regulations', description: 'Create academic regulations' },
  { step: 6, name: 'Programs', description: 'Create programs linking degrees, departments' },
  { step: 7, name: 'Semesters', description: 'Define semester structure (1-8)' },
  { step: 8, name: 'Academic Years', description: 'Create academic year periods' },
  { step: 9, name: 'Batches', description: 'Create learner batches per program' },
  { step: 10, name: 'Sections', description: 'Create class sections within batches' },
  { step: 11, name: 'PDF Settings', description: 'Configure document generation' }
]

export default function MasterDocPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-heading">Master Data Documentation</h1>
            <p className="text-muted-foreground">Complete guide to setting up and managing master data in JKKN COE</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-brand-green/10 text-brand-green border-brand-green/20">
            Master Module
          </Badge>
          <Badge variant="outline">
            11 Sub-modules
          </Badge>
        </div>
      </div>

      {/* Overview */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-brand-green" />
            <CardTitle>What is Master Data?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Master Data forms the foundation of the JKKN COE examination system. These are the core
            entities that define your institutional structure, academic programs, and operational
            parameters. Master data must be set up before you can manage learners, courses, or examinations.
          </p>
          <p>
            The Master module includes 11 sub-modules that work together to define your complete
            academic ecosystem. Proper setup of master data ensures smooth operations across all
            other modules of the system.
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Setup Order Matters</AlertTitle>
            <AlertDescription>
              Master data entities have dependencies. For example, you need to create Institutions
              before Departments, and Departments before Programs. Follow the recommended setup
              order below for a smooth configuration experience.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Recommended Setup Order */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Recommended Setup Order</CardTitle>
          <CardDescription>Follow this sequence when setting up master data for the first time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {setupOrder.map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <div className="h-8 w-8 rounded-full bg-brand-green text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {item.step}
                </div>
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Module Cards */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading mb-4">Master Data Modules</h2>
        <p className="text-muted-foreground mb-6">
          Click on any module below to view its detailed documentation including step-by-step guides,
          field explanations, and FAQs.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {masterModules.map((module) => (
            <Link
              key={module.title}
              href={module.href}
              className="group"
            >
              <Card className="h-full hover:shadow-md transition-shadow border-2 hover:border-brand-green/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${module.bgColor} flex items-center justify-center`}>
                      <module.icon className={`h-5 w-5 ${module.color}`} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg group-hover:text-brand-green transition-colors">
                        {module.title}
                      </CardTitle>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-brand-green group-hover:translate-x-1 transition-all" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-3">{module.description}</p>
                  <div className="space-y-1">
                    {module.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 text-brand-green" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Common Tasks */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Common Tasks</CardTitle>
          <CardDescription>Quick links to frequently performed operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border">
              <h3 className="font-semibold mb-2">Adding a New Program</h3>
              <p className="text-sm text-muted-foreground mb-2">
                To add a new academic program, you need: Institution, Degree, Department, and Regulation already created.
              </p>
              <Link href="/doc/master/programs" className="text-sm text-brand-green hover:underline">
                Learn more →
              </Link>
            </div>
            <div className="p-4 rounded-lg border">
              <h3 className="font-semibold mb-2">Creating a New Batch</h3>
              <p className="text-sm text-muted-foreground mb-2">
                For new admissions, create a batch linking the program, regulation, and academic year.
              </p>
              <Link href="/doc/master/batches" className="text-sm text-brand-green hover:underline">
                Learn more →
              </Link>
            </div>
            <div className="p-4 rounded-lg border">
              <h3 className="font-semibold mb-2">Setting Up PDF Documents</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Configure logos, signatures, and layout for hall tickets, mark sheets, and certificates.
              </p>
              <Link href="/doc/master/pdf-settings" className="text-sm text-brand-green hover:underline">
                Learn more →
              </Link>
            </div>
            <div className="p-4 rounded-lg border">
              <h3 className="font-semibold mb-2">New Academic Year Setup</h3>
              <p className="text-sm text-muted-foreground mb-2">
                At the start of each session, create the new academic year and set it as current.
              </p>
              <Link href="/doc/master/academic-years" className="text-sm text-brand-green hover:underline">
                Learn more →
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips Section */}
      <Card>
        <CardHeader>
          <CardTitle>Tips for Master Data Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-green text-sm font-bold">1</span>
              </div>
              <div>
                <p className="font-medium">Use Consistent Naming Conventions</p>
                <p className="text-sm text-muted-foreground">
                  Establish and follow consistent patterns for codes and names across all modules.
                  For example, use &ldquo;BSC-CS&rdquo; format for all program codes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-green text-sm font-bold">2</span>
              </div>
              <div>
                <p className="font-medium">Verify Before Saving</p>
                <p className="text-sm text-muted-foreground">
                  Double-check all entries before saving, especially institution names and codes.
                  Errors in master data propagate to all related records.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-green text-sm font-bold">3</span>
              </div>
              <div>
                <p className="font-medium">Use Import for Bulk Data</p>
                <p className="text-sm text-muted-foreground">
                  When adding multiple records, use the Excel import feature instead of adding one by one.
                  Download the template, fill it offline, and upload.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-green text-sm font-bold">4</span>
              </div>
              <div>
                <p className="font-medium">Export Before Major Changes</p>
                <p className="text-sm text-muted-foreground">
                  Before making significant changes to master data, export the current data as a backup.
                  This helps in recovery if something goes wrong.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
