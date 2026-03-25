import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

// Assign role to a user
export async function POST(req: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient()

    // Check if requester is authenticated
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const { userId, roleName, roleId } = await req.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    if (!roleName && !roleId) {
      return NextResponse.json(
        { error: 'Either roleName or roleId is required' },
        { status: 400 }
      )
    }

    // Get the service client for admin operations
    const svc = getSupabaseServer()

    // Check if requester has permission to assign roles
    const { data: requester } = await svc
      .from('users')
      .select('is_super_admin, permissions')
      .eq('id', authUser.id)
      .single()

    const canAssignRoles =
      requester?.is_super_admin ||
      requester?.permissions?.['users.edit'] ||
      requester?.permissions?.['roles.assign']

    if (!canAssignRoles) {
      return NextResponse.json(
        { error: 'Insufficient permissions to assign roles' },
        { status: 403 }
      )
    }

    // Get role ID if only name was provided
    let finalRoleId = roleId
    if (!finalRoleId && roleName) {
      const { data: role } = await svc
        .from('roles')
        .select('id')
        .eq('name', roleName)
        .single()

      if (!role) {
        return NextResponse.json(
          { error: `Role '${roleName}' not found` },
          { status: 404 }
        )
      }
      finalRoleId = role.id
    }

    // Check if assignment already exists
    const { data: existingAssignment } = await svc
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('role_id', finalRoleId)
      .single()

    if (existingAssignment) {
      // Reactivate if it was deactivated
      if (!existingAssignment.is_active) {
        const { error: updateError } = await svc
          .from('user_roles')
          .update({
            is_active: true,
            assigned_at: new Date().toISOString(),
            assigned_by: authUser.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAssignment.id)

        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to reactivate role assignment' },
            { status: 500 }
          )
        }
      } else {
        return NextResponse.json(
          { message: 'Role already assigned to user' },
          { status: 200 }
        )
      }
    } else {
      // Create new assignment
      const { error: insertError } = await svc
        .from('user_roles')
        .insert({
          user_id: userId,
          role_id: finalRoleId,
          assigned_by: authUser.id
        })

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to assign role' },
          { status: 500 }
        )
      }
    }

    // Compute and cache the user's new permissions
    const { data: rolePerms } = await svc
      .from('role_permissions')
      .select(`
        permissions (
          name
        )
      `)
      .eq('role_id', finalRoleId)

    const newPermissions: Record<string, boolean> = {}
    rolePerms?.forEach(rp => {
      if (rp.permissions?.name) {
        newPermissions[rp.permissions.name] = true
      }
    })

    // Update user's cached permissions
    await svc
      .from('users')
      .update({
        permissions: newPermissions,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    return NextResponse.json({
      success: true,
      message: 'Role assigned successfully'
    })

  } catch (error) {
    console.error('Error assigning role:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Remove role from a user
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient()

    // Check if requester is authenticated
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const roleName = searchParams.get('roleName')
    const roleId = searchParams.get('roleId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    if (!roleName && !roleId) {
      return NextResponse.json(
        { error: 'Either roleName or roleId is required' },
        { status: 400 }
      )
    }

    // Get the service client for admin operations
    const svc = getSupabaseServer()

    // Check if requester has permission to remove roles
    const { data: requester } = await svc
      .from('users')
      .select('is_super_admin, permissions')
      .eq('id', authUser.id)
      .single()

    const canRemoveRoles =
      requester?.is_super_admin ||
      requester?.permissions?.['users.edit'] ||
      requester?.permissions?.['roles.remove']

    if (!canRemoveRoles) {
      return NextResponse.json(
        { error: 'Insufficient permissions to remove roles' },
        { status: 403 }
      )
    }

    // Get role ID if only name was provided
    let finalRoleId = roleId
    if (!finalRoleId && roleName) {
      const { data: role } = await svc
        .from('roles')
        .select('id')
        .eq('name', roleName)
        .single()

      if (!role) {
        return NextResponse.json(
          { error: `Role '${roleName}' not found` },
          { status: 404 }
        )
      }
      finalRoleId = role.id
    }

    // Soft delete the role assignment
    const { error: deleteError } = await svc
      .from('user_roles')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('role_id', finalRoleId)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to remove role' },
        { status: 500 }
      )
    }

    // Recompute user's permissions after role removal
    const { data: remainingRoles } = await svc
      .from('user_roles')
      .select(`
        roles (
          id
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)

    const roleIds = remainingRoles?.map(ur => ur.roles?.id).filter(Boolean) || []

    let updatedPermissions: Record<string, boolean> = {}

    if (roleIds.length > 0) {
      const { data: rolePerms } = await svc
        .from('role_permissions')
        .select(`
          permissions (
            name
          )
        `)
        .in('role_id', roleIds)

      rolePerms?.forEach(rp => {
        if (rp.permissions?.name) {
          updatedPermissions[rp.permissions.name] = true
        }
      })
    }

    // Update user's cached permissions
    await svc
      .from('users')
      .update({
        permissions: updatedPermissions,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    return NextResponse.json({
      success: true,
      message: 'Role removed successfully'
    })

  } catch (error) {
    console.error('Error removing role:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}