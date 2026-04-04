-- Fix: api_permissions unique constraint with NULLS NOT DISTINCT
-- Problem: Default PostgreSQL behavior treats NULL != NULL in unique constraints,
-- so the ON CONFLICT clause in upserts fails to match rows with NULL institution_id.
-- Solution: Recreate the unique constraint with NULLS NOT DISTINCT.

-- Drop the old constraint
ALTER TABLE public.api_permissions
  DROP CONSTRAINT IF EXISTS api_permissions_unique;

-- Recreate with NULLS NOT DISTINCT (PostgreSQL 15+)
ALTER TABLE public.api_permissions
  ADD CONSTRAINT api_permissions_unique
  UNIQUE NULLS NOT DISTINCT (app_id, module, operation, institution_id);
