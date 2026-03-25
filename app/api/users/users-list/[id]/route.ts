import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getSupabaseServer()

    // Get user with institution
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at,
        phone,
        username,
        bio,
        website,
        location,
        date_of_birth,
        avatar_url,
        is_verified,
        institution_id,
        institutions!inner(institution_code)
      `)
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get role if user has one (match by role_name)
    let role = null
    if (user.role) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, role_name, role_description, is_active')
        .eq('role_name', user.role)
        .single()

      if (!roleError && roleData) {
        role = roleData
      }
    }

    return NextResponse.json({
      ...user,
      institution_code: (user as any).institutions?.institution_code || null,
      role_id: role?.id || null, // Map to role_id for frontend compatibility
      roles: role
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { full_name, email, role, roles, is_active, phone, bio, website, location, date_of_birth, institution_id, avatar_url } = body as Record<string, unknown>

    const supabase2 = getSupabaseServer()

    // Handle multiple roles from roles array
    let roleToUpdate = role
    const rolesArray = Array.isArray(roles) ? roles : []

    // If roles array provided, use first role as legacy role field
    if (rolesArray.length > 0) {
      roleToUpdate = rolesArray[0]
    }

    // If role_id is provided, convert it to role name
    if (body.role_id !== undefined && body.role_id) {
      const { data: roleData, error: roleError } = await supabase2
        .from('roles')
        .select('name')
        .eq('id', String(body.role_id))
        .single()

      if (!roleError && roleData) {
        roleToUpdate = roleData.name
      }
    }

    const data: Record<string, unknown> = {
      ...(full_name !== undefined && { full_name: String(full_name) }),
      ...(email !== undefined && { email: String(email) }),
      ...(email !== undefined && { username: String(email) }), // Username always same as email
      ...(roleToUpdate !== undefined && { role: String(roleToUpdate) }),
      ...(is_active !== undefined && { is_active: Boolean(is_active) }),
      ...(phone !== undefined && { phone: phone ? String(phone) : null }),
      ...(bio !== undefined && { bio: bio ? String(bio) : null }),
      ...(website !== undefined && { website: website ? String(website) : null }),
      ...(location !== undefined && { location: location ? String(location) : null }),
      ...(date_of_birth !== undefined && { date_of_birth: date_of_birth ? String(date_of_birth) : null }),
      ...(avatar_url !== undefined && { avatar_url: avatar_url ? String(avatar_url) : null }),
      ...(institution_id !== undefined && { institution_id: institution_id ? String(institution_id) : null }),
      is_verified: true, // Always verified
      updated_at: new Date().toISOString(),
    }

    const { data: updated, error } = await supabase2
      .from('users')
      .update(data)
      .eq('id', id)
      .select(`
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at,
        phone,
        username,
        bio,
        website,
        location,
        date_of_birth,
        avatar_url,
        is_verified,
        institution_id,
        institutions!inner(institution_code)
      `)
      .single()

    if (error) throw error

    // Update user_roles table if roles array provided
    if (rolesArray.length > 0) {
      // Delete existing user_roles
      await supabase2
        .from('user_roles')
        .delete()
        .eq('user_id', id)

      // Get role IDs for the provided role names
      const { data: roleRecords, error: roleError } = await supabase2
        .from('roles')
        .select('id, name')
        .in('name', rolesArray.map(r => String(r)))

      if (!roleError && roleRecords) {
        // Insert new user_roles
        const userRolesInserts = roleRecords.map(roleRecord => ({
          user_id: id,
          role_id: roleRecord.id,
          assigned_at: new Date().toISOString(),
          is_active: true,
          expires_at: null
        }))

        await supabase2
          .from('user_roles')
          .insert(userRolesInserts)
      }
    }

    return NextResponse.json({
      ...updated,
      institution_code: (updated as any).institutions?.institution_code || null
    })
  } catch (err) {
    console.error('Update user error:', err)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase3 = getSupabaseServer()
    const { error } = await supabase3.from('users').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}


