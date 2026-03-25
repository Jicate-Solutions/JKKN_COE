-- Academic years table already exists in the database
-- This migration file documents the existing schema

-- Table structure:
-- create table public.academic_years (
--   id uuid not null default gen_random_uuid (),
--   academic_year text not null,
--   start_date date not null,
--   end_date date not null,
--   is_current_academic_year boolean null default true,
--   remarks text null,
--   created_at timestamp with time zone null default now(),
--   updated_at timestamp with time zone null default now(),
--   institutions_id uuid null,
--   institution_code character varying not null,
--   constraint academic_year_pkey primary key (id),
--   constraint academic_years_institutions_id_fkey foreign KEY (institutions_id) references institutions (id)
-- ) TABLESPACE pg_default;

-- Existing indexes:
-- idx_academic_year_active
-- idx_academic_year_date_range
-- idx_academic_year_current
-- idx_academic_year_start_date
-- idx_academic_year_name_lower
-- idx_academic_year_active_dates

-- Existing triggers:
-- trg_academic_year_updated (calls update_academic_year_timestamp)
-- trg_validate_academic_year (calls validate_academic_year_dates)

-- No migration needed - table already exists
SELECT 'Academic years table already exists' AS status;
