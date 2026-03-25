import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { sendWelcomeEmail } from '@/services/shared/email-service'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || undefined

    let supabase
    try {
      supabase = getSupabaseServer()
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error)
      return NextResponse.json([])
    }

    let usersQuery = supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        username,
        avatar_url,
        bio,
        website,
        location,
        date_of_birth,
        phone,
        is_active,
        is_verified,
        role,
        preferences,
        metadata,
        institution_id,
        institutions!inner(institution_code),
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (q) {
      usersQuery = usersQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    }

    const { data: users, error: usersError } = await usersQuery
    if (usersError) {
      console.error('Users fetch error:', usersError)
      return NextResponse.json([], { status: 200 })
    }

    // Flatten institution_code from nested institutions object
    const formattedUsers = (users ?? []).map(user => ({
      ...user,
      institution_code: (user as any).institutions?.institution_code || null
    }))

    return NextResponse.json(formattedUsers)
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({
      error: 'Failed to fetch users',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      full_name,
      email,
      role,             // varchar role name (legacy field)
      roles,            // array of role names (new multi-role system)
      is_active = true,
      is_verified = true,
      phone,
      bio,
      website,
      location,
      date_of_birth,
      institution_id,
      avatar_url,
      preferences,
      metadata,
    } = body as Record<string, unknown>

    if (!full_name || !email) {
      return NextResponse.json({ error: 'Missing required fields: full_name and email are required' }, { status: 400 })
    }
    if (!institution_id || String(institution_id).trim().length === 0) {
      return NextResponse.json({ error: 'Missing required field: institution_id' }, { status: 400 })
    }

    const id = randomUUID()
    const supabase2 = getSupabaseServer()

    // Handle multiple roles
    const rolesArray = Array.isArray(roles) ? roles : []
    const primaryRole = rolesArray.length > 0 ? rolesArray[0] : (role ? String(role) : 'user')

    const insertPayload: any = {
      id,
      full_name: String(full_name),
      email: String(email),
      username: String(email),
      role: primaryRole, // Use first role from array or fallback to legacy role
      is_active: Boolean(is_active),
      is_verified: Boolean(is_verified),
      phone: phone ? String(phone) : null,
      bio: bio ? String(bio) : null,
      website: website ? String(website) : null,
      location: location ? String(location) : null,
      date_of_birth: date_of_birth ? String(date_of_birth) : null,
      avatar_url: avatar_url ? String(avatar_url) : null,
      institution_id: String(institution_id),
      preferences: preferences ?? {},
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase2.from('users').insert(insertPayload).select('*').single()

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    // Insert user_roles if roles array provided
    if (rolesArray.length > 0) {
      // Get role IDs for the provided role names
      const { data: roleRecords, error: roleError } = await supabase2
        .from('roles')
        .select('id, name')
        .in('name', rolesArray.map(r => String(r)))

      if (!roleError && roleRecords && roleRecords.length > 0) {
        // Insert new user_roles
        const userRolesInserts = roleRecords.map(roleRecord => ({
          user_id: id,
          role_id: roleRecord.id,
          assigned_at: new Date().toISOString(),
          is_active: true,
          expires_at: null
        }))

        const { error: insertError } = await supabase2
          .from('user_roles')
          .insert(userRolesInserts)

        if (insertError) {
          console.error('Error inserting user_roles:', insertError)
          // Don't fail the request if user_roles insert fails
        }
      }
    }

    // Send welcome email to the new user
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`
    const emailResult = await sendWelcomeEmail({
      to: String(email),
      name: String(full_name),
      loginUrl,
      temporaryPassword: body.password ? String(body.password) : undefined
    })

    if (!emailResult.success) {
      console.warn('Failed to send welcome email:', emailResult.error)
      // Don't fail the request if email fails
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Failed to create user', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}


