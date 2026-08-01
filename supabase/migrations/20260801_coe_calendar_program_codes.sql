-- =============================================================================
-- COE Calendar — per-programme targeting
-- =============================================================================
-- Run in the Supabase SQL Editor AFTER 20260801_coe_calendar_categories_and_visibility.sql.
-- Idempotent — safe to re-run.
--
-- programme_type (UG/PG/BOTH) stays as the broad level filter. This adds an
-- optional narrowing to specific programmes from the `programs` master:
--   NULL  = applies to every programme in the institution (the common case)
--   {...} = applies only to the listed programme codes
-- =============================================================================

begin;

alter table public.coe_calendar
	add column if not exists program_codes text[] null;

comment on column public.coe_calendar.program_codes is
	'Programme codes from programs.program_code that this event applies to. NULL = all programmes in the institution.';

-- An empty array would be ambiguous with NULL — both would read as "no
-- programmes selected" while meaning opposite things. Forbid it outright.
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'coe_calendar_program_codes_check'
	) then
		alter table public.coe_calendar
			add constraint coe_calendar_program_codes_check
			check (program_codes is null or array_length(program_codes, 1) >= 1);
	end if;
end $$;

create index if not exists idx_coe_calendar_program_codes
	on public.coe_calendar using gin (program_codes);

-- -----------------------------------------------------------------------------
-- Referential validation
-- -----------------------------------------------------------------------------
-- Postgres cannot put a foreign key on array elements, so a trigger stands in.
-- Codes are checked against the programmes of the event's OWN institution —
-- `programs` is unique on (institution_code, program_code), so a bare code is
-- only meaningful within one institution.
--
-- Matching is case-insensitive but the stored value is left as written; the
-- API canonicalises to the master's casing before it reaches here.

create or replace function public.fn_coe_calendar_validate_programs()
returns trigger
language plpgsql
as $$
declare
	unknown_codes text[];
begin
	if new.program_codes is null then
		return new;
	end if;

	select array_agg(c)
	  into unknown_codes
	from unnest(new.program_codes) as c
	where not exists (
		select 1
		from public.programs p
		where p.institutions_id = new.institutions_id
		  and upper(p.program_code) = upper(c)
	);

	if unknown_codes is not null then
		raise exception 'Unknown programme code(s) for this institution: %',
			array_to_string(unknown_codes, ', ')
			using errcode = '23514';
	end if;

	return new;
end;
$$;

drop trigger if exists trg_coe_calendar_validate_programs on public.coe_calendar;
create trigger trg_coe_calendar_validate_programs
	before insert or update of program_codes, institutions_id on public.coe_calendar
	for each row execute function public.fn_coe_calendar_validate_programs();

commit;

-- =============================================================================
-- Verification
-- =============================================================================
-- select event_title, programme_type, program_codes
--   from coe_calendar order by event_start_date limit 20;
--
-- select institution_code, program_code, program_name
--   from programs where is_active order by institution_code, program_code;
-- =============================================================================
