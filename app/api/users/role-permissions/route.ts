import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// GET role -> permissions mapping (optional filters by role_id)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roleId = searchParams.get('role_id')
  try {
    let query = supabase.from('role_permissions').select('id, role_id, permission_id, granted_at, granted_by')
    if (roleId) query = query.eq('role_id', roleId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Failed to fetch role-permissions' }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST bulk upsert for a role: { role_id, permission_ids: string[], granted_by?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { role_id: string; permission_ids: string[]; granted_by?: string }
    const { role_id, permission_ids, granted_by } = body
    if (!role_id || !Array.isArray(permission_ids)) {
      return NextResponse.json({ error: 'role_id and permission_ids required' }, { status: 400 })
    }

    // Fetch existing mappings
    const { data: existing, error: fetchErr } = await supabase
      .from('role_permissions')
      .select('permission_id, id')
      .eq('role_id', role_id)
    if (fetchErr) return NextResponse.json({ error: 'Failed to read mappings' }, { status: 500 })

    const existingSet = new Set((existing || []).map(e => e.permission_id))
    const targetSet = new Set(permission_ids)

    const toInsert = [...targetSet].filter(id => !existingSet.has(id))
    const toDelete = (existing || []).filter(e => !targetSet.has(e.permission_id)).map(e => e.id)

    if (toInsert.length > 0) {
      const insertRows = toInsert.map(pid => ({ role_id, permission_id: pid, granted_by }))
      const { error: insErr } = await supabase.from('role_permissions').insert(insertRows)
      if (insErr) return NextResponse.json({ error: 'Failed to insert role-permissions' }, { status: 500 })
    }

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('role_permissions').delete().in('id', toDelete)
      if (delErr) return NextResponse.json({ error: 'Failed to delete role-permissions' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Role permissions updated' })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


