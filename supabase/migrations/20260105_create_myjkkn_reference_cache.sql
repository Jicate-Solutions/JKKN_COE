-- Create myjkkn_reference_cache table
-- This table caches MyJKKN entity data locally for quick lookup
-- when COE tables store MyJKKN UUIDs as foreign references

-- Entity types that can be cached
create type myjkkn_entity_type as enum (
  'program',
  'semester',
  'regulation',
  'batch',
  'learner_profile',
  'staff',
  'department',
  'institution'
);

-- Main cache table
create table if not exists public.myjkkn_reference_cache (
  id uuid not null default gen_random_uuid(),
  myjkkn_id uuid not null,                    -- The UUID from MyJKKN API
  entity_type myjkkn_entity_type not null,     -- Type of entity
  entity_code text null,                       -- Code (program_code, regulation_code, etc.)
  entity_name text null,                       -- Name field for display
  entity_data jsonb not null default '{}'::jsonb,  -- Full entity data from MyJKKN API
  institution_id uuid null,                    -- MyJKKN institution_id for filtering
  is_active boolean not null default true,
  last_synced_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint myjkkn_reference_cache_pkey primary key (id),
  constraint myjkkn_reference_cache_unique unique (myjkkn_id, entity_type)
) tablespace pg_default;

-- Indexes for performance
create index if not exists idx_myjkkn_cache_myjkkn_id on public.myjkkn_reference_cache using btree (myjkkn_id) tablespace pg_default;
create index if not exists idx_myjkkn_cache_entity_type on public.myjkkn_reference_cache using btree (entity_type) tablespace pg_default;
create index if not exists idx_myjkkn_cache_entity_code on public.myjkkn_reference_cache using btree (entity_code) tablespace pg_default where entity_code is not null;
create index if not exists idx_myjkkn_cache_institution_id on public.myjkkn_reference_cache using btree (institution_id) tablespace pg_default where institution_id is not null;
create index if not exists idx_myjkkn_cache_type_active on public.myjkkn_reference_cache using btree (entity_type, is_active) tablespace pg_default;
create index if not exists idx_myjkkn_cache_last_synced on public.myjkkn_reference_cache using btree (last_synced_at desc) tablespace pg_default;

-- GIN index for JSONB entity_data queries
create index if not exists idx_myjkkn_cache_entity_data on public.myjkkn_reference_cache using gin (entity_data) tablespace pg_default;

-- Function to update updated_at timestamp
create or replace function update_myjkkn_cache_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Trigger for updated_at
drop trigger if exists trigger_myjkkn_cache_updated_at on public.myjkkn_reference_cache;
create trigger trigger_myjkkn_cache_updated_at
  before update on public.myjkkn_reference_cache
  for each row
  execute function update_myjkkn_cache_updated_at();

-- Function to upsert a cached entity
create or replace function upsert_myjkkn_cache(
  p_myjkkn_id uuid,
  p_entity_type myjkkn_entity_type,
  p_entity_code text,
  p_entity_name text,
  p_entity_data jsonb,
  p_institution_id uuid default null,
  p_is_active boolean default true
)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into public.myjkkn_reference_cache (
    myjkkn_id,
    entity_type,
    entity_code,
    entity_name,
    entity_data,
    institution_id,
    is_active,
    last_synced_at
  ) values (
    p_myjkkn_id,
    p_entity_type,
    p_entity_code,
    p_entity_name,
    p_entity_data,
    p_institution_id,
    p_is_active,
    timezone('utc'::text, now())
  )
  on conflict (myjkkn_id, entity_type)
  do update set
    entity_code = excluded.entity_code,
    entity_name = excluded.entity_name,
    entity_data = excluded.entity_data,
    institution_id = excluded.institution_id,
    is_active = excluded.is_active,
    last_synced_at = timezone('utc'::text, now())
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql;

-- Function to get cached entity by MyJKKN ID
create or replace function get_myjkkn_cached_entity(
  p_myjkkn_id uuid,
  p_entity_type myjkkn_entity_type
)
returns jsonb as $$
declare
  v_data jsonb;
begin
  select entity_data into v_data
  from public.myjkkn_reference_cache
  where myjkkn_id = p_myjkkn_id
    and entity_type = p_entity_type
    and is_active = true;

  return v_data;
end;
$$ language plpgsql;

-- Function to bulk get cached entities
create or replace function get_myjkkn_cached_entities(
  p_myjkkn_ids uuid[],
  p_entity_type myjkkn_entity_type
)
returns table (
  myjkkn_id uuid,
  entity_code text,
  entity_name text,
  entity_data jsonb
) as $$
begin
  return query
  select
    c.myjkkn_id,
    c.entity_code,
    c.entity_name,
    c.entity_data
  from public.myjkkn_reference_cache c
  where c.myjkkn_id = any(p_myjkkn_ids)
    and c.entity_type = p_entity_type
    and c.is_active = true;
end;
$$ language plpgsql;

-- Comment on table
comment on table public.myjkkn_reference_cache is 'Cache for MyJKKN API entities referenced by COE tables';
