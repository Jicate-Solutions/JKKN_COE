import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/users/[id]/roles
 *
 * Fetches all roles assigned to a specific user from the user_roles table
 * Returns an array of role names
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServer()

    // Fetch user's roles from user_roles table with role details
    const { data: userRolesData, error } = await supabase
      .from('user_roles')
      .select(`
        role_id,
        roles!inner(
          id,
          name,
          description
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')

    if (error) {
      console.error('Error fetching user roles:', error)
      throw error
    }

    // Extract role names from the joined data
    const roleNames = (userRolesData || [])
      .filter(ur => ur.roles)
      .map(ur => (ur.roles as any).name)
      .filter(Boolean)

    return NextResponse.json({
      user_id: userId,
      roles: roleNames,
      count: roleNames.length
    })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json(
      {
        error: 'Failed to fetch user roles',
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
