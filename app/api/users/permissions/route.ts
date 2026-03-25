import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Permissions table error, returning empty list:', error)
      return NextResponse.json([])
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Permissions API error:', error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Check for name conflicts
    if (body.name) {
      const { data: existingNamePermission, error: nameCheckError } = await supabase
        .from('permissions')
        .select('id, name, resource, action')
        .eq('name', body.name)
        .single()

      if (nameCheckError && nameCheckError.code !== 'PGRST116') {
        console.error('Error checking for name conflicts:', nameCheckError)
        return NextResponse.json({ error: 'Failed to check for name conflicts' }, { status: 500 })
      }

      if (existingNamePermission) {
        return NextResponse.json({ 
          error: `Permission name conflict: A permission with name "${body.name}" already exists (resource: "${existingNamePermission.resource}", action: "${existingNamePermission.action}"). Please choose a different name.` 
        }, { status: 409 })
      }
    }

    // Check if there's a conflict with existing permission (resource, action) combination
    if (body.resource && body.action) {
      const { data: existingPermission, error: checkError } = await supabase
        .from('permissions')
        .select('id, name, resource, action')
        .eq('resource', body.resource)
        .eq('action', body.action)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for resource-action conflicts:', checkError)
        return NextResponse.json({ error: 'Failed to check for resource-action conflicts' }, { status: 500 })
      }

      if (existingPermission) {
        return NextResponse.json({ 
          error: `Permission conflict: A permission with resource "${body.resource}" and action "${body.action}" already exists (name: "${existingPermission.name}"). Please choose a different action or delete the conflicting permission first.` 
        }, { status: 409 })
      }
    }

    const { data, error } = await supabase
      .from('permissions')
      .insert([body])
      .select()

    if (error) {
      console.error('Supabase error:', error)
      
      // Check for unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'permissions_name_key') {
          return NextResponse.json({ 
            error: `Permission name conflict: A permission with name "${body.name}" already exists. Please choose a different name.` 
          }, { status: 409 })
        } else if (error.constraint === 'permissions_resource_action_key') {
          return NextResponse.json({ 
            error: `Permission conflict: A permission with resource "${body.resource}" and action "${body.action}" already exists. Please choose a different action or delete the conflicting permission first.` 
          }, { status: 409 })
        }
      }
      
      // Return more detailed error information
      return NextResponse.json({ 
        error: `Failed to create permission: ${error.message || 'Unknown database error'}`,
        details: error
      }, { status: 500 })
    }

    return NextResponse.json(data?.[0] ?? null, { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


