# Practical Examples - Real Implementations

Complete working examples for all 6 Supabase workflows in JKKN COE project.

## Example 1: Create New Module (Question Papers)

**Scenario**: Create a new module for managing examination question papers.

### Step 1: Database Tables

```sql
-- =====================================================
-- MODULE: Question Papers Management
-- Purpose: Manage examination question papers
-- Created: 2025-11-03
-- Tables: question_papers, question_paper_subjects
-- =====================================================

-- Main question papers table
CREATE TABLE IF NOT EXISTS public.question_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant fields
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code TEXT NOT NULL REFERENCES public.institutions(institution_code) ON DELETE CASCADE,

  -- Academic context
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  regulation_code TEXT NOT NULL REFERENCES public.regulations(regulation_code) ON DELETE CASCADE,

  -- Question paper details
  paper_code TEXT NOT NULL,
  paper_title TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('internal', 'semester', 'supplementary', 'improvement')),
  exam_date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  total_marks INTEGER NOT NULL DEFAULT 100,

  -- Paper structure
  sections JSONB DEFAULT '[]'::JSONB,  -- [{"section": "A", "questions": 5, "marks": 20}, ...]
  instructions TEXT,

  -- Status and tracking
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'approved', 'printed', 'archived')),
  submitted_at TIMESTAMPTZ NULL,
  approved_at TIMESTAMPTZ NULL,
  approved_by UUID REFERENCES public.users(id),

  -- Security
  is_confidential BOOLEAN DEFAULT TRUE,
  encryption_key TEXT NULL,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),

  -- Constraints
  CONSTRAINT question_papers_unique_code UNIQUE (institution_id, academic_year_id, paper_code)
);

-- Subject mapping table
CREATE TABLE IF NOT EXISTS public.question_paper_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_paper_id UUID NOT NULL REFERENCES public.question_papers(id) ON DELETE CASCADE,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT question_paper_subjects_unique UNIQUE (question_paper_id, subject_code)
);

-- Enable RLS
ALTER TABLE public.question_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_paper_subjects ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_question_papers_institution_id ON public.question_papers(institution_id);
CREATE INDEX idx_question_papers_academic_year_id ON public.question_papers(academic_year_id);
CREATE INDEX idx_question_papers_semester_id ON public.question_papers(semester_id);
CREATE INDEX idx_question_papers_course_id ON public.question_papers(course_id);
CREATE INDEX idx_question_papers_status ON public.question_papers(status);
CREATE INDEX idx_question_papers_exam_date ON public.question_papers(exam_date);
CREATE INDEX idx_question_papers_paper_code ON public.question_papers(paper_code);
CREATE INDEX idx_question_paper_subjects_qp_id ON public.question_paper_subjects(question_paper_id);

-- Composite indexes for common queries
CREATE INDEX idx_question_papers_institution_year ON public.question_papers(institution_id, academic_year_id);
CREATE INDEX idx_question_papers_institution_status ON public.question_papers(institution_id, status);

-- RLS Policies for question_papers
CREATE POLICY "question_papers_select" ON public.question_papers
FOR SELECT TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "question_papers_insert" ON public.question_papers
FOR INSERT TO authenticated
WITH CHECK (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "question_papers_update" ON public.question_papers
FOR UPDATE TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID))
WITH CHECK (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

CREATE POLICY "question_papers_delete" ON public.question_papers
FOR DELETE TO authenticated
USING (institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID));

-- RLS Policies for question_paper_subjects
CREATE POLICY "question_paper_subjects_select" ON public.question_paper_subjects
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.question_papers qp
    WHERE qp.id = question_paper_subjects.question_paper_id
      AND qp.institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  )
);

CREATE POLICY "question_paper_subjects_insert" ON public.question_paper_subjects
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.question_papers qp
    WHERE qp.id = question_paper_subjects.question_paper_id
      AND qp.institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  )
);

CREATE POLICY "question_paper_subjects_update" ON public.question_paper_subjects
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.question_papers qp
    WHERE qp.id = question_paper_subjects.question_paper_id
      AND qp.institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.question_papers qp
    WHERE qp.id = question_paper_subjects.question_paper_id
      AND qp.institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  )
);

CREATE POLICY "question_paper_subjects_delete" ON public.question_paper_subjects
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.question_papers qp
    WHERE qp.id = question_paper_subjects.question_paper_id
      AND qp.institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  )
);

-- Trigger for updated_at
CREATE TRIGGER trigger_update_question_papers_updated_at
BEFORE UPDATE ON public.question_papers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Comments
COMMENT ON TABLE public.question_papers IS 'Examination question papers with confidentiality and approval workflow';
COMMENT ON TABLE public.question_paper_subjects IS 'Subject mapping for question papers';
COMMENT ON COLUMN public.question_papers.sections IS 'JSON array of paper sections with questions and marks distribution';
COMMENT ON COLUMN public.question_papers.is_confidential IS 'Marks paper as confidential, restricting access';
```

### Step 2: TypeScript Types

```typescript
// types/question-papers.ts

export type ExamType = 'internal' | 'semester' | 'supplementary' | 'improvement'
export type QuestionPaperStatus = 'draft' | 'reviewing' | 'approved' | 'printed' | 'archived'

export interface PaperSection {
  section: string
  questions: number
  marks: number
  description?: string
}

export interface QuestionPaper {
  id: string
  institution_id: string
  institution_code: string
  academic_year_id: string
  semester_id: string
  course_id: string
  regulation_code: string
  paper_code: string
  paper_title: string
  exam_type: ExamType
  exam_date: string
  duration_minutes: number
  total_marks: number
  sections: PaperSection[]
  instructions: string | null
  status: QuestionPaperStatus
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  is_confidential: boolean
  encryption_key: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface QuestionPaperSubject {
  id: string
  question_paper_id: string
  subject_code: string
  subject_name: string
  created_at: string
}

export type QuestionPaperInsert = Omit<QuestionPaper, 'id' | 'created_at' | 'updated_at'>
export type QuestionPaperUpdate = Partial<Omit<QuestionPaper, 'id'>> & { id: string }
```

### Step 3: Service Layer

```typescript
// lib/services/question-papers/question-paper-service.ts

import { createClient } from '@/lib/supabase/server'
import type { QuestionPaper, QuestionPaperInsert, QuestionPaperUpdate } from '@/types/question-papers'

export class QuestionPaperService {
  private async getSupabase() {
    return await createClient()
  }

  async getAll(institutionId: string, filters?: {
    academicYearId?: string
    semesterId?: string
    status?: string
  }) {
    const supabase = await this.getSupabase()

    let query = supabase
      .from('question_papers')
      .select('*, course:courses(course_code, course_title), academic_year:academic_years(year_name)')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })

    if (filters?.academicYearId) {
      query = query.eq('academic_year_id', filters.academicYearId)
    }
    if (filters?.semesterId) {
      query = query.eq('semester_id', filters.semesterId)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query

    if (error) throw error
    return data as QuestionPaper[]
  }

  async getById(id: string) {
    const supabase = await this.getSupabase()

    const { data, error } = await supabase
      .from('question_papers')
      .select('*, subjects:question_paper_subjects(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as QuestionPaper
  }

  async create(paper: QuestionPaperInsert) {
    const supabase = await this.getSupabase()

    const { data, error } = await supabase
      .from('question_papers')
      .insert(paper)
      .select()
      .single()

    if (error) throw error
    return data as QuestionPaper
  }

  async update(id: string, updates: Partial<QuestionPaperUpdate>) {
    const supabase = await this.getSupabase()

    const { data, error } = await supabase
      .from('question_papers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as QuestionPaper
  }

  async delete(id: string) {
    const supabase = await this.getSupabase()

    const { error } = await supabase
      .from('question_papers')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  async approve(id: string, approvedBy: string) {
    return this.update(id, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approvedBy
    })
  }
}

export const questionPaperService = new QuestionPaperService()
```

### Step 4: React Query Hooks

```typescript
// hooks/question-papers/use-question-papers.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { questionPaperService } from '@/lib/services/question-papers/question-paper-service'
import type { QuestionPaperInsert, QuestionPaperUpdate } from '@/types/question-papers'

export function useQuestionPapers(institutionId: string, filters?: any) {
  return useQuery({
    queryKey: ['question-papers', institutionId, filters],
    queryFn: () => questionPaperService.getAll(institutionId, filters),
    enabled: !!institutionId
  })
}

export function useQuestionPaper(id: string) {
  return useQuery({
    queryKey: ['question-paper', id],
    queryFn: () => questionPaperService.getById(id),
    enabled: !!id
  })
}

export function useCreateQuestionPaper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (paper: QuestionPaperInsert) => questionPaperService.create(paper),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-papers'] })
    }
  })
}

export function useUpdateQuestionPaper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<QuestionPaperUpdate> }) =>
      questionPaperService.update(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['question-papers'] })
      queryClient.invalidateQueries({ queryKey: ['question-paper', variables.id] })
    }
  })
}

export function useDeleteQuestionPaper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => questionPaperService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-papers'] })
    }
  })
}

export function useApproveQuestionPaper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
      questionPaperService.approve(id, approvedBy),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['question-papers'] })
      queryClient.invalidateQueries({ queryKey: ['question-paper', variables.id] })
    }
  })
}
```

## Example 2: Update Existing Schema (Add Column)

**Scenario**: Add a `document_url` column to the existing `question_papers` table.

### Step 1: Create Migration

```sql
-- supabase/migrations/20251103_add_document_url_to_question_papers.sql

-- =====================================================
-- MIGRATION: Add document_url to question_papers
-- Purpose: Store uploaded question paper documents
-- Created: 2025-11-03
-- =====================================================

-- Add column
ALTER TABLE public.question_papers
ADD COLUMN IF NOT EXISTS document_url TEXT NULL;

-- Add index for null checks
CREATE INDEX IF NOT EXISTS idx_question_papers_document_url
ON public.question_papers(document_url)
WHERE document_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.question_papers.document_url IS 'URL to uploaded question paper document (PDF)';
```

### Step 2: Update TypeScript Types

```typescript
// types/question-papers.ts (add to existing interface)

export interface QuestionPaper {
  // ... existing fields ...
  document_url: string | null  // ← Add this field
}
```

### Step 3: Update Service (if needed)

```typescript
// lib/services/question-papers/question-paper-service.ts

async uploadDocument(id: string, documentUrl: string) {
  return this.update(id, { document_url: documentUrl })
}
```

## Example 3: Write RLS Policies (Teacher Access)

**Scenario**: Teachers can only see question papers for courses they teach.

### Create Helper Function

```sql
-- =====================================================
-- FUNCTION: auth.can_access_question_paper
-- Purpose: Check if user can access a question paper
-- Created: 2025-11-03
-- =====================================================

CREATE OR REPLACE FUNCTION auth.can_access_question_paper(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_user_institution_id UUID;
  v_course_institution_id UUID;
BEGIN
  -- Get current user
  v_user_id := (SELECT auth.uid());

  -- Get user's institution
  v_user_institution_id := (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID);

  -- Check if admin
  v_is_admin := (SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN, FALSE));

  -- Admins have access to all
  IF v_is_admin = TRUE THEN
    RETURN TRUE;
  END IF;

  -- Get course's institution
  SELECT institution_id INTO v_course_institution_id
  FROM public.courses
  WHERE id = p_course_id;

  -- Check if same institution
  IF v_user_institution_id != v_course_institution_id THEN
    RETURN FALSE;
  END IF;

  -- Check if teacher is assigned to this course
  RETURN EXISTS (
    SELECT 1 FROM public.course_teachers
    WHERE course_id = p_course_id AND teacher_id = v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auth.can_access_question_paper TO authenticated;
```

### Create Policy

```sql
-- Replace existing SELECT policy
DROP POLICY IF EXISTS "question_papers_select" ON public.question_papers;

CREATE POLICY "question_papers_select_by_teacher"
ON public.question_papers
FOR SELECT
TO authenticated
USING (
  institution_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'institution_id')::UUID)
  AND (
    (SELECT auth.is_admin()) = TRUE
    OR (SELECT auth.can_access_question_paper(course_id)) = TRUE
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_course_teachers_course_id
ON public.course_teachers(course_id);

CREATE INDEX IF NOT EXISTS idx_course_teachers_teacher_id
ON public.course_teachers(teacher_id);
```

## Example 4: Create Database Function (Calculate Total Marks)

**Scenario**: Function to calculate total marks from paper sections.

```sql
-- =====================================================
-- FUNCTION: calculate_question_paper_total_marks
-- Purpose: Calculate total marks from sections JSONB
-- Created: 2025-11-03
-- Security: INVOKER (runs with caller permissions)
-- Volatility: IMMUTABLE (pure function)
-- =====================================================

CREATE OR REPLACE FUNCTION public.calculate_question_paper_total_marks(
  p_sections JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total_marks INTEGER := 0;
  v_section JSONB;
BEGIN
  -- Validate input
  IF p_sections IS NULL OR jsonb_array_length(p_sections) = 0 THEN
    RETURN 0;
  END IF;

  -- Sum marks from all sections
  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_total_marks := v_total_marks + COALESCE((v_section->>'marks')::INTEGER, 0);
  END LOOP;

  RETURN v_total_marks;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_question_paper_total_marks TO authenticated;

COMMENT ON FUNCTION public.calculate_question_paper_total_marks IS 'Calculates total marks from question paper sections JSONB array';

-- Example usage:
-- SELECT calculate_question_paper_total_marks('[{"section": "A", "marks": 20}, {"section": "B", "marks": 30}]'::JSONB);
-- Result: 50
```

### Add Trigger to Auto-Calculate

```sql
-- Create trigger function
CREATE OR REPLACE FUNCTION public.auto_calculate_question_paper_marks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
VOLATILE
AS $$
BEGIN
  -- Auto-calculate total_marks from sections
  IF NEW.sections IS NOT NULL THEN
    NEW.total_marks := public.calculate_question_paper_total_marks(NEW.sections);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_auto_calculate_marks
BEFORE INSERT OR UPDATE OF sections ON public.question_papers
FOR EACH ROW
EXECUTE FUNCTION public.auto_calculate_question_paper_marks();
```

## Example 5: Debug Database Issue

**Scenario**: Question papers not showing for a specific teacher.

### Step 1: Check Table Data

```sql
-- Check if question papers exist
SELECT id, paper_code, paper_title, status, institution_id, course_id
FROM public.question_papers
WHERE institution_id = 'your-institution-id'
LIMIT 10;
```

### Step 2: Check RLS Policies

```sql
-- Check policies on question_papers table
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_papers';
```

### Step 3: Test Policy Logic

```sql
-- Simulate user's JWT
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{
  "sub": "teacher-user-id",
  "email": "teacher@example.com",
  "app_metadata": {
    "institution_id": "institution-uuid",
    "is_admin": false
  }
}';

-- Test query
SELECT * FROM public.question_papers WHERE course_id = 'specific-course-id';

-- Reset
RESET ROLE;
```

### Step 4: Check Course Teacher Relationship

```sql
-- Verify teacher is assigned to course
SELECT * FROM public.course_teachers
WHERE teacher_id = 'teacher-user-id'
  AND course_id = 'specific-course-id';

-- If not found, assign teacher
INSERT INTO public.course_teachers (course_id, teacher_id, institution_id)
VALUES ('course-id', 'teacher-id', 'institution-id');
```

### Step 5: Check Indexes

```sql
-- Verify indexes exist for performance
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'question_papers';

-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT * FROM public.question_papers
WHERE institution_id = 'your-institution-id' AND status = 'approved';
```

## Example 6: Set Up Authentication (Already Implemented)

Your authentication is already set up correctly! Here's the current implementation:

### Browser Client

```typescript
// lib/supabase/client.ts (already exists)
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Server Client

```typescript
// lib/supabase-server.ts (already exists)
import { createClient } from '@supabase/supabase-js'

export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
```

### Middleware

```typescript
// middleware.ts (already exists with correct implementation)
// Your implementation already uses @supabase/ssr correctly!
```

## Summary

You now have:

1. ✅ **Complete module example** (Question Papers)
2. ✅ **Schema update example** (Add column)
3. ✅ **RLS policy example** (Teacher access)
4. ✅ **Function example** (Calculate marks)
5. ✅ **Debug workflow example** (Troubleshooting)
6. ✅ **Auth implementation** (Already correct)

All examples follow JKKN COE conventions and best practices!

---

**Next Steps**: Copy these patterns for your own modules and workflows!
