import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const institutionCode = searchParams.get('institution_code')

    const supabase = getSupabaseServer()
    let query = supabase
      .from('batch')
      .select('*')
      .order('created_at', { ascending: false })

    // Apply filters
    if (search) {
      query = query.or(`batch_code.ilike.%${search}%,batch_name.ilike.%${search}%,batch_year::text.ilike.%${search}%`)
    }
    if (status !== null) {
      query = query.eq('status', status === 'true')
    }
    if (institutionCode) {
      query = query.eq('institution_code', institutionCode)
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      
      // Check if batch table doesn't exist
      if (error.message.includes('relation "batch" does not exist') || error.message.includes('relation "public.batch" does not exist')) {
        return NextResponse.json({
          error: 'Batch table not found',
          message: 'The batch table needs to be created in your Supabase database',
          instructions: {
            step1: 'Go to your Supabase dashboard',
            step2: 'Navigate to SQL Editor',
            step3: 'Run the provided SQL script to create the batch table',
            sql: `
-- Create batch table (updated schema)
create table public.batch (
  id uuid not null default gen_random_uuid (),
  institutions_id uuid null,
  institution_code character varying(50) not null,
  batch_year integer not null,
  batch_name character varying(100) not null,
  batch_code character varying(50) not null,
  start_date date null,
  end_date date null,
  status boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint batch_table_pkey primary key (id),
  constraint batch_table_institutions_id_batch_code_key unique (institutions_id, batch_code),
  constraint batch_table_institutions_id_fkey foreign KEY (institutions_id) references institutions (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_batch_code on public.batch using btree (institution_code, batch_code) TABLESPACE pg_default;

create index IF not exists idx_batch_fk on public.batch using btree (institutions_id) TABLESPACE pg_default;

create trigger update_batch_updated_at BEFORE
update on batch for EACH row
execute FUNCTION update_updated_at_column ();
            `
          }
        }, { status: 404 })
      }
      
      throw error
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({
      error: 'Failed to fetch batch', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // RBAC: require batches.create
    const supa = await createRouteHandlerSupabaseClient()
    const { data: userData } = await supa.auth.getUser()
    if (!userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const permsRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/permissions/current`, { headers: { cookie: req.headers.get('cookie') || '' } })
    const perms = permsRes.ok ? await permsRes.json() : { permissions: [] }
    if (!perms.permissions?.includes('batches.create')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const {
      institutions_id,
      institution_code,
      batch_year,
      batch_name,
      batch_code,
      start_date,
      end_date,
      status = true
    } = body as Record<string, unknown>

    if (!institution_code || !batch_name || !batch_code || !batch_year) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: 'institution_code, batch_name, batch_code and batch_year are required'
      }, { status: 400 })
    }

    // Foreign Key Auto-Mapping: Validate and fetch institutions_id from institution_code
    const supabase2 = getSupabaseServer()
    const { data: institutionData, error: institutionError } = await supabase2
      .from('institutions')
      .select('id')
      .eq('institution_code', String(institution_code))
      .single()

    if (institutionError || !institutionData) {
      return NextResponse.json({
        error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`
      }, { status: 400 })
    }

    const { data, error } = await supabase2.from('batch').insert({
      institutions_id: institutionData.id,  // Auto-mapped FK reference
      institution_code: String(institution_code),  // Human-readable code
      batch_year: Number(batch_year),
      batch_name: String(batch_name),
      batch_code: String(batch_code),
      start_date: start_date ? String(start_date) : null,
      end_date: end_date ? String(end_date) : null,
      status: Boolean(status),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('*').single()

    if (error) {
      console.error('Supabase error:', error)

      // Handle duplicate key constraint violation (23505)
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Batch already exists. Please use different values for batch code or institution.'
        }, { status: 400 })
      }

      // Handle foreign key constraint violation (23503)
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid reference. Please ensure the institution exists.'
        }, { status: 400 })
      }

      // Handle check constraint violation (23514)
      if (error.code === '23514') {
        return NextResponse.json({
          error: 'Invalid value. Please check your input.'
        }, { status: 400 })
      }

      // Handle not-null constraint violation (23502)
      if (error.code === '23502') {
        return NextResponse.json({
          error: 'Missing required field. Please fill in all required fields.'
        }, { status: 400 })
      }

      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({
      error: 'Failed to create batch',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
