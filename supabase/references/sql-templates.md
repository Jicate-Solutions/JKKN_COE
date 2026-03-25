# SQL Templates

Complete SQL templates for all database objects in JKKN COE project.

## Table Creation Template

```sql
-- =====================================================
-- TABLE: table_name
-- Purpose: [Description of the table]
-- Created: YYYY-MM-DD
-- Multi-tenant: Yes/No
-- =====================================================

CREATE TABLE IF NOT EXISTS public.table_name (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant Fields (if applicable)
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code TEXT NOT NULL REFERENCES public.institutions(institution_code) ON DELETE CASCADE,

  -- Business Fields
  field_name TEXT NOT NULL,
  another_field INTEGER,
  optional_field TEXT NULL,

  -- Status/State Fields
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active',

  -- Audit Fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),

  -- Constraints
  CONSTRAINT table_name_unique_field UNIQUE (institution_id, field_name),
  CONSTRAINT table_name_check_status CHECK (status IN ('active', 'inactive', 'archived'))
) TABLESPACE pg_default;

-- Enable RLS
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_table_name_institution_id
ON public.table_name(institution_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_table_name_field_name
ON public.table_name(field_name) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_table_name_status
ON public.table_name(status) TABLESPACE pg_default
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_table_name_created_at
ON public.table_name(created_at DESC) TABLESPACE pg_default;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_table_name_institution_field
ON public.table_name(institution_id, field_name) TABLESPACE pg_default;

-- Create updated_at trigger
CREATE TRIGGER trigger_update_table_name_updated_at
BEFORE UPDATE ON public.table_name
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Add comments
COMMENT ON TABLE public.table_name IS 'Description of the table purpose and usage';
COMMENT ON COLUMN public.table_name.field_name IS 'Description of the field';
```

## Database Function Templates

### 1. Basic Query Function (STABLE, INVOKER)

```sql
-- =====================================================
-- FUNCTION: get_entity_by_code
-- Purpose: Retrieve entity information by code
-- Created: YYYY-MM-DD
-- Security: INVOKER (runs with caller permissions)
-- Volatility: STABLE (does not modify database)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_entity_by_code(
  p_entity_code TEXT,
  p_institution_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  entity_name TEXT,
  entity_code TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.entity_name,
    e.entity_code,
    e.status
  FROM public.entities e
  WHERE e.entity_code = p_entity_code
    AND (p_institution_id IS NULL OR e.institution_id = p_institution_id);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_entity_by_code TO authenticated;

COMMENT ON FUNCTION public.get_entity_by_code IS 'Retrieves entity information by code with optional institution filter';
```

### 2. Data Modification Function (VOLATILE, INVOKER)

```sql
-- =====================================================
-- FUNCTION: create_entity
-- Purpose: Create a new entity with validation
-- Created: YYYY-MM-DD
-- Security: INVOKER (runs with caller permissions)
-- Volatility: VOLATILE (modifies database)
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_entity(
  p_entity_name TEXT,
  p_entity_code TEXT,
  p_institution_id UUID,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_entity_id UUID;
BEGIN
  -- Validation
  IF p_entity_name IS NULL OR TRIM(p_entity_name) = '' THEN
    RAISE EXCEPTION 'Entity name cannot be empty';
  END IF;

  IF p_entity_code IS NULL OR TRIM(p_entity_code) = '' THEN
    RAISE EXCEPTION 'Entity code cannot be empty';
  END IF;

  -- Check for duplicates
  IF EXISTS (
    SELECT 1 FROM public.entities
    WHERE entity_code = p_entity_code
      AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Entity with code % already exists', p_entity_code;
  END IF;

  -- Insert entity
  INSERT INTO public.entities (
    entity_name,
    entity_code,
    institution_id,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    TRIM(p_entity_name),
    UPPER(TRIM(p_entity_code)),
    p_institution_id,
    p_created_by,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_entity_id;

  RETURN v_entity_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_entity TO authenticated;

COMMENT ON FUNCTION public.create_entity IS 'Creates a new entity with validation and duplicate checking';
```

### 3. Calculation Function (IMMUTABLE)

```sql
-- =====================================================
-- FUNCTION: calculate_gpa
-- Purpose: Calculate GPA from grade points
-- Created: YYYY-MM-DD
-- Security: INVOKER (runs with caller permissions)
-- Volatility: IMMUTABLE (pure function, same input = same output)
-- =====================================================

CREATE OR REPLACE FUNCTION public.calculate_gpa(
  p_grade_points NUMERIC[],
  p_credits NUMERIC[]
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total_points NUMERIC := 0;
  v_total_credits NUMERIC := 0;
  v_index INTEGER;
BEGIN
  -- Validate array lengths match
  IF array_length(p_grade_points, 1) != array_length(p_credits, 1) THEN
    RAISE EXCEPTION 'Grade points and credits arrays must have same length';
  END IF;

  -- Calculate weighted sum
  FOR v_index IN 1..array_length(p_grade_points, 1) LOOP
    v_total_points := v_total_points + (p_grade_points[v_index] * p_credits[v_index]);
    v_total_credits := v_total_credits + p_credits[v_index];
  END LOOP;

  -- Return GPA (or 0 if no credits)
  IF v_total_credits = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_total_points / v_total_credits, 2);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_gpa TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_gpa TO anon;

COMMENT ON FUNCTION public.calculate_gpa IS 'Calculates GPA from arrays of grade points and credits';
```

### 4. Trigger Function (VOLATILE, INVOKER)

```sql
-- =====================================================
-- FUNCTION: update_updated_at
-- Purpose: Automatically update updated_at timestamp
-- Created: YYYY-MM-DD
-- Security: INVOKER (runs with caller permissions)
-- Volatility: VOLATILE (modifies data)
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at IS 'Trigger function to automatically update updated_at timestamp';
```

### 5. Auth/Permission Function (SECURITY DEFINER)

```sql
-- =====================================================
-- FUNCTION: auth.has_institution_access
-- Purpose: Check if user has access to institution data
-- Created: YYYY-MM-DD
-- Security: DEFINER (runs with function owner permissions - REQUIRED for auth)
-- Volatility: STABLE (reads from database)
-- =====================================================

CREATE OR REPLACE FUNCTION auth.has_institution_access(
  p_institution_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_institution_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get user's institution from JWT
  SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  INTO v_user_institution_id;

  -- Check if user is admin
  SELECT (auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN
  INTO v_is_admin;

  -- Admins have access to all institutions
  IF v_is_admin = TRUE THEN
    RETURN TRUE;
  END IF;

  -- Regular users only have access to their own institution
  RETURN v_user_institution_id = p_institution_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION auth.has_institution_access TO authenticated;

COMMENT ON FUNCTION auth.has_institution_access IS 'Checks if authenticated user has access to specified institution (admin override)';
```

## View Templates

### Basic View

```sql
-- =====================================================
-- VIEW: entities_with_details
-- Purpose: Denormalized entity data with relationships
-- Created: YYYY-MM-DD
-- =====================================================

CREATE OR REPLACE VIEW public.entities_with_details AS
SELECT
  e.id,
  e.entity_code,
  e.entity_name,
  e.status,
  e.created_at,
  e.updated_at,
  -- Institution details
  e.institution_id,
  i.institution_code,
  i.institution_name,
  -- Creator details
  e.created_by,
  u.full_name AS created_by_name,
  u.email AS created_by_email
FROM public.entities e
LEFT JOIN public.institutions i ON e.institution_id = i.id
LEFT JOIN public.users u ON e.created_by = u.id
WHERE e.status = 'active';

COMMENT ON VIEW public.entities_with_details IS 'Denormalized view of active entities with related information';
```

### Materialized View (for performance)

```sql
-- =====================================================
-- MATERIALIZED VIEW: entity_statistics
-- Purpose: Pre-computed statistics for entities
-- Created: YYYY-MM-DD
-- Refresh: Daily via cron job
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.entity_statistics AS
SELECT
  institution_id,
  COUNT(*) AS total_entities,
  COUNT(*) FILTER (WHERE status = 'active') AS active_entities,
  COUNT(*) FILTER (WHERE status = 'inactive') AS inactive_entities,
  MAX(created_at) AS last_created_at,
  MAX(updated_at) AS last_updated_at
FROM public.entities
GROUP BY institution_id;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_statistics_institution
ON public.entity_statistics(institution_id);

COMMENT ON MATERIALIZED VIEW public.entity_statistics IS 'Pre-computed entity statistics by institution. Refresh daily.';

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION public.refresh_entity_statistics()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.entity_statistics;
END;
$$;
```

## Enum Type Templates

```sql
-- =====================================================
-- ENUM: entity_status
-- Purpose: Valid status values for entities
-- Created: YYYY-MM-DD
-- =====================================================

DO $$ BEGIN
  CREATE TYPE entity_status AS ENUM ('active', 'inactive', 'archived', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE entity_status IS 'Valid status values for entity records';
```

## Composite Type Templates

```sql
-- =====================================================
-- TYPE: address_type
-- Purpose: Structured address information
-- Created: YYYY-MM-DD
-- =====================================================

DO $$ BEGIN
  CREATE TYPE address_type AS (
    street TEXT,
    taluk TEXT,
    district TEXT,
    state TEXT,
    pin_code TEXT,
    country TEXT
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE address_type IS 'Composite type for structured address data';
```

## Best Practices

### Security
1. **Default to SECURITY INVOKER** - Only use DEFINER for auth functions
2. **Always set search_path = ''** - Prevents schema hijacking
3. **Use fully qualified names** - `public.table_name` not `table_name`
4. **Grant minimum permissions** - Only to roles that need them

### Performance
1. **Choose correct volatility** - IMMUTABLE > STABLE > VOLATILE
2. **Create indexes** - On all foreign keys and filter columns
3. **Use partial indexes** - For common WHERE clauses
4. **Add composite indexes** - For multi-column queries

### Maintainability
1. **Add dated comments** - Explain what changed and why
2. **Use consistent naming** - Follow PostgreSQL conventions
3. **Document functions** - Use COMMENT ON statements
4. **Version your changes** - Track in SQL_FILE_INDEX.md

### Data Integrity
1. **Use CHECK constraints** - Validate at database level
2. **Use NOT NULL** - Be explicit about required fields
3. **Use UNIQUE constraints** - Prevent duplicates
4. **Use foreign keys** - Ensure referential integrity

## Common Patterns

### Soft Delete Pattern

```sql
-- Add deleted_at column
ALTER TABLE public.entities
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Create index for active records
CREATE INDEX IF NOT EXISTS idx_entities_active
ON public.entities(id)
WHERE deleted_at IS NULL;

-- Soft delete function
CREATE OR REPLACE FUNCTION public.soft_delete_entity(p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
AS $$
BEGIN
  UPDATE public.entities
  SET deleted_at = NOW(),
      status = 'deleted'
  WHERE id = p_entity_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$;
```

### Audit Trail Pattern

```sql
-- Create audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), OLD.updated_by);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), NEW.created_by);
    RETURN NEW;
  END IF;
END;
$$;
```

---

**Remember**: Always test functions with different user roles and permissions before deploying to production.
