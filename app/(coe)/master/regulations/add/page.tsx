"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { Save, X, ArrowLeft, Info, Award, Calculator, Percent } from "lucide-react"

export default function AddRegulationPage() {
  const router = useRouter()
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
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
    if (opts?.min !== undefined && num < opts.min) return `Must be ≥ ${opts.min}`
    if (opts?.max !== undefined && num > opts.max) return `Must be ≤ ${opts.max}`
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate all fields before submit
    const fieldsToValidate: (keyof typeof formData)[] = [
      "regulation_year",
      "regulation_code",
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
      newErrors[key] = validateField(key, (formData as any)[key])
    }

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

      const response = await fetch('/api/master/regulations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        router.push('/regulations')
      } else {
        const errorData = await response.json()
        setError(errorData.message || "Failed to create regulation")
      }
    } catch (error) {
      console.error('Error creating regulation:', error)
      setError("An error occurred while creating the regulation")
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
                  <BreadcrumbPage className="text-xs">Add Regulation</BreadcrumbPage>
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
                    <h1 className="text-xl font-bold tracking-tight">Add New Regulation</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                    Create a new examination regulation
                    </p>
                  </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      className="flex items-center gap-1 h-8 text-xs"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back to List
                    </Button>
                  </div>
                  </div>

                <Card>
                <CardContent className="p-4">
                  {error && (
                    <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-xs">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Information */}
                    <div className="space-y-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4 border border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                          <Info className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Basic Information</h3>
                          <p className="text-xs text-muted-foreground">Define year, code and status of the regulation</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="regulation_year" className="text-xs">Regulation Year *</Label>
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
                            className={`h-8 text-sm appearance-none ${errors.regulation_year ? 'border-destructive' : ''}`}
                          />
                          {errors.regulation_year && (
                            <p className="text-[10px] text-destructive mt-1">{errors.regulation_year}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="regulation_code" className="text-xs">Regulation Code *</Label>
                          <Input
                            id="regulation_code"
                            value={formData.regulation_code}
                            onChange={(e) => handleFieldChange("regulation_code", e.target.value)}
                            placeholder="e.g., R2024"
                            required
                            aria-invalid={!!errors.regulation_code}
                            className={`h-8 text-sm ${errors.regulation_code ? 'border-destructive' : ''}`}
                          />
                          {errors.regulation_code && (
                            <p className="text-[10px] text-destructive mt-1">{errors.regulation_code}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="status" className="text-xs">Status</Label>
                          <Select
                            value={formData.status ? "active" : "inactive"}
                            onValueChange={(value) => setFormData({ ...formData, status: value === "active" })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active"><span className="text-xs">Active</span></SelectItem>
                              <SelectItem value="inactive"><span className="text-xs">Inactive</span></SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Minimum Values */}
                    <div className="space-y-3 bg-gradient-to-r from-red-50/50 to-pink-50/50 dark:from-red-950/20 dark:to-pink-950/20 rounded-xl p-4 border border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-red-500/10 flex items-center justify-center">
                          <Award className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Minimum Values</h3>
                          <p className="text-xs text-muted-foreground">Set minimum required marks and attendance</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <Label htmlFor="minimum_internal" className="text-xs">Minimum Internal</Label>
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
                            className={`h-8 text-sm appearance-none ${errors.minimum_internal ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_internal && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_internal}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="minimum_external" className="text-xs">Minimum External</Label>
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
                            className={`h-8 text-sm appearance-none ${errors.minimum_external ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_external && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_external}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="minimum_attendance" className="text-xs">Minimum Attendance (%)</Label>
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
                            className={`h-8 text-sm appearance-none ${errors.minimum_attendance ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_attendance && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_attendance}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="minimum_total" className="text-xs">Minimum Total</Label>
                          <Input
                            id="minimum_total"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.minimum_total}
                            onChange={(e) => handleFieldChange("minimum_total", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.minimum_total}
                            className={`h-8 text-sm appearance-none ${errors.minimum_total ? 'border-destructive' : ''}`}
                          />
                          {errors.minimum_total && (
                            <p className="text-[10px] text-destructive mt-1">{errors.minimum_total}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Maximum Values */}
                    <div className="space-y-3 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl p-4 border border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-green-500/10 flex items-center justify-center">
                          <Calculator className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Maximum Values</h3>
                          <p className="text-xs text-muted-foreground">Set maximum possible marks per component</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <Label htmlFor="maximum_internal" className="text-xs">Maximum Internal</Label>
                          <Input
                            id="maximum_internal"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_internal}
                            onChange={(e) => handleFieldChange("maximum_internal", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.maximum_internal}
                            className={`h-8 text-sm appearance-none ${errors.maximum_internal ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_internal && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_internal}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="maximum_external" className="text-xs">Maximum External</Label>
                          <Input
                            id="maximum_external"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_external}
                            onChange={(e) => handleFieldChange("maximum_external", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.maximum_external}
                            className={`h-8 text-sm appearance-none ${errors.maximum_external ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_external && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_external}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="maximum_total" className="text-xs">Maximum Total</Label>
                          <Input
                            id="maximum_total"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_total}
                            onChange={(e) => handleFieldChange("maximum_total", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.maximum_total}
                            className={`h-8 text-sm appearance-none ${errors.maximum_total ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_total && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_total}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="maximum_qp_marks" className="text-xs">Maximum QP Marks</Label>
                          <Input
                            id="maximum_qp_marks"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.maximum_qp_marks}
                            onChange={(e) => handleFieldChange("maximum_qp_marks", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.maximum_qp_marks}
                            className={`h-8 text-sm appearance-none ${errors.maximum_qp_marks ? 'border-destructive' : ''}`}
                          />
                          {errors.maximum_qp_marks && (
                            <p className="text-[10px] text-destructive mt-1">{errors.maximum_qp_marks}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Condonation Range */}
                    <div className="space-y-3 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl p-4 border border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                          <Percent className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Condonation Range</h3>
                          <p className="text-xs text-muted-foreground">Specify attendance range eligible for condonation</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="condonation_range_start" className="text-xs">Range Start</Label>
                          <Input
                            id="condonation_range_start"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.condonation_range_start}
                            onChange={(e) => handleFieldChange("condonation_range_start", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.condonation_range_start}
                            className={`h-8 text-sm appearance-none ${errors.condonation_range_start ? 'border-destructive' : ''}`}
                          />
                          {errors.condonation_range_start && (
                            <p className="text-[10px] text-destructive mt-1">{errors.condonation_range_start}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="condonation_range_end" className="text-xs">Range End</Label>
                          <Input
                            id="condonation_range_end"
                            type="number"
                            step={1}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formData.condonation_range_end}
                            onChange={(e) => handleFieldChange("condonation_range_end", e.target.value)}
                            placeholder="0"
                            aria-invalid={!!errors.condonation_range_end}
                            className={`h-8 text-sm appearance-none ${errors.condonation_range_end ? 'border-destructive' : ''}`}
                          />
                          {errors.condonation_range_end && (
                            <p className="text-[10px] text-destructive mt-1">{errors.condonation_range_end}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancel}
                        disabled={loading}
                        className="h-8 text-xs"
                      >
                        <X className="w-3 h-3 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        size="sm"
                        className="h-8 text-xs"
                      >
                        {loading ? (
                          <>
                            <div className="w-3 h-3 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 mr-2" />
                            Create Regulation
                          </>
                        )}
                      </Button>
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