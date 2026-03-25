'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import supabaseAuthService from '@/services/auth/supabase-auth-service';
import { ProtectedRoute, RequirePermission, RequireRole } from '@/components/common/protected-route';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, ShieldCheck, UserCheck, Lock, Unlock, CheckCircle, XCircle } from 'lucide-react';

export default function RBACExamplePage() {
  const { user, isLoading, hasPermission, hasRole, hasAnyRole } = useAuth();
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserRoles();
    }
  }, [user]);

  const fetchUserRoles = async () => {
    if (!user) return;

    setLoadingRoles(true);
    try {
      const response = await fetch(`/api/auth/roles/user/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setUserRoles(data.roles || []);
      }
    } catch (error) {
      console.error('Failed to fetch user roles:', error);
    } finally {
      setLoadingRoles(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    // Page requires authentication
    <ProtectedRoute redirectTo="/login">
      <div className="container mx-auto p-6 max-w-6xl">
        <h1 className="text-3xl font-bold mb-6">Normalized RBAC Access Control Example</h1>

        {/* User Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Current User Information
            </CardTitle>
            <CardDescription>
              Your roles and permissions are managed through the normalized RBAC system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Email:</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Super Admin:</p>
                  <Badge variant={user?.is_super_admin ? 'default' : 'secondary'}>
                    {user?.is_super_admin ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>

              {/* User Roles */}
              <div>
                <p className="text-sm font-medium mb-2">Assigned Roles (from user_roles table):</p>
                {loadingRoles ? (
                  <p className="text-sm text-muted-foreground">Loading roles...</p>
                ) : userRoles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {userRoles.map((role: any) => (
                      <Badge key={role.id} variant="outline">
                        {role.roleName}
                        {role.isSystemRole && (
                          <ShieldCheck className="ml-1 h-3 w-3" />
                        )}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No roles assigned</p>
                )}
              </div>

              {/* All Roles from Auth Service */}
              {typeof window !== 'undefined' && (
                <div>
                  <p className="text-sm font-medium mb-2">All Roles (from auth service):</p>
                  <div className="flex flex-wrap gap-2">
                    {supabaseAuthService.getUserRoles().map(role => (
                      <Badge key={role} variant="default">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RBAC Examples */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>RBAC Access Examples</CardTitle>
            <CardDescription>
              These examples show how to control access using roles and permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Role-based Access Examples */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Role-Based Access Control</h3>
              <div className="space-y-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Admin Only Section</span>
                    {hasRole('admin') ? (
                      <Unlock className="h-4 w-4 text-green-600" />
                    ) : (
                      <Lock className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <RequireRole role="admin" fallback={
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertTitle>Access Denied</AlertTitle>
                      <AlertDescription>
                        This section requires the "admin" role.
                      </AlertDescription>
                    </Alert>
                  }>
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-800">Admin Access Granted</AlertTitle>
                      <AlertDescription className="text-green-700">
                        You have admin role and can see this content!
                      </AlertDescription>
                    </Alert>
                  </RequireRole>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Staff or Admin Section</span>
                    {hasAnyRole(['admin', 'staff']) ? (
                      <Unlock className="h-4 w-4 text-green-600" />
                    ) : (
                      <Lock className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <RequireRole role={['admin', 'staff']} fallback={
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertTitle>Access Denied</AlertTitle>
                      <AlertDescription>
                        This section requires either "admin" or "staff" role.
                      </AlertDescription>
                    </Alert>
                  }>
                    <Alert className="border-blue-200 bg-blue-50">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800">Staff Access Granted</AlertTitle>
                      <AlertDescription className="text-blue-700">
                        You have staff or admin role and can see this content!
                      </AlertDescription>
                    </Alert>
                  </RequireRole>
                </div>
              </div>
            </div>

            {/* Permission-based Access Examples */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Permission-Based Access Control</h3>
              <div className="space-y-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Batch View Permission</span>
                    {hasPermission('batches.view') ? (
                      <Unlock className="h-4 w-4 text-green-600" />
                    ) : (
                      <Lock className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <RequirePermission permission="batches.view" fallback={
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertTitle>Access Denied</AlertTitle>
                      <AlertDescription>
                        This section requires "batches.view" permission.
                      </AlertDescription>
                    </Alert>
                  }>
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-800">Batch View Access</AlertTitle>
                      <AlertDescription className="text-green-700">
                        You can view batch information!
                      </AlertDescription>
                    </Alert>
                  </RequirePermission>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">User Management Permission</span>
                    {hasPermission('users.edit') ? (
                      <Unlock className="h-4 w-4 text-green-600" />
                    ) : (
                      <Lock className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <RequirePermission permission={['users.view', 'users.edit']} fallback={
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertTitle>Access Denied</AlertTitle>
                      <AlertDescription>
                        This section requires "users.view" and "users.edit" permissions.
                      </AlertDescription>
                    </Alert>
                  }>
                    <Alert className="border-purple-200 bg-purple-50">
                      <CheckCircle className="h-4 w-4 text-purple-600" />
                      <AlertTitle className="text-purple-800">User Management Access</AlertTitle>
                      <AlertDescription className="text-purple-700">
                        You can view and edit user information!
                      </AlertDescription>
                    </Alert>
                  </RequirePermission>
                </div>
              </div>
            </div>

            {/* Complex Access Control */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Complex Access Control</h3>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Admin Role + Batch Edit Permission</span>
                  {hasRole('admin') && hasPermission('batches.edit') ? (
                    <Unlock className="h-4 w-4 text-green-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <ProtectedRoute
                  requiredRoles={['admin']}
                  requiredPermissions={['batches.edit']}
                  fallback={
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertTitle>Access Denied</AlertTitle>
                      <AlertDescription>
                        This section requires both "admin" role AND "batches.edit" permission.
                      </AlertDescription>
                    </Alert>
                  }
                >
                  <Alert className="border-emerald-200 bg-emerald-50">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <AlertTitle className="text-emerald-800">Full Admin Access</AlertTitle>
                    <AlertDescription className="text-emerald-700">
                      You have admin role AND batch edit permission - full access granted!
                    </AlertDescription>
                  </Alert>
                </ProtectedRoute>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Code Examples */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use RBAC in Your Pages</CardTitle>
            <CardDescription>
              Code examples for implementing role and permission-based access control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">1. Protect an entire page:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`<ProtectedRoute
  requiredRoles={['admin', 'staff']}
  redirectTo="/unauthorized"
>
  <YourPageContent />
</ProtectedRoute>`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">2. Protect a section with permissions:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`<RequirePermission
  permission="batches.create"
  fallback={<AccessDeniedMessage />}
>
  <CreateBatchForm />
</RequirePermission>`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">3. Conditional rendering based on role:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`{hasRole('admin') && (
  <AdminDashboard />
)}`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">4. Complex access control:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`<ProtectedRoute
  requiredRoles={['admin']}
  requiredPermissions={['users.edit', 'users.delete']}
  requireAnyRole={false} // Must have ALL specified roles
>
  <UserManagementPanel />
</ProtectedRoute>`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}