"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition } from "@/components/common/page-transition"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/common/use-toast"
import { useFormValidation, ValidationPresets } from "@/hooks/common/use-form-validation"
import Link from "next/link"
import { Building2, ArrowLeft, Truck, UserCog, DollarSign, GraduationCap, Briefcase, Shield } from "lucide-react"

import type { DepartmentInfo, InstitutionFormData } from "@/types/institutions"
import { createInstitution } from "@/services/master/institutions-service"

export default function AddInstitutionPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    institution_code: "",
    name: "",
    phone: "",
    email: "",
    website: "",
    counselling_code: "",
    accredited_by: "",
    address_line1: "",
    address_line2: "",
    address_line3: "",
    city: "",
    state: "",
    country: "",
    pin_code: "",
    logo_url: "",
    institution_type: "university",
    timetable_type: "week_order",
    transportation_dept: {} as DepartmentInfo,
    administration_dept: {} as DepartmentInfo,
    accounts_dept: {} as DepartmentInfo,
    admission_dept: {} as DepartmentInfo,
    placement_dept: {} as DepartmentInfo,
    anti_ragging_dept: {} as DepartmentInfo,
    is_active: true,
  })

  const { errors, validate, clearErrors } = useFormValidation({
    institution_code: [ValidationPresets.required('Institution code is required')],
    name: [ValidationPresets.required('Institution name is required')],
    email: [ValidationPresets.email('Invalid email address')],
  })

  const handleSave = async () => {
    if (!validate(formData)) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please fix all validation errors before submitting.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
      return
    }

    try {
      setLoading(true)
      const newInstitution = await createInstitution(formData as InstitutionFormData)

      toast({
        title: "✅ Institution Created",
        description: `${newInstitution.name} has been successfully created.`,
        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
      })

      router.push('/master/institutions')
    } catch (error) {
      console.error('Error creating institution:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create institution. Please try again.'
      toast({
        title: "❌ Save Failed",
        description: errorMessage,
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/master/institutions')
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />
        <PageTransition>
          <div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
            <div className="flex items-center gap-2">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/dashboard">Dashboard</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/master/institutions">Institutions</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Add Institution</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="flex-shrink-0 px-8 py-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
                      <Building2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900 font-grotesk tracking-tight">
                        Add Institution
                      </h1>
                      <p className="text-sm text-slate-600 mt-0.5">
                        Create a new institution record
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to List
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-auto px-8 py-8 bg-slate-50/50">
                <div className="max-w-10xl mx-auto space-y-5">
                  {/* Basic Information Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-emerald-700" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 font-grotesk">Basic Information</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white p-6 rounded-xl border border-slate-200">
                      <div className="space-y-2">
                        <Label htmlFor="institution_code" className="text-sm font-medium text-slate-700">
                          Institution Code <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="institution_code"
                          value={formData.institution_code}
                          onChange={(e) => setFormData({ ...formData, institution_code: e.target.value })}
                          className={`h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${errors.institution_code ? 'border-red-500' : ''}`}
                          placeholder="e.g., JKKN001"
                        />
                        {errors.institution_code && <p className="text-xs text-red-600">{errors.institution_code}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                          Institution Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={`h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${errors.name ? 'border-red-500' : ''}`}
                          placeholder="e.g., JKKN University"
                        />
                        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className={`h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${errors.email ? 'border-red-500' : ''}`}
                          placeholder="info@institution.edu"
                        />
                        {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-sm font-medium text-slate-700">Phone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="+91 9876543210"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="website" className="text-sm font-medium text-slate-700">Website</Label>
                        <Input
                          id="website"
                          value={formData.website}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="https://institution.edu"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="logo_url" className="text-sm font-medium text-slate-700">Logo URL</Label>
                        <Input
                          id="logo_url"
                          value={formData.logo_url}
                          onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="https://example.com/logo.png"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address Information Section */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-700" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 font-grotesk">Address Information</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-xl border border-slate-200">
                      <div className="space-y-2">
                        <Label htmlFor="address_line1" className="text-sm font-medium text-slate-700">Address Line 1</Label>
                        <Input
                          id="address_line1"
                          value={formData.address_line1}
                          onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="Street address"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address_line2" className="text-sm font-medium text-slate-700">Address Line 2</Label>
                        <Input
                          id="address_line2"
                          value={formData.address_line2}
                          onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="Area/Locality"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address_line3" className="text-sm font-medium text-slate-700">Address Line 3</Label>
                        <Input
                          id="address_line3"
                          value={formData.address_line3}
                          onChange={(e) => setFormData({ ...formData, address_line3: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="Landmark"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city" className="text-sm font-medium text-slate-700">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="City name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state" className="text-sm font-medium text-slate-700">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="State name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country" className="text-sm font-medium text-slate-700">Country</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="Country name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pin_code" className="text-sm font-medium text-slate-700">PIN Code</Label>
                        <Input
                          id="pin_code"
                          value={formData.pin_code}
                          onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="123456"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Institutional Details Section */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-purple-700" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 font-grotesk">Institutional Details</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-xl border border-slate-200">
                      <div className="space-y-2">
                        <Label htmlFor="counselling_code" className="text-sm font-medium text-slate-700">Counselling Code</Label>
                        <Input
                          id="counselling_code"
                          value={formData.counselling_code}
                          onChange={(e) => setFormData({ ...formData, counselling_code: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="e.g., JKKN001"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="accredited_by" className="text-sm font-medium text-slate-700">Accredited By</Label>
                        <Input
                          id="accredited_by"
                          value={formData.accredited_by}
                          onChange={(e) => setFormData({ ...formData, accredited_by: e.target.value })}
                          className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                          placeholder="e.g., NAAC, AICTE"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="institution_type" className="text-sm font-medium text-slate-700">Institution Type</Label>
                        <Select value={formData.institution_type} onValueChange={(value) => setFormData({ ...formData, institution_type: value })}>
                          <SelectTrigger className="h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="university">University</SelectItem>
                            <SelectItem value="college">College</SelectItem>
                            <SelectItem value="school">School</SelectItem>
                            <SelectItem value="institute">Institute</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="timetable_type" className="text-sm font-medium text-slate-700">Timetable Type</Label>
                        <Select value={formData.timetable_type} onValueChange={(value) => setFormData({ ...formData, timetable_type: value })}>
                          <SelectTrigger className="h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20">
                            <SelectValue placeholder="Select timetable type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="week_order">Week Order</SelectItem>
                            <SelectItem value="day_order">Day Order</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Department Information Section */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-cyan-700" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 font-grotesk">Department Information</h2>
                    </div>

                    <Tabs defaultValue="transportation" className="w-full">
                      <TabsList className="grid w-full grid-cols-6 bg-slate-100 p-1 h-auto rounded-xl">
                        <TabsTrigger value="transportation" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          Transportation
                        </TabsTrigger>
                        <TabsTrigger value="administration" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <UserCog className="h-3.5 w-3.5" />
                          Administration
                        </TabsTrigger>
                        <TabsTrigger value="accounts" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          Accounts
                        </TabsTrigger>
                        <TabsTrigger value="admission" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5" />
                          Admission
                        </TabsTrigger>
                        <TabsTrigger value="placement" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <Briefcase className="h-3.5 w-3.5" />
                          Placement
                        </TabsTrigger>
                        <TabsTrigger value="antiragging" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 rounded-lg text-xs sm:text-sm py-2.5 gap-1.5">
                          <Shield className="h-3.5 w-3.5" />
                          Anti-Ragging
                        </TabsTrigger>
                      </TabsList>

                      {/* Transportation Department */}
                      <TabsContent value="transportation" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.transportation_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              transportation_dept: { ...formData.transportation_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.transportation_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              transportation_dept: { ...formData.transportation_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Head of Transportation"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.transportation_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              transportation_dept: { ...formData.transportation_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="transport@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.transportation_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              transportation_dept: { ...formData.transportation_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543210"
                          />
                        </div>
                        </div>
                      </TabsContent>

                      {/* Administration Department */}
                      <TabsContent value="administration" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.administration_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              administration_dept: { ...formData.administration_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.administration_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              administration_dept: { ...formData.administration_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Administrative Head"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.administration_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              administration_dept: { ...formData.administration_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="admin@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.administration_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              administration_dept: { ...formData.administration_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543211"
                          />
                        </div>
                        </div>
                      </TabsContent>

                      {/* Accounts Department */}
                      <TabsContent value="accounts" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.accounts_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              accounts_dept: { ...formData.accounts_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.accounts_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              accounts_dept: { ...formData.accounts_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Finance Head"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.accounts_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              accounts_dept: { ...formData.accounts_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="accounts@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.accounts_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              accounts_dept: { ...formData.accounts_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543212"
                          />
                        </div>
                        </div>
                      </TabsContent>

                      {/* Admission Department */}
                      <TabsContent value="admission" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.admission_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              admission_dept: { ...formData.admission_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.admission_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              admission_dept: { ...formData.admission_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Admission Head"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.admission_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              admission_dept: { ...formData.admission_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="admission@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.admission_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              admission_dept: { ...formData.admission_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543213"
                          />
                        </div>
                        </div>
                      </TabsContent>

                      {/* Placement Department */}
                      <TabsContent value="placement" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.placement_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              placement_dept: { ...formData.placement_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.placement_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              placement_dept: { ...formData.placement_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Placement Head"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.placement_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              placement_dept: { ...formData.placement_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="placement@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.placement_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              placement_dept: { ...formData.placement_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543214"
                          />
                        </div>
                        </div>
                      </TabsContent>

                      {/* Anti-Ragging Department */}
                      <TabsContent value="antiragging" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Name</Label>
                          <Input
                            value={formData.anti_ragging_dept?.name || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              anti_ragging_dept: { ...formData.anti_ragging_dept, name: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="Department Head Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Designation</Label>
                          <Input
                            value={formData.anti_ragging_dept?.designation || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              anti_ragging_dept: { ...formData.anti_ragging_dept, designation: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="e.g., Anti-Ragging Officer"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            value={formData.anti_ragging_dept?.email || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              anti_ragging_dept: { ...formData.anti_ragging_dept, email: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="antiragging@institution.edu"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                          <Input
                            value={formData.anti_ragging_dept?.mobile || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              anti_ragging_dept: { ...formData.anti_ragging_dept, mobile: e.target.value }
                            })}
                            className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                            placeholder="+91 9876543215"
                          />
                        </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* Status Section */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-indigo-700" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 font-grotesk">Status</h2>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-4">
                        <Label className="text-sm font-medium text-slate-700">Institution Status</Label>
                        <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                        <span className={`text-sm font-semibold ${formData.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-8 border-t border-slate-200 mt-2">
                    <Button
                      variant="outline"
                      size="default"
                      className="h-11 px-8 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200"
                      onClick={handleCancel}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="default"
                      className="h-11 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all duration-200"
                      onClick={handleSave}
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create Institution'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageTransition>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
