import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

// Optimized permission system:
// - Super admins: Use JSONB permissions field ONLY (for special privileges)
// - Other users: Compute from RBAC and cache in JSONB for performance
// - Supports force refresh via query parameter: ?force=true (bypasses cache)
export async function GET(req: NextRequest) {
  try {
    // Check if force refresh is requested (bypasses cache for immediate updates)
    const { searchParams } = new URL(req.url)
    const forceRefresh = searchParams.get('force') === 'true'

    if (forceRefresh) {
      console.log('🔄 Force refresh requested - bypassing cache')
    }

    // Use SSR client bound to the user's auth cookies
    const supabase = await createRouteHandlerSupabaseClient()

    // Get the authenticated user from the auth token
    const { data: authUserData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authUserData?.user) {
      return NextResponse.json({
        roles: [],
        permissions: [],
        effectivePermissions: {},
        source: 'none'
      })
    }
    const authEmail = authUserData.user.email || ''

    // Fetch current user row by email
    let { data: currentUser, error: cuErr } = await supabase
      .from('users')
      .select('id, email, role, is_super_admin, permissions, updated_at')
      .eq('email', authEmail)
      .maybeSingle()

    // If RLS blocked or row not found via cookie client, fallback to service client
    if (!currentUser) {
      try {
        const svc = getSupabaseServer()
        const res = await svc
          .from('users')
          .select('id, email, role, is_super_admin, permissions, updated_at')
          .eq('email', authEmail)
          .maybeSingle()
        currentUser = res.data as typeof currentUser
      } catch {}
    }
    if (!currentUser) return NextResponse.json({
      roles: [],
      permissions: [],
      effectivePermissions: {},
      source: 'none'
    })

    // Fetch user's roles from normalized user_roles table
    let roleIds: string[] = []
    let roleNames: string[] = []

    // Use normalized RBAC: user_roles → roles
    const { data: userRoles, error: urErr } = await supabase
      .from('user_roles')
      .select(`
        role_id,
        roles (
          id,
          name,
          description,
          is_active
        )
      `)
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')

    if (!urErr && Array.isArray(userRoles) && userRoles.length > 0) {
      // Extract role IDs and names from the joined data
      roleIds = userRoles
        .filter(ur => ur.roles?.is_active !== false)
        .map(ur => ur.role_id)

      roleNames = userRoles
        .filter(ur => ur.roles?.is_active !== false)
        .map(ur => ur.roles?.name)
        .filter((n): n is string => Boolean(n))
    }

    // Log for debugging
    console.log(`User ${currentUser.email} has roles:`, roleNames)

    // SUPER ADMIN: Use JSONB permissions ONLY
    if (currentUser.is_super_admin) {
      // Super admins use their JSONB permissions field exclusively
      // This allows for special/custom privileges beyond standard RBAC
      const effectivePermissions = currentUser.permissions || {}
      const permissionList = Object.entries(effectivePermissions)
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key)

      return NextResponse.json({
        roles: ['super_admin'],
        permissions: permissionList,
        effectivePermissions,
        source: 'super_admin_jsonb',
        cached: true,
        cacheTimestamp: currentUser.updated_at
      })
    }

    // REGULAR USERS: Check if cached permissions are valid
    const cachedPermissions = currentUser.permissions || {}
    const cacheAge = currentUser.updated_at ?
      Date.now() - new Date(currentUser.updated_at).getTime() : Infinity
    const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache TTL

    // If cache is fresh and has permissions, use it for performance (unless force refresh)
    if (!forceRefresh && cacheAge < CACHE_TTL && Object.keys(cachedPermissions).length > 0) {
      const permissionList = Object.entries(cachedPermissions)
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key)

      return NextResponse.json({
        roles: roleNames,
        permissions: permissionList,
        effectivePermissions: cachedPermissions,
        source: 'cached_jsonb',
        cached: true,
        cacheAge: Math.floor(cacheAge / 1000), // in seconds
        cacheTimestamp: currentUser.updated_at
      })
    }

    // COMPUTE PERMISSIONS FROM NORMALIZED RBAC
    const effectivePermissions: Record<string, boolean> = {}

    if (roleIds.length > 0) {
      // Fetch permissions through: role_permissions → permissions
      const { data: rolePerms, error: rpErr } = await supabase
        .from('role_permissions')
        .select(`
          permission_id,
          permissions (
            id,
            name,
            resource,
            action,
            is_active
          )
        `)
        .in('role_id', roleIds)

      if (!rpErr && rolePerms) {
        // Build effective permissions object
        rolePerms.forEach(rp => {
          if (rp.permissions?.is_active !== false && rp.permissions?.name) {
            effectivePermissions[rp.permissions.name] = true
          }
        })

        console.log(`Computed ${Object.keys(effectivePermissions).length} permissions for user ${currentUser.email}`)
      } else if (rpErr) {
        console.error('Error fetching role permissions:', rpErr)
      }
    } else {
      console.log(`User ${currentUser.email} has no active roles`)
    }

    // UPDATE CACHE: Store computed permissions in users.permissions JSONB
    // This runs in background - don't wait for it
    const svc = getSupabaseServer()
    svc.from('users')
      .update({
        permissions: effectivePermissions,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id)
      .then(({ error }) => {
        if (error) console.log('Failed to cache permissions:', error)
      })
      .catch(err => console.log('Cache update error:', err))

    const permissionList = Object.keys(effectivePermissions)

    return NextResponse.json({
      roles: roleNames,
      permissions: permissionList,
      effectivePermissions,
      source: 'computed_rbac',
      cached: false,
      cacheUpdated: true
    })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


