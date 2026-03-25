"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition } from "@/components/common/page-transition"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { Building2, ArrowLeft, Edit, Loader2, Truck, UserCog, DollarSign, GraduationCap, Briefcase, Shield } from "lucide-react"

import type { Institution } from "@/types/institutions"

export default function ViewInstitutionPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [institution, setInstitution] = useState<Institution | null>(null)

  useEffect(() => {
    const fetchInstitution = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/master/institutions/${params.id}`)

        if (!response.ok) {
          setNotFound(true)
          return
        }

        const data: Institution = await response.json()
        setInstitution(data)
      } catch (error) {
        console.error('Error fetching institution:', error)
        toast({
          title: "❌ Error",
          description: "Failed to load institution data.",
          variant: "destructive",
          className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
        })
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchInstitution()
    }
  }, [params.id, toast])

  const handleEdit = () => {
    router.push(`/master/institutions/edit/${params.id}`)
  }

  const handleBack = () => {
    router.push('/master/institutions')
  }

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen">
          <AppHeader />
          <PageTransition>
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading institution data...</p>
              </div>
            </div>
          </PageTransition>
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (notFound || !institution) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen">
          <AppHeader />
          <PageTransition>
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Institution Not Found</h2>
                <p className="text-muted-foreground mb-4">The institution you're looking for doesn't exist.</p>
                <Button onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Institutions
                </Button>
              </div>
            </div>
          </PageTransition>
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    )
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
                    <BreadcrumbPage>View Institution</BreadcrumbPage>
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
                        {institution.name}
                      </h1>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {institution.institution_code}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleBack} className="rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to List
                    </Button>
                    <Button size="sm" onClick={handleEdit} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all duration-200">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
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
                        <Label className="text-sm font-medium text-slate-700">Institution Code</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.institution_code || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Institution Name</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.name || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Email</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.email || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Phone</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.phone || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Website</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.website || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Logo URL</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.logo_url || ''} />
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
                        <Label className="text-sm font-medium text-slate-700">Address Line 1</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.address_line1 || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Address Line 2</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.address_line2 || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Address Line 3</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.address_line3 || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">City</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.city || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">State</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.state || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Country</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.country || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">PIN Code</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.pin_code || ''} />
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
                        <Label className="text-sm font-medium text-slate-700">Counselling Code</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.counselling_code || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Accredited By</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.accredited_by || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Institution Type</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.institution_type || ''} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Timetable Type</Label>
                        <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.timetable_type || ''} />
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
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.transportation_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.transportation_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.transportation_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.transportation_dept?.mobile || ''} />
                          </div>
                        </div>
                      </TabsContent>

                      {/* Administration Department */}
                      <TabsContent value="administration" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Name</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.administration_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.administration_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.administration_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.administration_dept?.mobile || ''} />
                          </div>
                        </div>
                      </TabsContent>

                      {/* Accounts Department */}
                      <TabsContent value="accounts" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Name</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.accounts_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.accounts_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.accounts_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.accounts_dept?.mobile || ''} />
                          </div>
                        </div>
                      </TabsContent>

                      {/* Admission Department */}
                      <TabsContent value="admission" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Name</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.admission_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.admission_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.admission_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.admission_dept?.mobile || ''} />
                          </div>
                        </div>
                      </TabsContent>

                      {/* Placement Department */}
                      <TabsContent value="placement" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Name</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.placement_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.placement_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.placement_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.placement_dept?.mobile || ''} />
                          </div>
                        </div>
                      </TabsContent>

                      {/* Anti-Ragging Department */}
                      <TabsContent value="antiragging" className="mt-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-white rounded-xl border border-slate-200">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Name</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.anti_ragging_dept?.name || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Designation</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.anti_ragging_dept?.designation || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Email</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.anti_ragging_dept?.email || ''} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Mobile</Label>
                            <Input disabled className="h-9 rounded-lg bg-slate-100" value={institution.anti_ragging_dept?.mobile || ''} />
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
                        <Badge variant={institution.is_active ? "default" : "secondary"} className={`text-sm font-semibold ${institution.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-red-100 text-red-700 hover:bg-red-100'}`}>
                          {institution.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
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
