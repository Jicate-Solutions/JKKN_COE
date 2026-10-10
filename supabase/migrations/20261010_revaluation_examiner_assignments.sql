-- Let a revaluation be assigned to an examiner from the examiner panel.
--
-- `examiner_assignments` was designed for evaluators who are COE users and
-- programmes that are rows in the local `programs` table. Neither holds for
-- revaluation as the screen works:
--   • the Assignments tab picks an examiner from the `examiners` panel, not a
--     COE user, so `evaluator_id` (NOT NULL, references users) cannot be filled;
--   • programmes are mastered in MyJKKN — no course offering's `program_id`
--     is a row in `programs` — so the foreign key can never be satisfied.
-- As a result no revaluation assignment has ever been saved (the table is empty).
--
-- This adds `examiner_id` for panel examiners and relaxes the two constraints.
-- Existing behaviour for evaluator (COE user) assignments is unchanged.
-- Safe to run more than once. Run in the Supabase SQL Editor.

alter table public.examiner_assignments
	add column if not exists examiner_id uuid references public.examiners(id) on delete restrict;

alter table public.examiner_assignments alter column evaluator_id drop not null;

alter table public.examiner_assignments alter column program_id drop not null;
alter table public.examiner_assignments drop constraint if exists examiner_assignments_program_id_fkey;

-- Every assignment still names who it is assigned to: a COE user or a panel examiner.
alter table public.examiner_assignments drop constraint if exists examiner_assignments_evaluator_or_examiner;
alter table public.examiner_assignments
	add constraint examiner_assignments_evaluator_or_examiner
	check (evaluator_id is not null or examiner_id is not null);

create index if not exists idx_examiner_assignments_examiner_id
	on public.examiner_assignments (examiner_id)
	where examiner_id is not null;

-- One live examiner per revaluation application.
create unique index if not exists uq_examiner_assignments_live_revaluation
	on public.examiner_assignments (revaluation_registration_id)
	where assignment_type = 'revaluation' and is_active = true and assignment_status <> 'Cancelled';

comment on column public.examiner_assignments.examiner_id is
	'Examiner from the examiner panel (examiners.id). Set for revaluation assignments; evaluator_id is used when the evaluator is a COE user.';
