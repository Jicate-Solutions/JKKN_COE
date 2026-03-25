-- Create learners_profiles table
-- Fallback for MyJKKN /api-management/learners/profiles endpoint

create table if not exists public.learners_profiles (
  id uuid not null default gen_random_uuid (),
  application_id text null,
  migrated_at timestamp with time zone null,
  migration_source text null,
  lifecycle_status text not null,
  first_name text not null,
  last_name text null default ''::text,
  date_of_birth text not null,
  gender text not null,
  religion text not null,
  community text not null,
  caste text null,
  father_name text not null,
  father_occupation text null,
  father_mobile text not null,
  mother_name text not null,
  mother_occupation text null,
  mother_mobile text not null,
  annual_income text null,
  last_school text not null,
  board_of_study text not null,
  tenth_marks jsonb not null,
  twelfth_marks jsonb not null,
  medical_cutoff_marks text null,
  engineering_cutoff_marks text null,
  neet_roll_number text null,
  neet_score text null,
  counseling_applied boolean null default false,
  counseling_number text null,
  quota text null,
  category text null,
  entry_type text not null,
  student_mobile text not null,
  student_email text not null,
  permanent_address_street text not null,
  permanent_address_taluk text null,
  permanent_address_district text not null,
  permanent_address_pin_code text not null,
  permanent_address_state text not null,
  accommodation_type text not null,
  hostel_type text null,
  food_type text null,
  bus_required boolean null default false,
  bus_route text null,
  bus_pickup_location text null,
  reference_type text null,
  reference_name text null,
  reference_contact text null,
  institution_id uuid null,
  degree_id uuid null,
  department_id uuid null,
  program_id uuid null,
  semester_id uuid null,
  section_id uuid null,
  academic_year_id uuid null,
  regulation_id uuid null,
  batch_id uuid null,
  roll_number text null,
  register_number text null,
  college_email text null,
  student_photo_url text null,
  is_profile_complete boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  created_by uuid null,
  updated_by uuid null,
  aadhar_number text null,
  enquiry_date date null default CURRENT_DATE,
  blood_group text null,
  admission_year integer null,
  scholarship_type text null,
  constraint learners_profiles_pkey primary key (id),
  constraint learners_profiles_application_id_key unique (application_id),
  constraint learners_profiles_college_email_unique unique (college_email)
) TABLESPACE pg_default;

-- Create indexes for performance
create index if not exists idx_learners_profiles_admission_year on public.learners_profiles using btree (admission_year) TABLESPACE pg_default
where (admission_year is not null);

create index if not exists idx_learners_profiles_enquiry_date on public.learners_profiles using btree (enquiry_date) TABLESPACE pg_default
where (enquiry_date is not null);

create index if not exists idx_learners_profiles_institution_id on public.learners_profiles using btree (institution_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_application_id on public.learners_profiles using btree (application_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_roll_number on public.learners_profiles using btree (roll_number) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_college_email on public.learners_profiles using btree (college_email) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_institution_department on public.learners_profiles using btree (institution_id, department_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_degree_id on public.learners_profiles using btree (degree_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_department_id on public.learners_profiles using btree (department_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_program_id on public.learners_profiles using btree (program_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_semester_id on public.learners_profiles using btree (semester_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_section_id on public.learners_profiles using btree (section_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_academic_year_id on public.learners_profiles using btree (academic_year_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_regulation_id on public.learners_profiles using btree (regulation_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_batch_id on public.learners_profiles using btree (batch_id) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_profile_complete on public.learners_profiles using btree (is_profile_complete) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_migration_source on public.learners_profiles using btree (migration_source) TABLESPACE pg_default;

create index if not exists idx_learners_profiles_created_at on public.learners_profiles using btree (created_at desc) TABLESPACE pg_default;
