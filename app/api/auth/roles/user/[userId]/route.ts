import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

// Get all roles assigned to a specific user
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createRouteHandlerSupabaseClient()
    const { userId } = await params

    // Check if requester is authenticated
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the service client
    const svc = getSupabaseServer()

    // Check if requester has permission to view user roles
    const { data: requester } = await svc
      .from('users')
      .select('id, is_super_admin, permissions')
      .eq('id', authUser.id)
      .single()

    // Users can view their own roles, admins can view any user's roles
    const canViewRoles =
      authUser.id === userId ||
      requester?.is_super_admin ||
      requester?.permissions?.['users.view'] ||
      requester?.permissions?.['roles.view']

    if (!canViewRoles) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view user roles' },
        { status: 403 }
      )
    }

    // Fetch user's roles from normalized user_roles table
    const { data: userRoles, error } = await svc
      .from('user_roles')
      .select(`
        id,
        role_id,
        assigned_at,
        assigned_by,
        is_active,
        expires_at,
        roles (
          id,
          name,
          description,
          is_system_role
        ),
        assignedBy:assigned_by (
          email,
          full_name
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false })

    if (error) {
      console.error('Error fetching user roles:', error)
      return NextResponse.json(
        { error: 'Failed to fetch user roles' },
        { status: 500 }
      )
    }

    // Format the response
    const formattedRoles = userRoles?.map(ur => ({
      id: ur.id,
      roleId: ur.role_id,
      roleName: ur.roles?.name,
      roleDescription: ur.roles?.description,
      isSystemRole: ur.roles?.is_system_role,
      assignedAt: ur.assigned_at,
      assignedBy: ur.assignedBy
        ? {
            email: ur.assignedBy.email,
            name: ur.assignedBy.full_name
          }
        : null,
      expiresAt: ur.expires_at,
      isActive: ur.is_active
    })) || []

    // Also fetch the computed permissions for this user
    const { data: rolePerms } = await svc
      .from('role_permissions')
      .select(`
        permissions (
          name,
          description,
          resource,
          action
        )
      `)
      .in('role_id', userRoles?.map(ur => ur.role_id) || [])

    const permissions = new Map()
    rolePerms?.forEach(rp => {
      if (rp.permissions?.name) {
        permissions.set(rp.permissions.name, {
          name: rp.permissions.name,
          description: rp.permissions.description,
          resource: rp.permissions.resource,
          action: rp.permissions.action
        })
      }
    })

    return NextResponse.json({
      userId,
      roles: formattedRoles,
      permissions: Array.from(permissions.values()),
      totalRoles: formattedRoles.length,
      totalPermissions: permissions.size
    })

  } catch (error) {
    console.error('Error in user roles API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}