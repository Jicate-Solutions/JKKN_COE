-- =============================================================================
-- COE Calendar — make categories FULLY institution-scoped
-- =============================================================================
-- Run in the Supabase SQL Editor. Transactional; safe to re-run (idempotent).
--
-- Before: categories could be global (institutions_id NULL) and `code` was
--         globally unique. coe_calendar.exam_category was an FK to
--         categories.code (single column).
--
-- After:  every category belongs to exactly one institution. `code` is unique
--         PER institution, so each institution owns its own CIA_I, SEMESTER…
--         An event's category must belong to the SAME institution, enforced by
--         a composite FK (institutions_id, exam_category) -> (institutions_id, code).
--
-- Steps:
--   1. Drop the single-column FK and the global unique(code)
--   2. Drop the accidental duplicate 'MODE_EXAM' (typo of MODEL_EXAM) if unused
--   3. Fan every existing GLOBAL category out to one copy per institution
--   4. Delete the now-replaced global rows
--   5. unique(institutions_id, code) + institutions_id NOT NULL
--   6. Composite FK so an event's category is same-institution
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Remove the constraints that assume a global code
-- -----------------------------------------------------------------------------
alter table public.coe_calendar
	drop constraint if exists coe_calendar_exam_category_fkey;

alter table public.coe_calendar_categories
	drop constraint if exists coe_calendar_categories_code_key;

-- -----------------------------------------------------------------------------
-- 2. Drop the junk 'MODE_EXAM' row (only if no event references it), so it is
--    not fanned out to every institution.
-- -----------------------------------------------------------------------------
delete from public.coe_calendar_categories cc
 where cc.code = 'MODE_EXAM'
   and not exists (
       select 1 from public.coe_calendar c where c.exam_category = cc.code
   );

-- -----------------------------------------------------------------------------
-- 3. Fan out globals: one copy of each global category per institution.
--    The BEFORE-INSERT trigger fills myjkkn_institution_ids from institutions.
--    Guarded against re-run: skips a (institution, code) pair that already exists.
-- -----------------------------------------------------------------------------
insert into public.coe_calendar_categories
	(code, label, description, color_code, bg_class, text_class, icon_name,
	 default_visible_to_roles, sort_order, institutions_id, is_active)
select g.code, g.label, g.description, g.color_code, g.bg_class, g.text_class, g.icon_name,
       g.default_visible_to_roles, g.sort_order, inst.id, g.is_active
  from public.coe_calendar_categories g
  cross join public.institutions inst
 where g.institutions_id is null
   and not exists (
       select 1 from public.coe_calendar_categories x
        where x.institutions_id = inst.id and x.code = g.code
   );

-- -----------------------------------------------------------------------------
-- 4. Remove the global rows now that per-institution copies exist.
-- -----------------------------------------------------------------------------
delete from public.coe_calendar_categories
 where institutions_id is null;

-- -----------------------------------------------------------------------------
-- 5. Per-institution uniqueness + institutions_id required
-- -----------------------------------------------------------------------------
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'coe_calendar_categories_institution_code_key'
	) then
		alter table public.coe_calendar_categories
			add constraint coe_calendar_categories_institution_code_key
			unique (institutions_id, code);
	end if;
end $$;

alter table public.coe_calendar_categories
	alter column institutions_id set not null;

comment on column public.coe_calendar_categories.institutions_id is
	'Owning institution — every category belongs to exactly one (no globals).';

-- -----------------------------------------------------------------------------
-- 6. Composite FK: an event's category must belong to the event's institution.
--    NOT VALID first so a stray existing row names itself at VALIDATE rather
--    than aborting the whole migration.
-- -----------------------------------------------------------------------------
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'coe_calendar_exam_category_institution_fkey'
	) then
		alter table public.coe_calendar
			add constraint coe_calendar_exam_category_institution_fkey
			foreign key (institutions_id, exam_category)
			references public.coe_calendar_categories (institutions_id, code)
			on update cascade
			not valid;
	end if;
end $$;

alter table public.coe_calendar
	validate constraint coe_calendar_exam_category_institution_fkey;

commit;

-- =============================================================================
-- Verification
-- =============================================================================
-- Every category now has an institution, none NULL:
--   select count(*) filter (where institutions_id is null) as globals_left,
--          count(*) as total
--     from coe_calendar_categories;
--
-- Same code appears once per institution:
--   select code, count(*) as per_code
--     from coe_calendar_categories group by code order by code;
--
-- Every event's category resolves within its institution (should be 0 rows):
--   select c.id, c.institutions_id, c.exam_category
--     from coe_calendar c
--     left join coe_calendar_categories cc
--       on cc.institutions_id = c.institutions_id and cc.code = c.exam_category
--    where cc.id is null;
-- =============================================================================
