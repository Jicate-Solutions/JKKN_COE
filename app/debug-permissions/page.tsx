'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, User, Shield, Key, RefreshCw } from 'lucide-react'
import Link from 'next/link'

interface PermissionResponse {
  roles: string[];
  permissions: string[];
  effectivePermissions: Record<string, boolean>;
  source: 'super_admin_jsonb' | 'cached_jsonb' | 'computed_rbac';
  cached: boolean;
  cacheAge?: number;
  cacheTimestamp?: string;
}

export default function DebugPermissionsPage() {
  const { user, isLoading, hasPermission, hasRole } = useAuth()
  const [permissionData, setPermissionData] = useState<PermissionResponse | null>(null)
  const [fetching, setFetching] = useState(false)

  const fetchPermissions = async () => {
    setFetching(true)
    try {
      const response = await fetch('/api/auth/permissions/current')
      if (response.ok) {
        const data = await response.json()
        setPermissionData(data)
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchPermissions()
    }
  }, [user])

  const requiredPermissions = [
    'batches.view',
    'batches.create',
    'batches.edit',
    'batches.delete',
    'users.view',
    'institutions.view',
    'programs.view',
    'sections.view'
  ]

  const commonRoles = ['admin', 'staff', 'viewer', 'user']

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Not Authenticated</CardTitle>
            <CardDescription>Please log in to view your permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Permission Debug Panel</h1>
        <p className="text-muted-foreground">View your current user permissions and role assignments</p>
      </div>

      <div className="grid gap-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium">Email:</div>
                <div className="text-muted-foreground">{user.email}</div>
              </div>
              <div>
                <div className="font-medium">User ID:</div>
                <div className="text-muted-foreground font-mono text-xs">{user.id}</div>
              </div>
              <div>
                <div className="font-medium">Full Name:</div>
                <div className="text-muted-foreground">{user.full_name || 'Not set'}</div>
              </div>
              <div>
                <div className="font-medium">Database Role:</div>
                <div className="text-muted-foreground">{user.role || 'Not set'}</div>
              </div>
              <div>
                <div className="font-medium">Super Admin:</div>
                <div className="mt-1">
                  {user.is_super_admin ?
                    <Badge variant="default" className="bg-green-600">Yes</Badge> :
                    <Badge variant="secondary">No</Badge>
                  }
                </div>
              </div>
              <div>
                <div className="font-medium">Account Active:</div>
                <div className="mt-1">
                  {user.is_active ?
                    <Badge variant="default" className="bg-green-600">Active</Badge> :
                    <Badge variant="destructive">Inactive</Badge>
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permission Source Card */}
        {permissionData && (
          <Card>
            <CardHeader>
              <CardTitle>Permission System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm font-medium mb-1">Source:</div>
                  <Badge variant={permissionData.source === 'super_admin_jsonb' ? 'default' : permissionData.cached ? 'secondary' : 'outline'}>
                    {permissionData.source === 'super_admin_jsonb' ? 'Super Admin JSONB' :
                     permissionData.source === 'cached_jsonb' ? 'Cached (JSONB)' :
                     'Computed (RBAC)'}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Cache Status:</div>
                  <Badge variant={permissionData.cached ? 'default' : 'secondary'}>
                    {permissionData.cached ? 'Using Cache' : 'Fresh Compute'}
                  </Badge>
                </div>
                {permissionData.cacheAge !== undefined && (
                  <div>
                    <div className="text-sm font-medium mb-1">Cache Age:</div>
                    <Badge variant="outline">
                      {permissionData.cacheAge}s
                    </Badge>
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium mb-1">Total Permissions:</div>
                  <Badge variant="default">
                    {permissionData.permissions.length}
                  </Badge>
                </div>
              </div>
              {user.is_super_admin && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Super Admin Mode:</strong> Your permissions are managed exclusively through the JSONB field for maximum flexibility and performance.
                  </p>
                </div>
              )}
              {!user.is_super_admin && permissionData.cached && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-900">
                    <strong>Optimized Mode:</strong> Using cached permissions from JSONB for fast access. Cache refreshes every 5 minutes.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Roles Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Assigned Roles
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchPermissions}
              disabled={fetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {permissionData?.roles && permissionData.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {permissionData.roles.map(role => (
                  <Badge key={role} variant="default" className="px-3 py-1">
                    {role}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No roles assigned. Contact your administrator to assign a role.
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Role Check:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {commonRoles.map(role => (
                  <div key={role} className="flex items-center gap-2 text-sm">
                    {hasRole(role) ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={hasRole(role) ? 'text-green-600' : 'text-muted-foreground'}>
                      {role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permissions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Permissions ({permissionData?.permissions?.length || 0})
            </CardTitle>
            <CardDescription>
              These permissions are derived from your assigned roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Required Permissions for Batch Page:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {requiredPermissions.map(perm => (
                    <div key={perm} className="flex items-center gap-2 text-sm p-2 rounded-lg border">
                      {hasPermission(perm) ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className={`font-mono text-xs ${hasPermission(perm) ? 'text-green-600' : 'text-red-600'}`}>
                        {perm}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {permissionData?.permissions && permissionData.permissions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">All Effective Permissions:</p>
                  <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
                    {permissionData.permissions.map(perm => (
                      <Badge key={perm} variant="outline" className="text-xs font-mono">
                        {perm}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting Card */}
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
          <CardHeader>
            <CardTitle className="text-orange-800 dark:text-orange-200">
              Troubleshooting Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3 text-orange-700 dark:text-orange-300">
            <div>
              <p className="font-semibold">If you're seeing "Access Denied" on the Batch page:</p>
              <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                <li>You need the <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">batches.view</code> permission</li>
                <li>This permission is granted to roles: admin, staff, or viewer</li>
                <li>Your current role is: <Badge variant="outline">{user.role || 'Not set'}</Badge></li>
                <li>Ask your administrator to update your role in the database</li>
              </ol>
            </div>

            <div className="pt-3 border-t border-orange-200 dark:border-orange-800">
              <p className="font-semibold">Quick Fix (for administrators):</p>
              <pre className="mt-2 p-3 bg-white dark:bg-gray-900 rounded-lg text-xs overflow-x-auto">
{`UPDATE public.users
SET role = 'admin', is_super_admin = true
WHERE email = '${user.email}';`}
              </pre>
              <p className="text-xs mt-2">Run this SQL in your Supabase SQL editor, then log out and back in.</p>
            </div>

            <div className="flex gap-2 pt-3">
              <Link href="/dashboard">
                <Button size="sm" variant="outline">
                  Back to Dashboard
                </Button>
              </Link>
              <Link href="/batch">
                <Button size="sm">
                  Try Batch Page Again
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}