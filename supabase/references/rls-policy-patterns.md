# RLS Policy Patterns

Performance-optimized Row Level Security (RLS) policy templates for JKKN COE project.

## Critical Rules

### ⚠️ Performance Rules (MUST FOLLOW)
1. **ALWAYS wrap functions in SELECT**: `(SELECT auth.uid())` not `auth.uid()`
2. **ALWAYS create indexes on policy columns**: Every column used in policies needs an index
3. **ALWAYS specify target roles**: Use `TO authenticated` or `TO anon` explicitly
4. **NEVER use FOR ALL**: Create 4 separate policies (SELECT, INSERT, UPDATE, DELETE)
5. **Use PERMISSIVE**: Avoid RESTRICTIVE policies (they're slower)

### Policy Structure Rules
- **SELECT**: USING only (no WITH CHECK)
- **INSERT**: WITH CHECK only (no USING)
- **UPDATE**: Both USING and WITH CHECK
- **DELETE**: USING only (no WITH CHECK)

## Pattern 1: Institution-Based Access (Multi-Tenant)

**Use Case**: Most tables in JKKN COE - users can only access data from their own institution.

### Policy Implementation

```sql
-- =====================================================
-- INSTITUTION-BASED RLS POLICIES: entities
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Multi-tenant access by institution_id
-- Performance: Indexed on institution_id
-- =====================================================

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
CREATE POLICY "entities_select_own_institution"
ON public.entities
FOR SELECT
TO authenticated
USING (
  institution_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  )
);

-- INSERT Policy
CREATE POLICY "entities_insert_own_institution"
ON public.entities
FOR INSERT
TO authenticated
WITH CHECK (
  institution_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  )
);

-- UPDATE Policy
CREATE POLICY "entities_update_own_institution"
ON public.entities
FOR UPDATE
TO authenticated
USING (
  institution_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  )
)
WITH CHECK (
  institution_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  )
);

-- DELETE Policy
CREATE POLICY "entities_delete_own_institution"
ON public.entities
FOR DELETE
TO authenticated
USING (
  institution_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID
  )
);

-- CRITICAL: Create index for performance
CREATE INDEX IF NOT EXISTS idx_entities_institution_id
ON public.entities(institution_id);

-- Optional: Create helper function for reusability
CREATE OR REPLACE FUNCTION auth.user_institution_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID;
$$;

-- Simplified policies using helper function
CREATE POLICY "entities_select_own_institution_v2"
ON public.entities
FOR SELECT
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
);
```

## Pattern 2: User-Owned Records

**Use Case**: User profiles, personal settings - users can only access their own records.

### Policy Implementation

```sql
-- =====================================================
-- USER-OWNED RLS POLICIES: user_settings
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: User can only access their own records
-- Performance: Indexed on user_id
-- =====================================================

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
CREATE POLICY "user_settings_select_own"
ON public.user_settings
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
);

-- INSERT Policy
CREATE POLICY "user_settings_insert_own"
ON public.user_settings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
);

-- UPDATE Policy
CREATE POLICY "user_settings_update_own"
ON public.user_settings
FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
)
WITH CHECK (
  user_id = (SELECT auth.uid())
);

-- DELETE Policy
CREATE POLICY "user_settings_delete_own"
ON public.user_settings
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
);

-- CRITICAL: Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
ON public.user_settings(user_id);
```

## Pattern 3: Role-Based Access

**Use Case**: Admin users can access all data, regular users only their institution's data.

### Policy Implementation

```sql
-- =====================================================
-- ROLE-BASED RLS POLICIES: audit_logs
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Admins see all, users see their institution
-- Performance: Indexed on institution_id and created_by
-- =====================================================

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN,
    FALSE
  );
$$;

-- SELECT Policy: Admins see all, users see their institution
CREATE POLICY "audit_logs_select_by_role"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
  OR
  institution_id = (SELECT auth.user_institution_id())
);

-- INSERT Policy: Users can only insert for their institution
CREATE POLICY "audit_logs_insert_own_institution"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
);

-- UPDATE Policy: Admins can update all, users can update their institution
CREATE POLICY "audit_logs_update_by_role"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
  OR
  institution_id = (SELECT auth.user_institution_id())
)
WITH CHECK (
  (SELECT auth.is_admin()) = TRUE
  OR
  institution_id = (SELECT auth.user_institution_id())
);

-- DELETE Policy: Only admins can delete
CREATE POLICY "audit_logs_delete_admin_only"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
);

-- CRITICAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_id
ON public.audit_logs(institution_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_by
ON public.audit_logs(created_by);
```

## Pattern 4: Public Read, Authenticated Write

**Use Case**: Reference data that anyone can read, but only authenticated users can modify.

### Policy Implementation

```sql
-- =====================================================
-- PUBLIC READ RLS POLICIES: reference_data
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Public read, authenticated write
-- Performance: Indexed on status and updated_at
-- =====================================================

-- Enable RLS
ALTER TABLE public.reference_data ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Anyone can read active records
CREATE POLICY "reference_data_select_public"
ON public.reference_data
FOR SELECT
TO anon, authenticated
USING (
  status = 'active'
);

-- INSERT Policy: Only authenticated users can insert
CREATE POLICY "reference_data_insert_authenticated"
ON public.reference_data
FOR INSERT
TO authenticated
WITH CHECK (
  TRUE  -- All authenticated users can insert
);

-- UPDATE Policy: Only authenticated users from same institution can update
CREATE POLICY "reference_data_update_authenticated"
ON public.reference_data
FOR UPDATE
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
)
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
);

-- DELETE Policy: Only admins can delete
CREATE POLICY "reference_data_delete_admin"
ON public.reference_data
FOR DELETE
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
);

-- CRITICAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reference_data_status
ON public.reference_data(status)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reference_data_institution_id
ON public.reference_data(institution_id);
```

## Pattern 5: Time-Based Access

**Use Case**: Records that should only be accessible during certain time periods.

### Policy Implementation

```sql
-- =====================================================
-- TIME-BASED RLS POLICIES: exam_schedules
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Access based on date ranges
-- Performance: Indexed on start_date, end_date, institution_id
-- =====================================================

-- Enable RLS
ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Users can see schedules in their date range
CREATE POLICY "exam_schedules_select_by_date"
ON public.exam_schedules
FOR SELECT
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
  AND start_date <= CURRENT_DATE
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
);

-- INSERT Policy: Users can insert schedules for future dates
CREATE POLICY "exam_schedules_insert_future"
ON public.exam_schedules
FOR INSERT
TO authenticated
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
  AND start_date >= CURRENT_DATE
);

-- UPDATE Policy: Users can update schedules that haven't ended
CREATE POLICY "exam_schedules_update_not_ended"
ON public.exam_schedules
FOR UPDATE
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
)
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
  AND start_date >= CURRENT_DATE
);

-- DELETE Policy: Users can delete future schedules only
CREATE POLICY "exam_schedules_delete_future"
ON public.exam_schedules
FOR DELETE
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
  AND start_date > CURRENT_DATE
);

-- CRITICAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_schedules_dates
ON public.exam_schedules(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_institution_dates
ON public.exam_schedules(institution_id, start_date, end_date);
```

## Pattern 6: Hierarchical Access

**Use Case**: Users can access records in their institution's hierarchy (department > program > students).

### Policy Implementation

```sql
-- =====================================================
-- HIERARCHICAL RLS POLICIES: student_grades
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Access based on organizational hierarchy
-- Performance: Indexed on institution_id, program_id
-- =====================================================

-- Enable RLS
ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to program
CREATE OR REPLACE FUNCTION auth.has_program_access(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_institution_id UUID;
  v_program_institution_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get user's institution
  v_user_institution_id := (SELECT auth.user_institution_id());

  -- Check if admin
  v_is_admin := (SELECT auth.is_admin());

  -- Admins have access to all programs
  IF v_is_admin = TRUE THEN
    RETURN TRUE;
  END IF;

  -- Get program's institution
  SELECT institution_id INTO v_program_institution_id
  FROM public.programs
  WHERE id = p_program_id;

  -- Check if same institution
  RETURN v_user_institution_id = v_program_institution_id;
END;
$$;

-- SELECT Policy: Users can see grades for their programs
CREATE POLICY "student_grades_select_by_program"
ON public.student_grades
FOR SELECT
TO authenticated
USING (
  (SELECT auth.has_program_access(program_id))
);

-- INSERT Policy: Users can insert grades for their programs
CREATE POLICY "student_grades_insert_by_program"
ON public.student_grades
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.has_program_access(program_id))
);

-- UPDATE Policy: Users can update grades for their programs
CREATE POLICY "student_grades_update_by_program"
ON public.student_grades
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.has_program_access(program_id))
)
WITH CHECK (
  (SELECT auth.has_program_access(program_id))
);

-- DELETE Policy: Only admins can delete grades
CREATE POLICY "student_grades_delete_admin"
ON public.student_grades
FOR DELETE
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
);

-- CRITICAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_grades_program_id
ON public.student_grades(program_id);

CREATE INDEX IF NOT EXISTS idx_student_grades_student_id
ON public.student_grades(student_id);
```

## Pattern 7: MFA-Protected Operations

**Use Case**: Sensitive operations require Multi-Factor Authentication.

### Policy Implementation

```sql
-- =====================================================
-- MFA-PROTECTED RLS POLICIES: financial_transactions
-- =====================================================
-- Created: YYYY-MM-DD
-- Pattern: Require MFA for sensitive operations
-- Performance: Indexed on institution_id, amount
-- =====================================================

-- Enable RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- Helper function to check MFA status
CREATE OR REPLACE FUNCTION auth.has_mfa()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'amr' -> 0 ->> 'method') = 'mfa',
    FALSE
  );
$$;

-- SELECT Policy: All authenticated users can view transactions
CREATE POLICY "transactions_select_authenticated"
ON public.financial_transactions
FOR SELECT
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
);

-- INSERT Policy: Large transactions require MFA
CREATE POLICY "transactions_insert_mfa_for_large"
ON public.financial_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
  AND (
    amount < 10000.00  -- Small transactions don't need MFA
    OR (SELECT auth.has_mfa()) = TRUE  -- Large transactions require MFA
  )
);

-- UPDATE Policy: All updates require MFA
CREATE POLICY "transactions_update_mfa_required"
ON public.financial_transactions
FOR UPDATE
TO authenticated
USING (
  institution_id = (SELECT auth.user_institution_id())
  AND (SELECT auth.has_mfa()) = TRUE
)
WITH CHECK (
  institution_id = (SELECT auth.user_institution_id())
  AND (SELECT auth.has_mfa()) = TRUE
);

-- DELETE Policy: Deletions require MFA and admin role
CREATE POLICY "transactions_delete_mfa_admin"
ON public.financial_transactions
FOR DELETE
TO authenticated
USING (
  (SELECT auth.is_admin()) = TRUE
  AND (SELECT auth.has_mfa()) = TRUE
);

-- CRITICAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_institution_id
ON public.financial_transactions(institution_id);

CREATE INDEX IF NOT EXISTS idx_transactions_amount
ON public.financial_transactions(amount)
WHERE amount >= 10000.00;
```

## Performance Optimization Tips

### 1. Index Strategy

```sql
-- Single column indexes for simple policies
CREATE INDEX idx_table_institution ON table(institution_id);

-- Composite indexes for multi-column policies
CREATE INDEX idx_table_institution_status ON table(institution_id, status);

-- Partial indexes for filtered queries
CREATE INDEX idx_table_active ON table(id)
WHERE status = 'active' AND deleted_at IS NULL;

-- Covering indexes for SELECT-heavy tables
CREATE INDEX idx_table_covering ON table(institution_id, id, status, created_at);
```

### 2. Policy Optimization

```sql
-- ❌ BAD: Expensive subquery in policy
CREATE POLICY "bad_policy" ON table
USING (
  institution_id IN (
    SELECT institution_id FROM user_institutions
    WHERE user_id = auth.uid()
  )
);

-- ✅ GOOD: Direct comparison with indexed column
CREATE POLICY "good_policy" ON table
USING (
  institution_id = (SELECT auth.user_institution_id())
);
```

### 3. Function Caching

```sql
-- Create STABLE functions for repeated lookups
CREATE OR REPLACE FUNCTION auth.user_institution_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE  -- Result is cached within transaction
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID;
$$;
```

## Testing Policies

### Test Script Template

```sql
-- Set up test user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{
  "sub": "user-uuid-here",
  "email": "test@example.com",
  "app_metadata": {
    "institution_id": "institution-uuid-here",
    "is_admin": false
  }
}';

-- Test SELECT
SELECT * FROM public.entities WHERE id = 'test-id';

-- Test INSERT
INSERT INTO public.entities (entity_name, entity_code, institution_id)
VALUES ('Test Entity', 'TEST', 'institution-uuid-here');

-- Test UPDATE
UPDATE public.entities SET entity_name = 'Updated' WHERE id = 'test-id';

-- Test DELETE
DELETE FROM public.entities WHERE id = 'test-id';

-- Reset role
RESET ROLE;
```

## Troubleshooting

### Check Policy Definitions

```sql
-- View all policies on a table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'your_table';
```

### Check RLS Status

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'your_table';
```

### Analyze Query Performance

```sql
-- Check query plan with RLS
EXPLAIN ANALYZE
SELECT * FROM public.entities
WHERE institution_id = 'your-institution-id';
```

---

**Remember**: Always create indexes BEFORE enabling RLS policies. Missing indexes can cause severe performance degradation.
