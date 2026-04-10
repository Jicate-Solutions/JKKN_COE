-- Migration: Change all RESTRICT FK constraints on courses(id) to CASCADE
-- This allows deleting a course to cascade-delete all related records
-- (marks, answer sheets, examiner assignments, etc.)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'courses'
      AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
  LOOP
    -- Drop the existing FK constraint
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.table_schema, r.table_name, r.constraint_name
    );
    -- Re-add with ON DELETE CASCADE
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.courses(id) ON DELETE CASCADE',
      r.table_schema, r.table_name, r.constraint_name, r.column_name
    );

    RAISE NOTICE 'Changed % on %.% to CASCADE', r.constraint_name, r.table_schema, r.table_name;
  END LOOP;
END $$;
