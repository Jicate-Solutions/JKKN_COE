# JKKN COE Supabase Database Documentation

Complete database documentation and workflow guides for the JKKN Controller of Examination (COE) application.

## 📚 Documentation Structure

```
supabase/
├── README.md                      # ← You are here (start here!)
├── MASTER_GUIDE.md                # Complete guide for all workflows
├── QUICK_REFERENCE.md             # Quick reference card (print this!)
├── SQL_FILE_INDEX.md              # Database schema documentation
│
├── setup/                         # Production SQL files
│   ├── 01_tables.sql             # All table definitions
│   ├── 02_functions.sql          # All database functions
│   ├── 03_policies.sql           # All RLS policies
│   ├── 04_triggers.sql           # All triggers
│   └── 05_views.sql              # All views
│
├── references/                    # Templates and patterns
│   ├── sql-templates.md          # Complete SQL templates
│   └── rls-policy-patterns.md    # RLS policy patterns
│
├── migrations/                    # Historical migrations (33+ files)
├── functions/                     # Edge functions
├── scripts/                       # Utility scripts
└── assets/                        # Template files
```

## 🚀 Quick Start

### For New Developers

1. **Start here**: Read this README
2. **Print this**: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
3. **Understand structure**: [SQL_FILE_INDEX.md](./SQL_FILE_INDEX.md)
4. **Learn workflows**: [MASTER_GUIDE.md](./MASTER_GUIDE.md)

### For Specific Tasks

| Task | Go To |
|------|-------|
| Create new database module | [MASTER_GUIDE.md](./MASTER_GUIDE.md#workflow-1-create-new-module) |
| Update existing table | [MASTER_GUIDE.md](./MASTER_GUIDE.md#workflow-2-update-table-schema) |
| Write RLS policies | [references/rls-policy-patterns.md](./references/rls-policy-patterns.md) |
| Create database function | [references/sql-templates.md](./references/sql-templates.md) |
| Debug database issue | [MASTER_GUIDE.md](./MASTER_GUIDE.md#workflow-5-debug-database-issue) |
| Set up authentication | [MASTER_GUIDE.md](./MASTER_GUIDE.md#workflow-6-set-up-authentication) |

## 🎯 Common Tasks (Copy-Paste Ready)

### Create a New Table

```sql
-- 1. Create table with standard fields
CREATE TABLE public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  institution_code TEXT NOT NULL REFERENCES public.institutions(institution_code),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  CONSTRAINT new_table_unique_code UNIQUE (institution_id, code)
);

-- 2. Enable RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- 3. Create indexes
CREATE INDEX idx_new_table_institution_id ON public.new_table(institution_id);
CREATE INDEX idx_new_table_code ON public.new_table(code);
CREATE INDEX idx_new_table_status ON public.new_table(status) WHERE status = 'active';

-- 4. Create RLS policies (all 4 operations)
CREATE POLICY "new_table_select" ON public.new_table
FOR SELECT TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "new_table_insert" ON public.new_table
FOR INSERT TO authenticated
WITH CHECK (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "new_table_update" ON public.new_table
FOR UPDATE TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID))
WITH CHECK (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "new_table_delete" ON public.new_table
FOR DELETE TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

-- 5. Create trigger for updated_at
CREATE TRIGGER trigger_update_new_table_updated_at
BEFORE UPDATE ON public.new_table
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. Add comment
COMMENT ON TABLE public.new_table IS 'Description of table purpose';
```

### Add a Column

```sql
-- Add column
ALTER TABLE public.your_table ADD COLUMN new_column TEXT NULL;

-- Add index if needed
CREATE INDEX idx_your_table_new_column ON public.your_table(new_column);

-- Add comment
COMMENT ON COLUMN public.your_table.new_column IS 'Description';
```

### Check Database State

```sql
-- List all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'your_table';

-- Check indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'your_table';
```

## 🔴 Critical Rules (Never Violate!)

### 1. Always Check Database First
- Use Supabase Dashboard to query real-time database state
- SQL files may be outdated - dashboard shows reality
- **Never rely on files alone**

### 2. File Management
- **NEVER create duplicate SQL files**
- **ALWAYS update existing files** in `supabase/setup/`
- **ADD dated comments** for all changes
- **UPDATE SQL_FILE_INDEX.md** after changes

### 3. RLS Policies
- **ALWAYS wrap functions in SELECT**: `(SELECT auth.uid())`
- **ALWAYS create indexes** on columns used in policies
- **NEVER use `FOR ALL`** - create 4 separate policies
- **ALWAYS specify target**: `TO authenticated` or `TO anon`

### 4. Database Functions
- **DEFAULT to `SECURITY INVOKER`** (safer)
- **ALWAYS set `search_path = ''`** (security)
- **USE fully qualified names**: `public.table_name`
- **SPECIFY volatility**: IMMUTABLE/STABLE/VOLATILE

### 5. Authentication
- **NEVER use deprecated methods**: `get()`, `set()`, `remove()`
- **ALWAYS use**: `getAll()` and `setAll()` only
- **USE package**: `@supabase/ssr`

## 🗄️ Current Database Schema

### Core Tables

**Authentication & Authorization:**
- `users` - User profiles
- `roles` - Role definitions
- `permissions` - Permission definitions
- `role_permissions` - Role-permission mapping
- `user_roles` - User-role mapping

**Academic Structure:**
- `institutions` - Educational institutions
- `degrees` - Degree programs
- `departments` - Academic departments
- `programs` - Specific programs
- `regulations` - Academic regulations
- `semesters` - Semester definitions
- `sections` - Class sections
- `academic_years` - Academic year periods

**Course Management:**
- `courses` - Course definitions
- `course_mapping` - Course-program mapping
- `course_offering` - Course offerings

**Student Management:**
- `students` - Student information
- `verification_codes` - Email verification

**Grading & Examination:**
- `grade_system` - Grade system definitions
- `grades` - Grade definitions
- `exam_attendance` - Exam attendance tracking

For complete schema, see [SQL_FILE_INDEX.md](./SQL_FILE_INDEX.md)

## 🔐 Security Architecture

### Multi-Tenant Pattern

All tables use institution-based multi-tenancy:

```sql
-- Every table has:
institution_id UUID NOT NULL  -- For fast UUID joins
institution_code TEXT NOT NULL  -- For human-readable imports

-- RLS policy filters by institution:
USING (institution_id = (SELECT auth.user_institution_id()))
```

### RLS Policy Structure

Every table has 4 separate policies:
1. **SELECT** - Who can read records
2. **INSERT** - Who can create records
3. **UPDATE** - Who can modify records
4. **DELETE** - Who can remove records

See [RLS Policy Patterns](./references/rls-policy-patterns.md) for details.

## ⚡ Performance Guidelines

### Index Strategy

1. **Create indexes on**:
   - All foreign keys
   - Columns used in WHERE clauses
   - Columns used in RLS policies
   - Frequently sorted/grouped columns

2. **Use composite indexes** for multi-column queries
3. **Use partial indexes** for filtered queries
4. **Monitor query performance** with EXPLAIN ANALYZE

### RLS Optimization

```sql
-- ✅ GOOD: Function wrapped in SELECT, indexed column
CREATE POLICY "good" ON table
USING (institution_id = (SELECT auth.user_institution_id()));

CREATE INDEX idx_table_institution ON table(institution_id);

-- ❌ BAD: Function not wrapped, no index
CREATE POLICY "bad" ON table
USING (institution_id = auth.user_institution_id());  -- Will fail!
```

## 🧪 Testing Workflow

Before deploying any database changes:

1. **Query database** to verify current state
2. **Test in local/staging** environment first
3. **Test with multiple user roles** (admin, teacher, student)
4. **Verify RLS policies** work correctly
5. **Check query performance** with EXPLAIN ANALYZE
6. **Update documentation** (SQL_FILE_INDEX.md)
7. **Create backup/rollback plan**

## 📊 Migration Strategy

### Development Workflow

1. **Create migration file**: `supabase/migrations/YYYYMMDD_description.sql`
2. **Apply migration**: `npx supabase migration up`
3. **Test changes**: Verify in Supabase Dashboard
4. **Update setup files**: Update `supabase/setup/*.sql` to match reality
5. **Update types**: Update TypeScript types
6. **Update docs**: Update SQL_FILE_INDEX.md

### Production Deployment

1. **Review migration** with team
2. **Test in staging** environment
3. **Create backup** of production database
4. **Apply migration** during low-traffic period
5. **Verify changes** in production
6. **Monitor performance** after deployment

## 🛠️ Development Tools

### Supabase CLI Commands

```bash
# Start local Supabase
npx supabase start

# Create new migration
npx supabase migration new description

# Apply migrations
npx supabase migration up

# Reset database (careful!)
npx supabase db reset

# Generate TypeScript types
npx supabase gen types typescript --local > types/supabase.ts
```

### Useful SQL Commands

```sql
-- List all tables
\dt public.*

-- Describe table
\d public.table_name

-- Show all indexes
\di

-- Show all functions
\df

-- Execute SQL file
\i path/to/file.sql
```

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| RLS policy not working | Check if RLS is enabled, verify policy logic |
| Slow queries | Add indexes, check EXPLAIN ANALYZE |
| Foreign key violations | Verify referenced record exists |
| Trigger not firing | Check trigger exists and function works |
| Migration fails | Check for conflicts, rollback if needed |

See [MASTER_GUIDE.md](./MASTER_GUIDE.md#-troubleshooting) for detailed troubleshooting.

## 📞 Getting Help

1. **Check documentation** in `supabase/` directory
2. **Search existing migrations** for similar patterns
3. **Query Supabase Dashboard** for current state
4. **Test in local environment** first
5. **Consult with team** for complex changes

## 🎓 Learning Path

### For Beginners

1. Read this README
2. Review [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
3. Study [SQL_FILE_INDEX.md](./SQL_FILE_INDEX.md)
4. Practice with local Supabase instance
5. Review existing migrations for patterns

### For Intermediate Users

1. Deep dive into [MASTER_GUIDE.md](./MASTER_GUIDE.md)
2. Study [RLS Policy Patterns](./references/rls-policy-patterns.md)
3. Learn [SQL Templates](./references/sql-templates.md)
4. Practice creating functions and triggers
5. Optimize query performance

### For Advanced Users

1. Design complex RLS hierarchies
2. Optimize database performance
3. Create reusable function libraries
4. Implement audit trails
5. Design efficient multi-tenant patterns

## 📝 Contributing

When making database changes:

1. **Follow naming conventions** (see MASTER_GUIDE.md)
2. **Add dated comments** explaining changes
3. **Update documentation** immediately
4. **Test thoroughly** before committing
5. **Review with team** for significant changes

## 🔗 External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Performance Guide](https://supabase.com/docs/guides/auth/row-level-security#performance)
- [SQL Style Guide](https://www.sqlstyle.guide/)

## 📅 Changelog

### 2025-11-03
- Created comprehensive documentation structure
- Added MASTER_GUIDE.md with all workflows
- Added QUICK_REFERENCE.md for daily use
- Added SQL_FILE_INDEX.md for schema documentation
- Added sql-templates.md with complete templates
- Added rls-policy-patterns.md with 7 patterns

---

**Version**: 1.0.0
**Last Updated**: 2025-11-03
**Maintained By**: JKKN COE Development Team

**Need help?** Start with [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) or consult [MASTER_GUIDE.md](./MASTER_GUIDE.md).
