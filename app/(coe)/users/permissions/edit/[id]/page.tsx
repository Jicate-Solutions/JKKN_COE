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

interface Permission { id: string; name: string; description?: string; resource: string; action: string; is_active: boolean }

export default function EditPermissionPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", description: "", resource: "", action: "", is_active: true })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/users/permissions')
        if (res.ok) {
          const all: Permission[] = await res.json()
          const item = all.find(p => p.id === id)
          if (item) {
            setForm({ name: item.name, description: item.description || "", resource: item.resource, action: item.action, is_active: item.is_active })
          } else {
            setError('Permission not found')
          }
        }
      } catch (e) {
        setError('Failed to load permission')
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
      const res = await fetch(`/api/users/permissions/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      })
      if (res.ok) {
        router.push('/permissions')
      } else {
        const errorData = await res.json()
        setError(errorData.error || 'Failed to update permission')
      }
    } catch (err) { 
      setError('Failed to update permission') 
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
                    <Link href="/permissions">Permissions</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs">Edit Permission</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="max-w-2xl mt-4">
            <Card>
              <CardContent className="p-4">
                {error && (<div className="mb-3 p-2 text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">{error}</div>)}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-xs">Name *</Label>
                    <Input id="name" value={form.name} onChange={e => setField('name', e.target.value)} required className="h-8 text-sm" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="resource" className="text-xs">Resource *</Label>
                      <Input id="resource" value={form.resource} onChange={e => setField('resource', e.target.value)} required className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label htmlFor="action" className="text-xs">Action *</Label>
                      <Input id="action" value={form.action} onChange={e => setField('action', e.target.value)} required className="h-8 text-sm" />
                    </div>
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
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => router.push('/permissions')}>
                      <ArrowLeft className="h-3 w-3 mr-1" /> Back
                    </Button>
                    <Button type="submit" disabled={loading} size="sm" className="h-8 text-xs">
                      {loading ? 'Saving…' : (<><Save className="h-3 w-3 mr-1"/> Update Permission</>)}
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


