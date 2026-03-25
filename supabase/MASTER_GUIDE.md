# Supabase Master Guide - JKKN COE

Complete guide for all Supabase database operations in the JKKN COE project.

## 🚀 Quick Start

### For Creating a New Module
```bash
1. Query database: Check if tables already exist via Supabase Dashboard
2. Read references/module-creation-template.md
3. Update supabase/setup/01_tables.sql only
4. Add RLS policies to supabase/setup/03_policies.sql
5. Create TypeScript types in types/[module].ts
6. Update SQL_FILE_INDEX.md
```

### For Updating Existing Schema
```bash
1. Query database: Check current table structure via Supabase Dashboard
2. Create migration file in supabase/migrations/
3. Run migration: npx supabase migration up
4. Update setup SQL files to match reality
5. Update TypeScript types
6. Update SQL_FILE_INDEX.md
```

### For Debugging Issues
```bash
1. Query database: Check actual data and structure via Supabase Dashboard
2. Check RLS policies: SELECT * FROM pg_policies WHERE tablename = 'your_table'
3. Check indexes: SELECT * FROM pg_indexes WHERE tablename = 'your_table'
4. Test query performance: EXPLAIN ANALYZE your_query
5. Check foreign keys and constraints
```

## 📚 Reference Documents

All reference documents are in `supabase/references/`:

1. **[sql-templates.md](./references/sql-templates.md)** - Complete SQL templates for all objects
2. **[rls-policy-patterns.md](./references/rls-policy-patterns.md)** - RLS policy patterns with performance optimization
3. **[auth-ssr-patterns.md](./references/auth-ssr-patterns.md)** - Supabase Auth SSR implementation (Coming Soon)
4. **[edge-function-templates.md](./references/edge-function-templates.md)** - Edge function templates (Coming Soon)
5. **[module-creation-template.md](./references/module-creation-template.md)** - Step-by-step module creation (Coming Soon)

## 🔴 Critical Rules

### NEVER VIOLATE THESE

1. **Always Check Database First**
   - Use Supabase Dashboard to query real-time state
   - SQL files may be outdated - dashboard shows reality
   - Never rely on files alone

2. **File Management**
   - NEVER create duplicate SQL files
   - ALWAYS update existing files in `supabase/setup/`
   - ADD dated comments for all changes
   - UPDATE SQL_FILE_INDEX.md after changes

3. **RLS Policies**
   - ALWAYS wrap functions in SELECT: `(SELECT auth.uid())`
   - ALWAYS create indexes on policy columns
   - NEVER use `FOR ALL` - create 4 separate policies
   - ALWAYS specify `TO authenticated` or `TO anon`

4. **Database Functions**
   - DEFAULT to `SECURITY INVOKER`
   - ALWAYS set `search_path = ''`
   - USE fully qualified names: `public.table_name`
   - SPECIFY correct volatility: IMMUTABLE/STABLE/VOLATILE

5. **Authentication SSR**
   - NEVER use individual cookie methods: `get()`, `set()`, `remove()`
   - ALWAYS use: `getAll()` and `setAll()` only
   - Package: `@supabase/ssr` (not `@supabase/auth-helpers-nextjs`)

## 📁 Directory Structure

```
supabase/
├── setup/                      # Production schema (consolidated)
│   ├── 01_tables.sql          # All table definitions
│   ├── 02_functions.sql       # All database functions
│   ├── 03_policies.sql        # All RLS policies
│   ├── 04_triggers.sql        # All triggers
│   └── 05_views.sql           # All views
│
├── migrations/                 # Development history
│   └── YYYYMMDD_description.sql
│
├── functions/                  # Edge functions
│   └── function-name/
│       └── index.ts
│
├── references/                 # Templates and patterns
│   ├── sql-templates.md
│   ├── rls-policy-patterns.md
│   ├── auth-ssr-patterns.md
│   ├── edge-function-templates.md
│   └── module-creation-template.md
│
├── scripts/                    # Utility scripts
│   ├── validate_sql_files.py
│   └── check_index.py
│
├── assets/                     # Templates
│   ├── table-template.sql
│   └── migration-template.sql
│
├── SQL_FILE_INDEX.md          # Master index
└── MASTER_GUIDE.md            # This file
```

## 🎯 Common Workflows

### Workflow 1: Create New Module

See detailed guide: [references/module-creation-template.md](./references/module-creation-template.md)

**Steps:**
1. Query database to verify table doesn't exist
2. Design tables following MyJKKN conventions
3. Update `setup/01_tables.sql` only
4. Add RLS policies to `setup/03_policies.sql`
5. Create TypeScript types
6. Create service layer
7. Create React Query hooks
8. Update SQL_FILE_INDEX.md

### Workflow 2: Update Table Schema

**Steps:**
1. Query current table structure via Dashboard
2. Create migration: `YYYYMMDD_add_column_to_table.sql`
3. Apply migration: `npx supabase migration up`
4. Update `setup/01_tables.sql` to match database
5. Update TypeScript types
6. Update SQL_FILE_INDEX.md
7. Verify changes via Dashboard

### Workflow 3: Write RLS Policies

See patterns: [references/rls-policy-patterns.md](./references/rls-policy-patterns.md)

**Steps:**
1. Choose correct pattern (institution-based, user-owned, role-based, etc.)
2. Update `setup/03_policies.sql`
3. Create required indexes
4. Test with different user roles
5. Verify performance

### Workflow 4: Create Database Function

See templates: [references/sql-templates.md](./references/sql-templates.md)

**Steps:**
1. Choose security mode (INVOKER/DEFINER)
2. Choose volatility (IMMUTABLE/STABLE/VOLATILE)
3. Update `setup/02_functions.sql`
4. Grant appropriate permissions
5. Test function
6. Document in SQL_FILE_INDEX.md

### Workflow 5: Debug Database Issue

**Steps:**
1. Query real-time data via Dashboard
2. Check RLS policies: `SELECT * FROM pg_policies`
3. Verify indexes: `SELECT * FROM pg_indexes`
4. Test query performance: `EXPLAIN ANALYZE`
5. Check foreign keys and constraints
6. Verify user permissions

### Workflow 6: Set up Authentication

See patterns: [references/auth-ssr-patterns.md](./references/auth-ssr-patterns.md)

**Steps:**
1. Install `@supabase/ssr` package
2. Create browser client (`lib/supabase/client.ts`)
3. Create server client (`lib/supabase/server.ts`)
4. Update middleware (`middleware.ts`)
5. Test authentication flow

## 🗄️ Database Conventions

### Naming Conventions

```sql
-- Tables: lowercase, plural, snake_case
CREATE TABLE public.students (...);

-- Columns: lowercase, snake_case
first_name TEXT NOT NULL

-- Indexes: idx_[table]_[column]
CREATE INDEX idx_students_email ON public.students(email);

-- Triggers: trg_[table]_[action]
CREATE TRIGGER trg_students_updated_at ...

-- Functions: verb_noun (snake_case)
CREATE FUNCTION get_student_attendance(...);
```

### Multi-Tenant Pattern

```sql
CREATE TABLE public.entity_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant fields
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  institution_code TEXT NOT NULL REFERENCES public.institutions(institution_code),

  -- Business fields
  ...

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id)
);
```

### Standard Fields

Every table should have:
- `id` - UUID PRIMARY KEY
- `institution_id` - For multi-tenant (if applicable)
- `created_at` - TIMESTAMPTZ
- `updated_at` - TIMESTAMPTZ
- `created_by` - UUID reference to users
- `updated_by` - UUID reference to users (optional)
- `is_active` - BOOLEAN (if soft delete not used)
- `status` - TEXT (for state machine)

## 🔐 Security Best Practices

### 1. RLS Policies

```sql
-- ✅ GOOD: Wrapped in SELECT
USING (institution_id = (SELECT auth.user_institution_id()))

-- ❌ BAD: Not wrapped
USING (institution_id = auth.user_institution_id())  -- Will fail!
```

### 2. Database Functions

```sql
-- ✅ GOOD: SECURITY INVOKER (default)
CREATE FUNCTION public.get_data(...)
SECURITY INVOKER
SET search_path = ''

-- ❌ BAD: SECURITY DEFINER (only for auth functions)
CREATE FUNCTION public.get_data(...)
SECURITY DEFINER  -- Avoid unless necessary!
```

### 3. Input Validation

```sql
-- Always validate inputs in functions
CREATE FUNCTION public.create_entity(p_name TEXT, ...)
AS $$
BEGIN
  -- Validation
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;

  -- Check duplicates
  IF EXISTS (SELECT 1 FROM public.entities WHERE name = p_name) THEN
    RAISE EXCEPTION 'Entity already exists';
  END IF;

  -- Insert
  ...
END;
$$;
```

## ⚡ Performance Optimization

### Index Strategy

```sql
-- 1. Single column indexes for simple filters
CREATE INDEX idx_students_email ON public.students(email);

-- 2. Composite indexes for multi-column queries
CREATE INDEX idx_students_institution_program
ON public.students(institution_id, program_id);

-- 3. Partial indexes for filtered queries
CREATE INDEX idx_students_active
ON public.students(id)
WHERE status = 'active' AND deleted_at IS NULL;

-- 4. Covering indexes for SELECT-heavy tables
CREATE INDEX idx_students_covering
ON public.students(institution_id, id, status, created_at, updated_at);
```

### Query Optimization

```sql
-- ✅ GOOD: Use indexes effectively
SELECT * FROM public.students
WHERE institution_id = $1 AND status = 'active';

-- ❌ BAD: Functions on columns prevent index usage
SELECT * FROM public.students
WHERE UPPER(email) = 'TEST@EXAMPLE.COM';

-- ✅ BETTER: Use functional index or lower case comparison
CREATE INDEX idx_students_email_lower ON public.students(LOWER(email));
SELECT * FROM public.students WHERE LOWER(email) = 'test@example.com';
```

## 🧪 Testing Checklist

Before deploying any database changes:

- [ ] Query database to verify current state
- [ ] Test with multiple user roles
- [ ] Verify RLS policies work correctly
- [ ] Check query performance with EXPLAIN ANALYZE
- [ ] Test foreign key constraints
- [ ] Validate triggers fire correctly
- [ ] Update documentation
- [ ] Create backup/rollback plan

## 🛠️ Common Database Queries

### Check Table Structure
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;
```

### Check Foreign Keys
```sql
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'your_table';
```

### Check Indexes
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'your_table';
```

### Check RLS Policies
```sql
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'your_table';
```

### Check RLS Status
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

### Analyze Query Performance
```sql
EXPLAIN ANALYZE
SELECT * FROM public.your_table WHERE condition;
```

## 🐛 Troubleshooting

### Issue: RLS Policy Not Working

1. Check if RLS is enabled: `SELECT rowsecurity FROM pg_tables WHERE tablename = 'your_table'`
2. Check policy definitions: `SELECT * FROM pg_policies WHERE tablename = 'your_table'`
3. Verify JWT claims: Check `auth.jwt()` in your policy
4. Test policy logic: Use `SET LOCAL ROLE` to simulate user

### Issue: Slow Queries

1. Run `EXPLAIN ANALYZE` on the query
2. Check if indexes exist on filtered columns
3. Verify indexes are being used (check query plan)
4. Consider adding composite or partial indexes
5. Check RLS policy complexity

### Issue: Foreign Key Violations

1. Check if referenced record exists
2. Verify foreign key constraints: See "Check Foreign Keys" query above
3. Check cascade settings (ON DELETE CASCADE, etc.)
4. Verify data types match between tables

### Issue: Trigger Not Firing

1. Check trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'your_trigger'`
2. Verify trigger timing (BEFORE/AFTER, INSERT/UPDATE/DELETE)
3. Check trigger function exists and works
4. Test trigger function independently

## 📞 Getting Help

1. **Check Documentation**: Read reference files in `supabase/references/`
2. **Query Database**: Use Supabase Dashboard for real-time state
3. **Search Migrations**: Look at existing migration files for patterns
4. **Test Locally**: Use local Supabase instance for testing
5. **Ask Team**: Consult with database administrator

## 📝 Change Log Template

When making changes, add dated comments:

```sql
-- =====================================================
-- UPDATED: 2025-11-03
-- Changed by: Developer Name
-- Reason: Added email verification column for security compliance
-- =====================================================

ALTER TABLE public.users
ADD COLUMN email_verified_at TIMESTAMPTZ NULL;

CREATE INDEX idx_users_email_verified
ON public.users(email_verified_at)
WHERE email_verified_at IS NOT NULL;
```

## 🎓 Learning Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Performance Guide](https://supabase.com/docs/guides/auth/row-level-security#performance)
- [SQL Style Guide](https://www.sqlstyle.guide/)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-03
**Maintained By**: JKKN COE Development Team

**Remember**: Always query the database for real-time state. This guide and SQL files may be outdated!
