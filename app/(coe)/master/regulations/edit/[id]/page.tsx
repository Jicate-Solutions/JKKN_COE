"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/common/mode-toggle"
import { AppFooter } from "@/components/layout/app-footer"
import { AppHeader } from "@/components/layout/app-header"

import { Save, X, ArrowLeft, Calendar, Hash, ToggleLeft, Percent, Award, Calculator, FileCheck, Info, CheckCircle2, AlertCircle } from "lucide-react"

interface Regulation {
  id: number
  regulation_year: number
  regulation_code: string
  status: boolean
  minimum_internal: number
  minimum_external: number
  minimum_attendance: number
  minimum_total: number
  maximum_internal: number
  maximum_external: number
  maximum_total: number
  maximum_qp_marks: number
  condonation_range_start: number
  condonation_range_end: number
  created_at: string
  updated_at: string
}

export default function EditRegulationPage() {
  const router = useRouter()
  const params = useParams()
  const regulationId = params.id as string

  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [regulation, setRegulation] = useState<Regulation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    regulation_year: "",
    regulation_code: "",
    status: true,
    minimum_internal: "",
    minimum_external: "",
    minimum_attendance: "",
    minimum_total: "",
    maximum_internal: "",
    maximum_external: "",
    maximum_total: "",
    maximum_qp_marks: "",
    condonation_range_start: "",
    condonation_range_end: ""
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateInteger = (value: string, opts?: { min?: number; max?: number }) => {
    if (value === "" || value === null || value === undefined) return "This field is required"
    if (!/^\d+$/.test(value)) return "Enter a valid whole number"
    const num = parseInt(value)
    if (opts?.min !== undefined && num < opts.min) return `Must be E ${opts.min}`
    if (opts?.max !== undefined && num > opts.max) return `Must be C= ${opts.max}`
    return ""
  }

  const validateField = (name: string, value: string) => {
    switch (name) {
      case "regulation_year":
        return validateInteger(value, { min: 1900, max: 2100 })
      case "regulation_code":
        return value.trim() ? "" : "Regulation code is required"
      case "minimum_attendance":
      case "condonation_range_start":
      case "condonation_range_end":
        return validateInteger(value, { min: 0, max: 100 })
      case "minimum_internal":
      case "minimum_external":
      case "minimum_total":
      case "maximum_internal":
      case "maximum_external":
      case "maximum_total":
      case "maximum_qp_marks":
        return validateInteger(value, { min: 0 })
      default:
        return ""
    }
  }

  const handleFieldChange = (name: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    const msg = validateField(name as string, value)
    setErrors(prev => ({ ...prev, [name]: msg }))
  }

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch regulation data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const regulationResponse = await fetch(`/api/master/regulations/${regulationId}`)
        if (regulationResponse.ok) {
          const regulationData: Regulation = await regulationResponse.json()
          setRegulation(regulationData)
          setFormData({
            regulation_year: regulationData.regulation_year.toString(),
            regulation_code: regulationData.regulation_code,
            status: regulationData.status,
            minimum_internal: regulationData.minimum_internal.toString(),
            minimum_external: regulationData.minimum_external.toString(),
            minimum_attendance: regulationData.minimum_attendance.toString(),
            minimum_total: regulationData.minimum_total.toString(),
            maximum_internal: regulationData.maximum_internal.toString(),
            maximum_external: regulationData.maximum_external.toString(),
            maximum_total: regulationData.maximum_total.toString(),
            maximum_qp_marks: regulationData.maximum_qp_marks.toString(),
            condonation_range_start: regulationData.condonation_range_start.toString(),
            condonation_range_end: regulationData.condonation_range_end.toString()
          })
        } else {
          setError("Failed to fetch regulation data")
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        setError("An error occurred while fetching data")
      }
    }

    fetchData()
  }, [regulationId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.regulation_year || !formData.regulation_code) {
      setError("Please fill all required fields")
      setLoading(false)
      return
    }

    // Validate all fields before submit
    const fieldsToValidate: (keyof typeof formData)[] = [
      "regulation_year",
      "regulation_code",
      "status",
      "minimum_internal",
      "minimum_external",
      "minimum_attendance",
      "minimum_total",
      "maximum_internal",
      "maximum_external",
      "maximum_total",
      "maximum_qp_marks",
      "condonation_range_start",
      "condonation_range_end"
    ]

    const newErrors: Record<string, string> = {}
    for (const key of fieldsToValidate) {
      if (key === "status") continue
      newErrors[key] = validateField(key, (formData as any)[key])
    }
    // Cross-field validation: condonation start <= end
    const start = parseInt(formData.condonation_range_start || "0")
    const end = parseInt(formData.condonation_range_end || "0")
    if (!newErrors["condonation_range_start"] && !newErrors["condonation_range_end"] && start > end) {
      newErrors["condonation_range_end"] = "End must be greater than or equal to start"
    }

    setErrors(newErrors)
    const hasErrors = Object.values(newErrors).some(Boolean)
    if (hasErrors) {
      setLoading(false)
      return
    }

    try {
      const payload = {
        regulation_year: parseInt(formData.regulation_year),
        regulation_code: formData.regulation_code,
        status: formData.status,
        minimum_internal: parseInt(formData.minimum_internal) || 0,
        minimum_external: parseInt(formData.minimum_external) || 0,
        minimum_attendance: parseInt(formData.minimum_attendance) || 0,
        minimum_total: parseInt(formData.minimum_total) || 0,
        maximum_internal: parseInt(formData.maximum_internal) || 0,
        maximum_external: parseInt(formData.maximum_external) || 0,
        maximum_total: parseInt(formData.maximum_total) || 0,
        maximum_qp_marks: parseInt(formData.maximum_qp_marks) || 0,
        condonation_range_start: parseInt(formData.condonation_range_start) || 0,
        condonation_range_end: parseInt(formData.condonation_range_end) || 0
      }

      const response = await fetch(`/api/master/regulations/${regulationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        router.push("/regulations")
      } else {
        const errorData = await response.json()
        setError(errorData.message || "Failed to update regulation")
      }
    } catch (error) {
      console.error("Error updating regulation:", error)
      setError("An error occurred while updating the regulation")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    router.push("/regulations")
  }

  const formatCurrentDateTime = () => {
    if (!currentTime) return ""
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    return currentTime.toLocaleDateString('en-US', options)
  }

  if (!regulation) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading regulation data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />

          {/* Breadcrumb */}
          <div className="flex items-center px-4 py-2 bg-muted/50">
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
                    <Link href="/regulations">Regulations</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs">Edit Regulation</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Main Content */}
          <main className="flex-1 p-4 bg-gradient-to-br from-background via-background to-muted/20 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              {/* Page Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">Edit Regulation</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                      Update regulation details and configure marking scheme parameters
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="flex items-center gap-1 hover:bg-muted h-8 text-xs"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to List
                  </Button>
                </div>
              </div>

                <Card>
                <CardContent className="p-4">
                  {error && (
                    <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20 flex items-center gap-2">
                      <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                      <p className="text-xs text-destructive">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Information Section */}
                    <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-6 w-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Info className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-sm font-semibold">Basic Information</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2.5">
                          <Label htmlFor="regulation_year" className="flex items-center gap-2 text-xs font-medium">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            Regulation Year <span className="text-destructive">*</span>
                          </Label>
                  <div className="relative">
                            <Input
                              id="regulation_year"
                              type="number"
                              step={1}
                              inputMode="numeric"
                              pattern="[0-9]*"
                      value={formData.regulation_year}
                      onChange={(e) => handleFieldChange("regulation_year", e.target.value)}
                              placeholder="e.g., 2024"
                              required
                      aria-invalid={!!errors.regulation_year}
                      className={`h-8 px-3 text-sm bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors appearance-none ${errors.regulation_year ? 'border-destructive' : ''}`}
                            />
                          </div>
                  {errors.regulation_year && (
                    <p className="text-[10px] text-destructive mt-1">{errors.regulation_year}</p>
                  )}
                        </div>

                        <div className="space-y-2.5">
                          <Label htmlFor="regulation_code" className="flex items-center gap-2 text-xs font-medium">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            Regulation Code <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="regulation_code"
                              value={formData.regulation_code}
                              onChange={(e) => handleFieldChange("regulation_code", e.target.value)}
                              placeholder="e.g., R2024"
                              required
                              aria-invalid={!!errors.regulation_code}
                              className={`h-8 px-3 text-sm bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.regulation_code ? 'border-destructive' : ''}`}
                            />
                          </div>
                          {errors.regulation_code && (
                            <p className="text-[10px] text-destructive mt-1">{errors.regulation_code}</p>
                          )}
                        </div>

                        <div className="space-y-2.5">
                          <Label htmlFor="status" className="flex items-center gap-2 text-xs font-medium">
                            <ToggleLeft className="h-3 w-3 text-muted-foreground" />
                            Status
                          </Label>
                          <Select
                            value={formData.status ? "active" : "inactive"}
                            onValueChange={(value) => setFormData({ ...formData, status: value === "active" })}
                          >
                            <SelectTrigger className="h-8 bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors text-sm">
                              <div className="flex items-center gap-2">
                                {formData.status ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs">Active</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                                    <span className="text-xs">Inactive</span>
                                  </div>
                                )}
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                  <span className="text-xs">Active</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="inactive">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                                  <span className="text-xs">Inactive</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Requirements */}
                    <div className="bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Percent className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h3 className="text-sm font-semibold">Attendance Requirements</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2.5">
                          <Label htmlFor="minimum_attendance" className="flex items-center gap-2 text-xs font-medium">
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                            Minimum Attendance
                          </Label>
                          <div className="relative">
                            <Input
                              id="minimum_attendance"
                              type="number"
                              step={1}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={formData.minimum_attendance}
                              onChange={(e) => handleFieldChange("minimum_attendance", e.target.value)}
                              placeholder="75"
                              aria-invalid={!!errors.minimum_attendance}
                              className={`h-8 pr-10 text-sm bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.minimum_attendance ? 'border-destructive' : ''}`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Required attendance percentage</p>
                          {errors.minimum_attendance && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_attendance}</p>
                          )}
                        </div>

                        <div className="space-y-2.5">
                          <Label htmlFor="condonation_range_start" className="flex items-center gap-2 text-xs font-medium">
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                            Condonation Start
                          </Label>
                          <div className="relative">
                            <Input
                              id="condonation_range_start"
                              type="number"
                              step={1}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={formData.condonation_range_start}
                              onChange={(e) => handleFieldChange("condonation_range_start", e.target.value)}
                              placeholder="65"
                              aria-invalid={!!errors.condonation_range_start}
                              className={`h-8 pr-10 text-sm bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.condonation_range_start ? 'border-destructive' : ''}`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Lower limit for condonation</p>
                          {errors.condonation_range_start && (
                            <p className="text-[10px] text-destructive mt-1">{errors.condonation_range_start}</p>
                          )}
                        </div>

                        <div className="space-y-2.5">
                          <Label htmlFor="condonation_range_end" className="flex items-center gap-2 text-xs font-medium">
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                            Condonation End
                          </Label>
                          <div className="relative">
                            <Input
                              id="condonation_range_end"
                              type="number"
                              step={1}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={formData.condonation_range_end}
                              onChange={(e) => handleFieldChange("condonation_range_end", e.target.value)}
                              placeholder="74"
                              aria-invalid={!!errors.condonation_range_end}
                              className={`h-8 pr-10 text-sm bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.condonation_range_end ? 'border-destructive' : ''}`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Upper limit for condonation</p>
                          {errors.condonation_range_end && (
                            <p className="text-[10px] text-destructive mt-1">{errors.condonation_range_end}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Minimum Marks Configuration */}
                    <div className="bg-gradient-to-r from-red-50/50 to-pink-50/50 dark:from-red-950/20 dark:to-pink-950/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <Award className="h-3 w-3 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="text-sm font-semibold">Minimum Passing Marks</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-background/60 rounded-lg p-4 border border-border/50">
                          <Label htmlFor="minimum_internal" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            Internal Marks
                          </Label>
                          <Input
                            id="minimum_internal"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.minimum_internal}
                            onChange={(e) => handleFieldChange("minimum_internal", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.minimum_internal}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.minimum_internal ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_internal && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_internal}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Minimum internal assessment marks</p>
                        </div>

                        <div className="bg-background/60 rounded-lg p-4 border border-border/50">
                          <Label htmlFor="minimum_external" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            External Marks
                          </Label>
                          <Input
                            id="minimum_external"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.minimum_external}
                            onChange={(e) => handleFieldChange("minimum_external", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.minimum_external}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.minimum_external ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_external && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_external}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Minimum external exam marks</p>
                        </div>

                        <div className="bg-background/60 rounded-lg p-4 border border-border/50">
                          <Label htmlFor="minimum_total" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-purple-500" />
                            Total Marks
                          </Label>
                          <Input
                            id="minimum_total"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.minimum_total}
                            onChange={(e) => handleFieldChange("minimum_total", e.target.value)}
                            placeholder="40"
                            aria-invalid={!!errors.minimum_total}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.minimum_total ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_total && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_total}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Minimum total marks to pass</p>
                        </div>
                      </div>
                    </div>

                    {/* Maximum Marks Configuration */}
                    <div className="bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-7 w-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                          <Calculator className="h-3 w-3 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-sm font-semibold">Maximum Marks Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-background/60 rounded-lg p-4 border border-border/50 hover:shadow-md transition-shadow">
                          <Label htmlFor="maximum_internal" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            Internal Marks
                          </Label>
                          <Input
                            id="maximum_internal"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_internal}
                            onChange={(e) => handleFieldChange("maximum_internal", e.target.value)}
                            placeholder="40"
                            aria-invalid={!!errors.maximum_internal}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.maximum_internal ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_internal && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_internal}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Max internal marks</p>
                        </div>

                        <div className="bg-background/60 rounded-lg p-4 border border-border/50 hover:shadow-md transition-shadow">
                          <Label htmlFor="maximum_external" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            External Marks
                          </Label>
                          <Input
                            id="maximum_external"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_external}
                            onChange={(e) => handleFieldChange("maximum_external", e.target.value)}
                            placeholder="60"
                            aria-invalid={!!errors.maximum_external}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.maximum_external ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_external && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_external}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Max external marks</p>
                        </div>

                        <div className="bg-background/60 rounded-lg p-4 border border-border/50 hover:shadow-md transition-shadow">
                          <Label htmlFor="maximum_total" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-purple-500" />
                            Total Marks
                          </Label>
                          <Input
                            id="maximum_total"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_total}
                            onChange={(e) => handleFieldChange("maximum_total", e.target.value)}
                            placeholder="100"
                            aria-invalid={!!errors.maximum_total}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.maximum_total ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_total && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_total}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Max total marks</p>
                        </div>

                        <div className="bg-background/60 rounded-lg p-4 border border-border/50 hover:shadow-md transition-shadow">
                          <Label htmlFor="maximum_qp_marks" className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-2 w-2 rounded-full bg-orange-500" />
                            Question Paper
                          </Label>
                          <Input
                            id="maximum_qp_marks"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_qp_marks}
                            onChange={(e) => handleFieldChange("maximum_qp_marks", e.target.value)}
                            placeholder="100"
                            aria-invalid={!!errors.maximum_qp_marks}
                            className={`h-8 text-sm font-medium bg-background/80 border-muted-foreground/20 focus:bg-background transition-colors ${errors.maximum_qp_marks ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_qp_marks && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_qp_marks}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Max QP marks</p>
                        </div>
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-between items-center mt-6 border-t pt-4 bg-gradient-to-r from-muted/30 to-muted/10 rounded-lg p-4">
                      <div></div>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancel}
                          disabled={loading}
                          className="min-w-[120px] h-8 text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors"
                        >
                          <X className="w-3 h-3 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                          size="sm"
                          className="min-w-[120px] h-8 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg hover:shadow-xl"
                        >
                          {loading ? (
                            <>
                              <div className="w-3 h-3 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Save className="w-3 h-3 mr-2" />
                              Update Regulation
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </main>

        
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}