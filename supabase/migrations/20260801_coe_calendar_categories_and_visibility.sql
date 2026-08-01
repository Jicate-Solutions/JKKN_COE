-- =============================================================================
-- COE Calendar — category lookup, role-tag visibility, MyJKKN institution mirror
-- =============================================================================
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- What this does:
--   1. Shared role-tag helper functions (single source of truth for the 8 tags)
--   2. coe_calendar_categories lookup table + seed (replaces the hardcoded CHECK)
--   3. coe_calendar.visible_to_roles      — per-row audience tags
--   4. coe_calendar.myjkkn_institution_ids — mirrored from institutions
--   5. exam_category CHECK -> FK on coe_calendar_categories(code)
--   6. end >= start guard
--   7. Natural-key unique index so bulk import upserts instead of duplicating
--   8. Sync triggers so the mirrored columns can never drift
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Role tag vocabulary
-- -----------------------------------------------------------------------------
-- Kept in a function so the tag list lives in exactly one place. Both tables'
-- CHECK constraints call it; adding a tag later means editing this function
-- only (existing rows are not re-validated, which is what we want).

create or replace function public.coe_calendar_role_tags()
returns text[]
language sql
immutable
parallel safe
as $$
	select array[
		'ALL',
		'LEARNERS',
		'TEACHING',
		'NON_TEACHING',
		'ADMINISTRATIVE',
		'MANAGEMENT',
		'ACCOUNTS',
		'COE_OFFICE'
	]::text[]
$$;

create or replace function public.coe_calendar_valid_role_tags(tags text[])
returns boolean
language sql
immutable
parallel safe
as $$
	select tags is not null
		and array_length(tags, 1) >= 1
		-- every tag must be known: a typo would otherwise hide the row from
		-- everyone with no error at write time
		and tags <@ public.coe_calendar_role_tags()
		-- 'ALL' is meaningless combined with anything else
		and (not ('ALL' = any(tags)) or array_length(tags, 1) = 1)
$$;

-- -----------------------------------------------------------------------------
-- 2. Category lookup table
-- -----------------------------------------------------------------------------

create table if not exists public.coe_calendar_categories (
	id                        uuid        not null default gen_random_uuid(),
	code                      text        not null,
	label                     text        not null,
	description               text        null,
	color_code                text        not null default '#64748B',
	bg_class                  text        null,
	text_class                text        null,
	icon_name                 text        null,
	default_visible_to_roles  text[]      not null default array['ALL'],
	sort_order                integer     not null default 0,
	institutions_id           uuid        null,
	myjkkn_institution_ids    uuid[]      null,
	is_active                 boolean     not null default true,
	created_at                timestamptz not null default now(),
	updated_at                timestamptz not null default now(),
	constraint coe_calendar_categories_pkey primary key (id),
	constraint coe_calendar_categories_code_key unique (code),
	constraint coe_calendar_categories_institutions_id_fkey
		foreign key (institutions_id) references public.institutions (id) on delete cascade
);

-- institutions_id null = global category, available to every institution.
comment on column public.coe_calendar_categories.institutions_id is
	'NULL = global category shared by all institutions; set = owned by one institution';
comment on column public.coe_calendar_categories.myjkkn_institution_ids is
	'Mirrored from institutions.myjkkn_institution_ids by trigger. NULL for global categories.';

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'coe_calendar_categories_default_roles_check'
	) then
		alter table public.coe_calendar_categories
			add constraint coe_calendar_categories_default_roles_check
			check (public.coe_calendar_valid_role_tags(default_visible_to_roles));
	end if;
end $$;

create index if not exists idx_coe_calendar_categories_active
	on public.coe_calendar_categories (is_active, sort_order);

create index if not exists idx_coe_calendar_categories_institution
	on public.coe_calendar_categories (institutions_id);

create index if not exists idx_coe_calendar_categories_myjkkn_ids
	on public.coe_calendar_categories using gin (myjkkn_institution_ids);

-- Seed: the 6 existing categories keep their exact current colours (lifted from
-- COE_CATEGORY_CONFIG in types/coe-calendar.ts) so nothing shifts visually.
-- FEES and COE_TASK are new — the real seed data has 4 fee/roll events crammed
-- into GENERAL, and COE-internal tasks had nowhere to live.
insert into public.coe_calendar_categories
	(code, label, description, color_code, bg_class, text_class, default_visible_to_roles, sort_order)
values
	('CIA_I',           'CIA-I',      'Continuous Internal Assessment I',  '#3B82F6', 'bg-blue-50 dark:bg-blue-500/10',     'text-blue-700 dark:text-blue-400',     array['ALL'], 10),
	('CIA_II',          'CIA-II',     'Continuous Internal Assessment II', '#F59E0B', 'bg-amber-50 dark:bg-amber-500/10',   'text-amber-700 dark:text-amber-400',   array['ALL'], 20),
	('MODEL_EXAM',      'Model Exam', 'Model Examination',                 '#A855F7', 'bg-purple-50 dark:bg-purple-500/10', 'text-purple-700 dark:text-purple-400', array['ALL'], 30),
	('PRACTICAL_EXAM',  'Practical',  'Practical Examination',             '#14B8A6', 'bg-teal-50 dark:bg-teal-500/10',     'text-teal-700 dark:text-teal-400',     array['ALL'], 40),
	('SEMESTER_THEORY', 'Semester',   'End Semester Theory Examination',   '#F43F5E', 'bg-rose-50 dark:bg-rose-500/10',     'text-rose-700 dark:text-rose-400',     array['ALL'], 50),
	('FEES',            'Fees',       'Examination fee milestones',        '#10B981', 'bg-emerald-50 dark:bg-emerald-500/10', 'text-emerald-700 dark:text-emerald-400', array['LEARNERS','ACCOUNTS','ADMINISTRATIVE'], 60),
	('COE_TASK',        'COE Task',   'COE office internal task',          '#6366F1', 'bg-indigo-50 dark:bg-indigo-500/10', 'text-indigo-700 dark:text-indigo-400',  array['COE_OFFICE'], 70),
	('GENERAL',         'General',    'General academic event',            '#94A3B8', 'bg-slate-50 dark:bg-slate-500/10',   'text-slate-600 dark:text-slate-400',   array['ALL'], 80)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 3. coe_calendar — new columns
-- -----------------------------------------------------------------------------

alter table public.coe_calendar
	add column if not exists visible_to_roles text[] not null default array['ALL'];

alter table public.coe_calendar
	add column if not exists myjkkn_institution_ids uuid[] null;

comment on column public.coe_calendar.visible_to_roles is
	'Audience tags. A consumer sees the row when its own tags overlap this array; ALL means everyone.';
comment on column public.coe_calendar.myjkkn_institution_ids is
	'Mirrored from institutions.myjkkn_institution_ids by trigger — do not write directly.';

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'coe_calendar_visible_to_roles_check'
	) then
		alter table public.coe_calendar
			add constraint coe_calendar_visible_to_roles_check
			check (public.coe_calendar_valid_role_tags(visible_to_roles));
	end if;
end $$;

create index if not exists idx_coe_calendar_visible_to_roles
	on public.coe_calendar using gin (visible_to_roles);

create index if not exists idx_coe_calendar_myjkkn_ids
	on public.coe_calendar using gin (myjkkn_institution_ids);

-- -----------------------------------------------------------------------------
-- 4. exam_category: CHECK -> FK on the lookup table
-- -----------------------------------------------------------------------------
-- Deliberately an FK on `code`, not a new category_id column: every existing row
-- keeps holding 'CIA_I' etc., so no application code has to change, but
-- categories become editable data instead of a CHECK that needs a migration.

alter table public.coe_calendar
	drop constraint if exists coe_calendar_exam_category_check;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'coe_calendar_exam_category_fkey'
	) then
		alter table public.coe_calendar
			add constraint coe_calendar_exam_category_fkey
			foreign key (exam_category)
			references public.coe_calendar_categories (code)
			on update cascade;
	end if;
end $$;

create index if not exists idx_coe_calendar_exam_category
	on public.coe_calendar (exam_category);

-- -----------------------------------------------------------------------------
-- 5. end >= start guard
-- -----------------------------------------------------------------------------
-- Added NOT VALID first so a pre-existing bad row does not abort the whole
-- migration. The VALIDATE below will name the offending row if there is one;
-- new and updated rows are guarded either way.

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'coe_calendar_end_after_start'
	) then
		alter table public.coe_calendar
			add constraint coe_calendar_end_after_start
			check (event_end_date >= event_start_date) not valid;
	end if;
end $$;

alter table public.coe_calendar validate constraint coe_calendar_end_after_start;

-- -----------------------------------------------------------------------------
-- 6. Natural-key unique index (makes bulk import upsert instead of duplicate)
-- -----------------------------------------------------------------------------
-- The old seed used ON CONFLICT DO NOTHING against no unique constraint, so it
-- was a no-op — re-running duplicated every row. Collapse existing duplicates
-- first (keeping the oldest), then create the index.

delete from public.coe_calendar c
using (
	select id,
	       row_number() over (
	         partition by institutions_id, academic_year, exam_category,
	                      event_title, event_start_date
	         order by created_at, id
	       ) as rn
	from public.coe_calendar
) dup
where c.id = dup.id and dup.rn > 1;

create unique index if not exists uq_coe_calendar_natural_key
	on public.coe_calendar (
		institutions_id, academic_year, exam_category, event_title, event_start_date
	);

-- -----------------------------------------------------------------------------
-- 7. Sync triggers — institutions is the source of truth
-- -----------------------------------------------------------------------------
-- Mirrored columns are filled on write and propagated on change, so they can
-- never drift from institutions. This also fixes the long-standing bug where
-- bulk-imported rows had institution_code = NULL (the importer never sent it).

create or replace function public.fn_coe_calendar_fill_institution()
returns trigger
language plpgsql
as $$
begin
	select i.myjkkn_institution_ids, i.institution_code
	  into new.myjkkn_institution_ids, new.institution_code
	from public.institutions i
	where i.id = new.institutions_id;
	return new;
end;
$$;

drop trigger if exists trg_coe_calendar_fill_institution on public.coe_calendar;
create trigger trg_coe_calendar_fill_institution
	before insert or update of institutions_id on public.coe_calendar
	for each row execute function public.fn_coe_calendar_fill_institution();

create or replace function public.fn_coe_calendar_categories_fill_institution()
returns trigger
language plpgsql
as $$
begin
	if new.institutions_id is null then
		new.myjkkn_institution_ids := null;
	else
		select i.myjkkn_institution_ids
		  into new.myjkkn_institution_ids
		from public.institutions i
		where i.id = new.institutions_id;
	end if;
	return new;
end;
$$;

drop trigger if exists trg_coe_calendar_categories_fill_institution
	on public.coe_calendar_categories;
create trigger trg_coe_calendar_categories_fill_institution
	before insert or update of institutions_id on public.coe_calendar_categories
	for each row execute function public.fn_coe_calendar_categories_fill_institution();

-- Propagate an institution remap to both tables.
create or replace function public.fn_sync_institution_to_coe_calendar()
returns trigger
language plpgsql
as $$
begin
	if new.myjkkn_institution_ids is distinct from old.myjkkn_institution_ids
		or new.institution_code is distinct from old.institution_code then

		update public.coe_calendar
		   set myjkkn_institution_ids = new.myjkkn_institution_ids,
		       institution_code       = new.institution_code
		 where institutions_id = new.id;

		update public.coe_calendar_categories
		   set myjkkn_institution_ids = new.myjkkn_institution_ids
		 where institutions_id = new.id;
	end if;
	return new;
end;
$$;

drop trigger if exists trg_institutions_sync_coe_calendar on public.institutions;
create trigger trg_institutions_sync_coe_calendar
	after update of myjkkn_institution_ids, institution_code on public.institutions
	for each row execute function public.fn_sync_institution_to_coe_calendar();

-- updated_at for the categories table (reuses the existing generic function).
drop trigger if exists trg_coe_calendar_categories_updated_at
	on public.coe_calendar_categories;
create trigger trg_coe_calendar_categories_updated_at
	before update on public.coe_calendar_categories
	for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 8. Backfill the mirrored columns for existing rows
-- -----------------------------------------------------------------------------

update public.coe_calendar c
   set myjkkn_institution_ids = i.myjkkn_institution_ids,
       institution_code       = i.institution_code
  from public.institutions i
 where i.id = c.institutions_id
   and (c.myjkkn_institution_ids is distinct from i.myjkkn_institution_ids
        or c.institution_code is distinct from i.institution_code);

update public.coe_calendar_categories cc
   set myjkkn_institution_ids = i.myjkkn_institution_ids
  from public.institutions i
 where i.id = cc.institutions_id
   and cc.myjkkn_institution_ids is distinct from i.myjkkn_institution_ids;

commit;

-- =============================================================================
-- Verification
-- =============================================================================
-- select code, label, color_code, default_visible_to_roles, sort_order
--   from coe_calendar_categories order by sort_order;
--
-- select exam_category, count(*), min(visible_to_roles::text)
--   from coe_calendar group by exam_category order by exam_category;
--
-- select count(*) filter (where myjkkn_institution_ids is null) as unmapped,
--        count(*) as total
--   from coe_calendar;
-- =============================================================================
