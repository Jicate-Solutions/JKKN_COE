import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json()
    const { id } = await params

    // Check if there's a conflict with existing permission (resource, action) combination
    if (body.resource && body.action) {
      const { data: existingPermission, error: checkError } = await supabase
        .from('permissions')
        .select('id, name')
        .eq('resource', body.resource)
        .eq('action', body.action)
        .neq('id', id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for conflicts:', checkError)
        return NextResponse.json({ error: 'Failed to check for conflicts' }, { status: 500 })
      }

      if (existingPermission) {
        return NextResponse.json({ 
          error: `Permission conflict: A permission with resource "${body.resource}" and action "${body.action}" already exists (${existingPermission.name}). Please choose a different action or delete the conflicting permission first.` 
        }, { status: 409 })
      }
    }

    const { data, error } = await supabase
      .from('permissions')
      .update(body)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Supabase error:', error)
      
      // Check for unique constraint violation
      if (error.code === '23505' && error.constraint === 'permissions_resource_action_key') {
        return NextResponse.json({ 
          error: `Permission conflict: A permission with this resource and action combination already exists. Please choose a different action or delete the conflicting permission first.` 
        }, { status: 409 })
      }
      
      return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 })
    }

    return NextResponse.json(data?.[0] ?? null)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabase
      .from('permissions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to delete permission' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Permission deleted successfully' })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


