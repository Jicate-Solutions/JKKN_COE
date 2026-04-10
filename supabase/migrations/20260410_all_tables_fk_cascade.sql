-- ============================================================
-- Migration: Convert ALL blocking FK constraints to CASCADE / SET NULL
-- Scope: Every table in public schema (including auth.users references)
-- Applied: 2026-04-10
--
-- Strategy:
--   CASCADE  - data hierarchy FKs (child records deleted with parent)
--   SET NULL - audit columns (created_by, updated_by, verified_by, etc.)
--
-- This replaces the older 20260410_courses_fk_cascade.sql which only
-- covered the courses table.
-- ============================================================

-- Part 1: Fix all FKs referencing public schema tables
DO $$
DECLARE
  r RECORD;
  new_action TEXT;
  changed INT := 0;
BEGIN
  FOR r IN
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS parent_table,
      ccu.column_name AS parent_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    IF r.column_name IN ('created_by', 'updated_by', 'verified_by', 'approved_by', 'rejected_by', 'locked_by', 'modified_by')
       OR (r.parent_table = 'users' AND r.column_name = 'faculty_id')
       OR (r.parent_table = 'faculty_coe' AND r.column_name IN ('created_by', 'updated_by'))
    THEN
      new_action := 'SET NULL';
    ELSE
      new_action := 'CASCADE';
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.table_schema, r.table_name, r.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE %s',
      r.table_schema, r.table_name, r.constraint_name,
      r.column_name,
      'public', r.parent_table, r.parent_column,
      new_action
    );

    changed := changed + 1;
    RAISE NOTICE '[%] %.% -> %.% changed to ON DELETE %',
      changed, r.table_name, r.column_name, r.parent_table, r.parent_column, new_action;
  END LOOP;

  RAISE NOTICE 'Part 1 complete: % public FK constraints updated', changed;
END $$;

-- Part 2: Fix all FKs referencing auth.users (audit columns)
DO $$
DECLARE
  r RECORD;
  changed INT := 0;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text AS child_table,
      a.attname AS fk_column,
      af.attname AS parent_column,
      c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a', 'r')
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      r.child_table, r.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(%I) ON DELETE SET NULL',
      r.child_table, r.constraint_name, r.fk_column, r.parent_column
    );

    changed := changed + 1;
    RAISE NOTICE '[%] %.% -> auth.users.% changed to SET NULL',
      changed, r.child_table, r.fk_column, r.parent_column;
  END LOOP;

  RAISE NOTICE 'Part 2 complete: % auth.users FK constraints updated', changed;
END $$;
