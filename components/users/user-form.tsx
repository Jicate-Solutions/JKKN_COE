"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { CheckCircle, AlertCircle, XCircle, Info } from "lucide-react"

type Institution = { id: string; name: string }

type Mode = "add" | "edit"

export type UserPayload = {
  id?: string
  name: string
  email: string
  password?: string
  role: "ADMIN" | "STAFF" | "STUDENT" | "USER"
  institutionId?: string | null
  isActive: boolean
  image?: string | null
  emailVerified?: string | null
}

type ValidationErrors = {
  name?: string
  email?: string
  password?: string
  role?: string
  institutionId?: string
}

export default function UserForm({
  mode,
  initialData,
  institutions,
}: {
  mode: Mode
  initialData?: Partial<UserPayload>
  institutions: Institution[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<UserPayload>({
    name: initialData?.name || "",
    email: initialData?.email || "",
    password: "",
    role: (initialData?.role as UserPayload["role"]) || "USER",
    institutionId: (initialData?.institutionId as string | undefined) || undefined,
    isActive: initialData?.isActive ?? true,
    image: (initialData?.image as string | undefined) || undefined,
    emailVerified: initialData?.emailVerified || undefined,
  })
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const headerTitle = mode === "add" ? "Add User" : "Edit User"

  const validateField = (key: keyof UserPayload, value: unknown): string | undefined => {
    switch (key) {
      case "name":
        if (!value || (value as string).trim().length === 0) {
          return "Name is required"
        }
        if ((value as string).trim().length < 2) {
          return "Name must be at least 2 characters"
        }
        break
      case "email":
        if (!value || (value as string).trim().length === 0) {
          return "Email is required"
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value as string)) {
          return "Please enter a valid email address"
        }
        break
      case "password":
        if (mode === "add" && (!value || (value as string).length === 0)) {
          return "Password is required"
        }
        if (value && (value as string).length < 6) {
          return "Password must be at least 6 characters"
        }
        break
      case "role":
        if (!value) {
          return "Role is required"
        }
        break
      case "institutionId":
        if (!value) {
          return "Institution is required"
        }
        break
    }
    return undefined
  }

  const handleChange = (key: keyof UserPayload, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value as never }))
    
    // Validate field on change
    const error = validateField(key, value)
    setErrors((prev) => ({ ...prev, [key]: error }))
  }

  const handleBlur = (key: keyof UserPayload) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
    const error = validateField(key, form[key])
    setErrors((prev) => ({ ...prev, [key]: error }))
  }

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}
    let isValid = true

    Object.keys(form).forEach((key) => {
      const error = validateField(key as keyof UserPayload, form[key as keyof UserPayload])
      if (error) {
        newErrors[key as keyof ValidationErrors] = error
        isValid = false
      }
    })

    setErrors(newErrors)
    setTouched(Object.keys(form).reduce((acc, key) => ({ ...acc, [key]: true }), {}))
    return isValid
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error("Please fix the validation errors before submitting")
      return
    }

    setSubmitting(true)
    try {
      const url = mode === "add" ? "/api/users" : `/api/users/${initialData?.id}`
      const method = mode === "add" ? "POST" : "PUT"
      const payload: Record<string, unknown> = {
        full_name: form.name,
        email: form.email,
        role: form.role,
        institution_id: form.institutionId,
        is_active: form.isActive,
        avatar_url: form.image,
      }
      if (form.password) {
        payload.password = form.password
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err && (err.error as string)) || "Request failed")
      }
      toast.success(mode === "add" ? "User created successfully" : "User updated successfully")
      router.push("/users")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save user")
    } finally {
      setSubmitting(false)
    }
  }

  const getFieldStatus = (key: keyof ValidationErrors) => {
    if (!touched[key]) return "default"
    if (errors[key]) return "error"
    return "success"
  }

  const getFieldIcon = (key: keyof ValidationErrors) => {
    const status = getFieldStatus(key)
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-success" />
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />
      default:
        return null
    }
  }

  return (
    <Card className="rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="text-heading flex items-center gap-2">
          {headerTitle}
          {submitting && <LoadingSpinner size="sm" />}
        </CardTitle>
        <p className="text-subheading">Fill in the user details below. All required fields are marked with an asterisk (*).</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input 
                id="name" 
                value={form.name} 
                onChange={(e) => handleChange("name", e.target.value)}
                onBlur={() => handleBlur("name")}
                className={`pr-10 ${errors.name && touched.name ? 'border-destructive focus-visible:ring-destructive' : getFieldStatus("name") === "success" ? 'border-success focus-visible:ring-success' : ''}`}
                placeholder="Enter full name"
              />
              {touched.name && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {getFieldIcon("name")}
                </div>
              )}
            </div>
            {errors.name && touched.name && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input 
                id="email" 
                type="email" 
                value={form.email} 
                onChange={(e) => handleChange("email", e.target.value)}
                onBlur={() => handleBlur("email")}
                className={`pr-10 ${errors.email && touched.email ? 'border-destructive focus-visible:ring-destructive' : getFieldStatus("email") === "success" ? 'border-success focus-visible:ring-success' : ''}`}
                placeholder="Enter email address"
              />
              {touched.email && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {getFieldIcon("email")}
                </div>
              )}
            </div>
            {errors.email && touched.email && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.email}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password {mode === "add" && <span className="text-destructive">*</span>}
              {mode === "edit" && <span className="text-xs text-muted-foreground ml-1">(leave empty to keep current)</span>}
            </Label>
            <div className="relative">
              <Input 
                id="password" 
                type="password" 
                value={form.password} 
                onChange={(e) => handleChange("password", e.target.value)}
                onBlur={() => handleBlur("password")}
                className={`pr-10 ${errors.password && touched.password ? 'border-destructive focus-visible:ring-destructive' : getFieldStatus("password") === "success" ? 'border-success focus-visible:ring-success' : ''}`}
                placeholder={mode === "add" ? "Enter password" : "Enter new password (optional)"}
              />
              {touched.password && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {getFieldIcon("password")}
                </div>
              )}
            </div>
            {errors.password && touched.password && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.password}
              </p>
            )}
          </div>

          {/* Role Field */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select value={form.role} onValueChange={(v) => handleChange("role", v as UserPayload["role"])}>
              <SelectTrigger className={`${errors.role && touched.role ? 'border-destructive focus:ring-destructive' : getFieldStatus("role") === "success" ? 'border-success focus:ring-success' : ''}`}>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="STAFF">STAFF</SelectItem>
                <SelectItem value="STUDENT">STUDENT</SelectItem>
                <SelectItem value="USER">USER</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && touched.role && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.role}
              </p>
            )}
          </div>

          {/* Institution Field */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Institution <span className="text-destructive">*</span>
            </Label>
            <Select value={form.institutionId || ""} onValueChange={(v) => handleChange("institutionId", v || undefined)}>
              <SelectTrigger className={`${errors.institutionId && touched.institutionId ? 'border-destructive focus:ring-destructive' : getFieldStatus("institutionId") === "success" ? 'border-success focus:ring-success' : ''}`}>
                <SelectValue placeholder="Select an institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.institutionId && touched.institutionId && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.institutionId}
              </p>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-2 p-4 rounded-lg bg-muted/50">
            <Checkbox 
              id="isActive" 
              checked={form.isActive} 
              onCheckedChange={(v) => handleChange("isActive", Boolean(v))} 
            />
            <Label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
              Active User
            </Label>
            <StatusBadge variant={form.isActive ? "success" : "secondary"} size="sm">
              {form.isActive ? "Active" : "Inactive"}
            </StatusBadge>
          </div>

          {/* Image Field */}
          <div className="space-y-2">
            <Label htmlFor="image" className="text-sm font-medium">Profile Image URL</Label>
            <Input 
              id="image" 
              type="url" 
              placeholder="https://example.com/image.jpg" 
              value={form.image || ""} 
              onChange={(e) => handleChange("image", e.target.value || undefined)}
              className="focus:ring-info"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Optional. Enter a valid image URL for the user&apos;s profile picture.
            </p>
          </div>

          {/* Email Verified Field */}
          <div className="space-y-2">
            <Label htmlFor="emailVerified" className="text-sm font-medium">Email Verified Date</Label>
            <Input 
              id="emailVerified" 
              type="datetime-local" 
              value={form.emailVerified || ""} 
              onChange={(e) => handleChange("emailVerified", e.target.value || undefined)}
              className="focus:ring-info"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Optional. Set when the user&apos;s email was verified.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => router.push("/users")}
              className="hover-lift"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={submitting}
              className="hover-lift min-w-[120px]"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                "Save User"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}


