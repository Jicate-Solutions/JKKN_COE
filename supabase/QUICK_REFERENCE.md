# Supabase Quick Reference Card

## 🚨 Emergency Commands

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'your_table'
);

-- Check RLS status
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- List all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Show table structure
\d public.your_table

-- Check query performance
EXPLAIN ANALYZE SELECT * FROM public.your_table WHERE condition;
```

## 📋 Daily Workflows

### Creating a New Table (5 steps)

```sql
-- 1. Create table with RLS
CREATE TABLE public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- 2. Create indexes
CREATE INDEX idx_new_table_institution ON public.new_table(institution_id);
CREATE INDEX idx_new_table_name ON public.new_table(name);

-- 3. Create RLS policies (all 4)
CREATE POLICY "new_table_select" ON public.new_table
FOR SELECT TO authenticated
USING (institution_id = (SELECT auth.user_institution_id()));

CREATE POLICY "new_table_insert" ON public.new_table
FOR INSERT TO authenticated
WITH CHECK (institution_id = (SELECT auth.user_institution_id()));

CREATE POLICY "new_table_update" ON public.new_table
FOR UPDATE TO authenticated
USING (institution_id = (SELECT auth.user_institution_id()))
WITH CHECK (institution_id = (SELECT auth.user_institution_id()));

CREATE POLICY "new_table_delete" ON public.new_table
FOR DELETE TO authenticated
USING (institution_id = (SELECT auth.user_institution_id()));

-- 4. Create trigger
CREATE TRIGGER trigger_update_new_table_updated_at
BEFORE UPDATE ON public.new_table
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. Add comment
COMMENT ON TABLE public.new_table IS 'Description of table purpose';
```

### Adding a Column (3 steps)

```sql
-- 1. Add column
ALTER TABLE public.your_table ADD COLUMN new_column TEXT NULL;

-- 2. Add index (if needed for queries/policies)
CREATE INDEX idx_your_table_new_column ON public.your_table(new_column);

-- 3. Add comment
COMMENT ON COLUMN public.your_table.new_column IS 'Description of column';
```

### Creating a Function (Basic Pattern)

```sql
CREATE OR REPLACE FUNCTION public.function_name(p_param TEXT)
RETURNS return_type
LANGUAGE plpgsql
SECURITY INVOKER
STABLE  -- or VOLATILE or IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  -- Validation
  IF p_param IS NULL THEN
    RAISE EXCEPTION 'Parameter cannot be null';
  END IF;

  -- Logic
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.function_name TO authenticated;
```

## 🔑 Common RLS Patterns

### Institution-Based Access
```sql
-- SELECT
USING (institution_id = (SELECT auth.user_institution_id()))

-- INSERT
WITH CHECK (institution_id = (SELECT auth.user_institution_id()))

-- UPDATE
USING (institution_id = (SELECT auth.user_institution_id()))
WITH CHECK (institution_id = (SELECT auth.user_institution_id()))

-- DELETE
USING (institution_id = (SELECT auth.user_institution_id()))
```

### User-Owned Records
```sql
-- SELECT/UPDATE/DELETE
USING (user_id = (SELECT auth.uid()))

-- INSERT
WITH CHECK (user_id = (SELECT auth.uid()))
```

### Admin Override
```sql
-- SELECT (admins see all, users see their institution)
USING (
  (SELECT auth.is_admin()) = TRUE
  OR institution_id = (SELECT auth.user_institution_id())
)
```

## 🎯 Index Patterns

```sql
-- Basic index
CREATE INDEX idx_table_column ON public.table(column);

-- Composite index (order matters!)
CREATE INDEX idx_table_col1_col2 ON public.table(col1, col2);

-- Partial index (filtered)
CREATE INDEX idx_table_active ON public.table(id)
WHERE status = 'active';

-- Unique index
CREATE UNIQUE INDEX idx_table_unique ON public.table(institution_id, code);

-- Expression index
CREATE INDEX idx_table_lower_email ON public.table(LOWER(email));
```

## 📊 Essential Queries

### Check Table Info
```sql
-- Columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;

-- Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'your_table';

-- Foreign Keys
SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'your_table';

-- Policies
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'your_table';

-- Triggers
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'your_table';
```

### Check Data
```sql
-- Row count
SELECT COUNT(*) FROM public.your_table;

-- Status distribution
SELECT status, COUNT(*) FROM public.your_table GROUP BY status;

-- Recent records
SELECT * FROM public.your_table ORDER BY created_at DESC LIMIT 10;

-- Find duplicates
SELECT column, COUNT(*) FROM public.your_table
GROUP BY column HAVING COUNT(*) > 1;
```

## 🔧 Troubleshooting

### RLS Not Working
```sql
-- 1. Check if enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'your_table';

-- 2. Enable if needed
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;

-- 3. Check policies exist
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- 4. Test policy (simulate user)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "user-id", "app_metadata": {"institution_id": "inst-id"}}';
SELECT * FROM public.your_table;
RESET ROLE;
```

### Slow Queries
```sql
-- 1. Check query plan
EXPLAIN ANALYZE SELECT * FROM public.your_table WHERE condition;

-- 2. Check if indexes exist
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'your_table';

-- 3. Create missing indexes
CREATE INDEX idx_your_table_condition_column ON public.your_table(condition_column);

-- 4. Analyze table statistics
ANALYZE public.your_table;
```

### Foreign Key Errors
```sql
-- Check referenced record exists
SELECT * FROM public.referenced_table WHERE id = 'value';

-- Check all foreign keys on table
SELECT * FROM information_schema.table_constraints
WHERE table_name = 'your_table' AND constraint_type = 'FOREIGN KEY';

-- Temporarily disable trigger (use carefully!)
ALTER TABLE public.your_table DISABLE TRIGGER ALL;
-- ... make changes ...
ALTER TABLE public.your_table ENABLE TRIGGER ALL;
```

## 🎨 TypeScript Type Generation

```typescript
// From database table to TypeScript type
export interface EntityType {
  id: string                    // UUID
  institution_id: string        // UUID
  institution_code: string      // TEXT
  name: string                  // TEXT NOT NULL
  status: 'active' | 'inactive' // ENUM or CHECK constraint
  created_at: string            // TIMESTAMPTZ
  updated_at: string            // TIMESTAMPTZ
  created_by?: string           // UUID (nullable)
}

// For insert operations (omit auto-generated fields)
export type EntityInsert = Omit<EntityType, 'id' | 'created_at' | 'updated_at'>

// For update operations (make all optional except id)
export type EntityUpdate = Partial<Omit<EntityType, 'id'>> & { id: string }
```

## 📱 Supabase Client Usage

```typescript
// Browser client (client-side)
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase.from('table').select('*')

// Server client (server-side)
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data, error } = await supabase.from('table').select('*')
```

## 🔐 Common Auth Helpers

```typescript
// Get current user
const { data: { user } } = await supabase.auth.getUser()

// Get user's institution
const institutionId = user?.app_metadata?.institution_id

// Check if admin
const isAdmin = user?.app_metadata?.is_admin === true

// Sign out
await supabase.auth.signOut()
```

## 📝 SQL File Comments Template

```sql
-- =====================================================
-- TABLE/FUNCTION/POLICY: name_here
-- Purpose: Brief description
-- Created: YYYY-MM-DD
-- Updated: YYYY-MM-DD - Added column X for feature Y
-- =====================================================
```

## 🚀 Performance Tips

1. **Indexes**: Create indexes on ALL columns used in:
   - WHERE clauses
   - JOIN conditions
   - ORDER BY clauses
   - RLS policy conditions

2. **RLS Functions**: Wrap in SELECT and mark as STABLE
   ```sql
   CREATE FUNCTION auth.user_institution_id()
   RETURNS UUID
   LANGUAGE sql
   SECURITY DEFINER
   STABLE  -- Important for caching!
   AS $$ SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID; $$;
   ```

3. **Composite Indexes**: Order matters! Put most selective column first
   ```sql
   -- Good: institution is selective
   CREATE INDEX idx ON table(institution_id, status);

   -- Bad: status is not selective
   CREATE INDEX idx ON table(status, institution_id);
   ```

4. **Partial Indexes**: For common filters
   ```sql
   CREATE INDEX idx ON table(id) WHERE status = 'active';
   ```

## 🔗 Quick Links

- [MASTER_GUIDE.md](./MASTER_GUIDE.md) - Complete guide
- [SQL_FILE_INDEX.md](./SQL_FILE_INDEX.md) - Database schema documentation
- [references/sql-templates.md](./references/sql-templates.md) - SQL templates
- [references/rls-policy-patterns.md](./references/rls-policy-patterns.md) - RLS patterns

---

**Print this page and keep it handy during development!**
