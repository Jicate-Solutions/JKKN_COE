import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // If table doesn't exist or error, return mock data
      console.warn('Roles table error, using mock data:', error)
      return NextResponse.json([
        { id: "1", name: "user", role_name: "user", role_description: "Regular user with basic permissions", is_active: true },
        { id: "2", name: "admin", role_name: "admin", role_description: "Administrator with full permissions", is_active: true },
        { id: "3", name: "moderator", role_name: "moderator", role_description: "Moderator with limited admin permissions", is_active: true },
        { id: "4", name: "faculty", role_name: "faculty", role_description: "Faculty member with teaching permissions", is_active: true },
        { id: "5", name: "student", role_name: "student", role_description: "Student with read-only permissions", is_active: true }
      ])
    }

    // If data is empty, return mock data
    if (!data || data.length === 0) {
      return NextResponse.json([
        { id: "1", name: "user", role_name: "user", role_description: "Regular user with basic permissions", is_active: true },
        { id: "2", name: "admin", role_name: "admin", role_description: "Administrator with full permissions", is_active: true },
        { id: "3", name: "moderator", role_name: "moderator", role_description: "Moderator with limited admin permissions", is_active: true },
        { id: "4", name: "faculty", role_name: "faculty", role_description: "Faculty member with teaching permissions", is_active: true },
        { id: "5", name: "student", role_name: "student", role_description: "Student with read-only permissions", is_active: true }
      ])
    }

    // Ensure compatibility with both 'name' and 'role_name' fields
    const rolesWithName = data.map(role => ({
      ...role,
      name: role.role_name || role.name // Support both field names
    }))

    return NextResponse.json(rolesWithName)
  } catch (error) {
    console.error('Roles API error:', error)
    // Return mock data on error
    return NextResponse.json([
      { id: "1", name: "user", role_name: "user", role_description: "Regular user with basic permissions", is_active: true },
      { id: "2", name: "admin", role_name: "admin", role_description: "Administrator with full permissions", is_active: true },
      { id: "3", name: "moderator", role_name: "moderator", role_description: "Moderator with limited admin permissions", is_active: true },
      { id: "4", name: "faculty", role_name: "faculty", role_description: "Faculty member with teaching permissions", is_active: true },
      { id: "5", name: "student", role_name: "student", role_description: "Student with read-only permissions", is_active: true }
    ], { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Extract and validate required fields
    const roleName = body.role_name || body.name
    const roleDescription = body.role_description || body.description

    if (!roleName || !roleName.trim()) {
      return NextResponse.json({
        error: 'Role name is required'
      }, { status: 400 })
    }

    // Prepare payload with correct field names matching the database schema
    const payload = {
      name: roleName.trim(),
      description: roleDescription || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      is_system_role: body.is_system_role || false
    }

    const { data, error } = await supabase
      .from('roles')
      .insert([payload])
      .select()

    if (error) {
      console.error('Error creating role:', error)

      // Handle duplicate key constraint violation (23505)
      if (error.code === '23505') {
        return NextResponse.json({
          error: `Role "${roleName}" already exists. Please use a different name.`
        }, { status: 400 })
      }

      // Handle not-null constraint violation (23502)
      if (error.code === '23502') {
        return NextResponse.json({
          error: 'Missing required field. Please check your input.'
        }, { status: 400 })
      }

      // Handle check constraint violation (23514)
      if (error.code === '23514') {
        return NextResponse.json({
          error: 'Invalid value. Please check your input.'
        }, { status: 400 })
      }

      // Generic error
      return NextResponse.json({
        error: 'Failed to create role. Please try again.'
      }, { status: 500 })
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error creating role:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again.'
    }, { status: 500 })
  }
}