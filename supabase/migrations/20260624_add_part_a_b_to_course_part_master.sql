-- Allow 'Part A' and 'Part B' in courses.course_part_master
-- Recreate the check constraint to include the two new part values.

alter table public.courses
  drop constraint if exists course_course_part_master_check;

alter table public.courses
  add constraint course_course_part_master_check check (
    (
      (course_part_master)::text = any (
        (
          array[
            'Part I'::character varying,
            'Part II'::character varying,
            'Part III'::character varying,
            'Part IV'::character varying,
            'Part V'::character varying,
            'Part A'::character varying,
            'Part B'::character varying
          ]
        )::text[]
      )
    )
  );
