import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json()
    const { id } = await params
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
      is_system_role: body.is_system_role !== undefined ? body.is_system_role : false
    }

    const { data, error } = await supabase
      .from('roles')
      .update(payload)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating role:', error)

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
        error: 'Failed to update role. Please try again.'
      }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        error: 'Role not found'
      }, { status: 404 })
    }

    return NextResponse.json(data[0])
  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again.'
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getSupabaseServer()

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting role:', error)

      // Handle foreign key constraint violation (23503)
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Cannot delete role. It is being used by other records.'
        }, { status: 400 })
      }

      // Generic error
      return NextResponse.json({
        error: 'Failed to delete role. Please try again.'
      }, { status: 500 })
    }

    return NextResponse.json({ message: 'Role deleted successfully' })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again.'
    }, { status: 500 })
  }
}