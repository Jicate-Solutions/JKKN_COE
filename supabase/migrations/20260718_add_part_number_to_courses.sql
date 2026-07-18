-- Add nullable part_number to courses.
-- Used mainly with 'Part B' to distinguish sub-parts (1..10). Null for other parts.

alter table public.courses
  add column if not exists part_number integer;

alter table public.courses
  drop constraint if exists courses_part_number_check;

alter table public.courses
  add constraint courses_part_number_check check (
    part_number is null or (part_number between 1 and 10)
  );

comment on column public.courses.part_number is 'Optional sub-part number (1-10), used with Part B. Null otherwise.';
