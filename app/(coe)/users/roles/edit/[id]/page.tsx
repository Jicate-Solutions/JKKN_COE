"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Save } from "lucide-react"

interface Role { id: string; name?: string; role_name?: string; role_description?: string; description?: string; is_active: boolean }

export default function EditRolePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", description: "", is_active: true })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/users/roles')
        if (res.ok) {
          const all: Role[] = await res.json()
          const role = all.find(r => r.id === id)
          if (role) {
            setForm({
              name: role.role_name || role.name || "",
              description: role.role_description || role.description || "",
              is_active: !!role.is_active
            })
          } else {
            setError('Role not found')
          }
        }
      } catch (e) {
        setError('Failed to load role')
      }
    }
    load()
  }, [id])

  const setField = (k: keyof typeof form, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v as any }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/roles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_name: form.name,
          name: form.name,
          role_description: form.description,
          description: form.description,
          is_active: form.is_active
        })
      })
      if (res.ok) router.push('/users/roles')
      else setError('Failed to update role')
    } catch (err) {
      setError('Failed to update role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />
        <div className="flex-1 p-4">
          <div className="flex items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/users/roles">Roles</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs">Edit Role</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="max-w-2xl mt-4">
            <Card>
              <CardContent className="p-4">
                {error && (
                  <div className="mb-3 p-2 text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-xs">Name *</Label>
                    <Input id="name" value={form.name} onChange={e => setField('name', e.target.value)} required className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label htmlFor="description" className="text-xs">Description</Label>
                    <Input id="description" value={form.description} onChange={e => setField('description', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={form.is_active ? 'active' : 'inactive'} onValueChange={v => setField('is_active', v === 'active')}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active"><span className="text-xs">Active</span></SelectItem>
                        <SelectItem value="inactive"><span className="text-xs">Inactive</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => router.push('/users/roles')}>
                      <ArrowLeft className="h-3 w-3 mr-1" /> Back
                    </Button>
                    <Button type="submit" disabled={loading} size="sm" className="h-8 text-xs">
                      {loading ? 'Saving…' : (<><Save className="h-3 w-3 mr-1"/> Update Role</>)}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}


