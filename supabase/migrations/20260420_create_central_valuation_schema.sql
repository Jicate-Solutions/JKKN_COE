-- =====================================================
-- CENTRAL VALUATION SCHEMA
-- Created: 2026-04-20
-- Description: Tables for Central Valuation date windows, course dates,
--              examiner columns on answer_sheet_packets, and email log.
-- =====================================================

-- 1. board_valuation_windows --------------------------------------------------
create table if not exists public.board_valuation_windows (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  board_code varchar(20) not null,
  board_name varchar(100) null,
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  constraint board_valuation_windows_unique unique (institutions_id, examination_session_id, board_code),
  constraint board_valuation_windows_date_order check (to_date >= from_date)
);

create index if not exists idx_bvw_session on public.board_valuation_windows (examination_session_id);
create index if not exists idx_bvw_institution on public.board_valuation_windows (institutions_id);

-- 2. course_valuation_dates ---------------------------------------------------
create table if not exists public.course_valuation_dates (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  board_code varchar(20) not null,
  valuation_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  constraint course_valuation_dates_unique unique (institutions_id, examination_session_id, course_id)
);

create index if not exists idx_cvd_session on public.course_valuation_dates (examination_session_id);
create index if not exists idx_cvd_board on public.course_valuation_dates (board_code);

-- 3. Extend answer_sheet_packets with examiner columns (denormalized snapshot
--    of staff fields to avoid MyJKKN roundtrips on reads; mirrors the pattern
--    used in public.exam_timetable_examiners) -----------------------
alter table public.answer_sheet_packets
  add column if not exists internal_examiner_staff_id varchar(50) null,
  add column if not exists internal_examiner_name varchar(200) null,
  add column if not exists internal_examiner_mobile varchar(30) null,
  add column if not exists internal_examiner_designation varchar(100) null,
  add column if not exists internal_examiner_email varchar(200) null,
  add column if not exists external_examiner_id uuid null,
  add column if not exists chief_examiner_staff_id varchar(50) null,
  add column if not exists chief_examiner_name varchar(200) null,
  add column if not exists chief_examiner_mobile varchar(30) null,
  add column if not exists chief_examiner_designation varchar(100) null,
  add column if not exists chief_examiner_email varchar(200) null,
  add column if not exists assistant_examiner_staff_id varchar(50) null,
  add column if not exists assistant_examiner_name varchar(200) null,
  add column if not exists assistant_examiner_mobile varchar(30) null,
  add column if not exists assistant_examiner_designation varchar(100) null,
  add column if not exists assistant_examiner_email varchar(200) null,
  add column if not exists valuation_allotted_at timestamptz null,
  add column if not exists valuation_allotted_by uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_internal_xor_external'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_internal_xor_external
      check (
        internal_examiner_staff_id is null
        or external_examiner_id is null
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_external_examiner_fk'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_external_examiner_fk
      foreign key (external_examiner_id) references public.examiners(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_valuation_allotted_by_fk'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_valuation_allotted_by_fk
      foreign key (valuation_allotted_by) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_asp_internal_examiner on public.answer_sheet_packets (internal_examiner_staff_id);
create index if not exists idx_asp_external_examiner on public.answer_sheet_packets (external_examiner_id);
create index if not exists idx_asp_chief_examiner on public.answer_sheet_packets (chief_examiner_staff_id);
create index if not exists idx_asp_assistant_examiner on public.answer_sheet_packets (assistant_examiner_staff_id);

-- 4. central_valuation_email_log ---------------------------------------------
create table if not exists public.central_valuation_email_log (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  examiner_type varchar(20) not null check (examiner_type in ('internal','external','chief','assistant')),
  examiner_key varchar(100) not null,
  examiner_name varchar(200) null,
  email_to varchar(200) not null,
  subject text null,
  status varchar(20) not null default 'PENDING' check (status in ('SENT','FAILED','PENDING')),
  error_message text null,
  sent_at timestamptz not null default now(),
  sent_by uuid null references public.users(id) on delete set null
);

create index if not exists idx_cvel_session on public.central_valuation_email_log (examination_session_id);
create index if not exists idx_cvel_examiner on public.central_valuation_email_log (examiner_type, examiner_key);
