-- =====================================================
-- REVALUATION PROCESS MODULE - MIGRATION 1/2
-- Create core revaluation tables
-- Created: 2026-01-23
-- =====================================================

-- =====================================================
-- 1. REVALUATION FEE CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_fee_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code VARCHAR(50) NOT NULL,

  -- Attempt-based fees
  attempt_1_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_1_fee >= 0),
  attempt_2_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_2_fee >= 0),
  attempt_3_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_3_fee >= 0),

  -- Optional: Course type-based fees
  theory_course_fee NUMERIC(10, 2) CHECK (theory_course_fee >= 0),
  practical_course_fee NUMERIC(10, 2) CHECK (practical_course_fee >= 0),
  project_course_fee NUMERIC(10, 2) CHECK (project_course_fee >= 0),

  -- Effective period
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- Constraints
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Indexes for fee config
CREATE INDEX IF NOT EXISTS idx_reval_fee_config_institution_active
  ON public.revaluation_fee_config(institutions_id, is_active);

CREATE INDEX IF NOT EXISTS idx_reval_fee_config_dates
  ON public.revaluation_fee_config(effective_from, effective_to);

COMMENT ON TABLE public.revaluation_fee_config IS 'Institution-specific revaluation fee configuration';

-- =====================================================
-- 2. REVALUATION REGISTRATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code VARCHAR(50) NOT NULL,
  examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
  exam_registration_id UUID NOT NULL REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,

  -- Revaluation tracking
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  previous_revaluation_id UUID REFERENCES public.revaluation_registrations(id) ON DELETE SET NULL,

  -- Application
  application_date DATE DEFAULT CURRENT_DATE,
  reason_for_revaluation TEXT,

  -- Payment
  fee_amount NUMERIC(10, 2) NOT NULL CHECK (fee_amount >= 0),
  payment_transaction_id VARCHAR(255),
  payment_date DATE,
  payment_status VARCHAR(50) DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Verified', 'Rejected')),
  payment_verified_by UUID,
  payment_verified_date TIMESTAMPTZ,

  -- Workflow status
  status VARCHAR(50) DEFAULT 'Payment Pending' CHECK (status IN (
    'Applied',
    'Payment Pending',
    'Payment Verified',
    'Approved',
    'Rejected',
    'Assigned',
    'In Progress',
    'Evaluated',
    'Verified',
    'Published',
    'Cancelled'
  )),

  -- Assignment
  examiner_assignment_id UUID REFERENCES public.examiner_assignments(id) ON DELETE SET NULL,
  assigned_date TIMESTAMPTZ,
  evaluation_deadline DATE,

  -- Approval
  approved_by UUID,
  approved_date TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Publication
  published_by UUID,
  published_date TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- Denormalized fields for performance
  student_register_number VARCHAR(100),
  student_name VARCHAR(255),
  course_code VARCHAR(100),
  course_title VARCHAR(255),
  session_code VARCHAR(100),

  -- Constraints
  UNIQUE(exam_registration_id, course_id, attempt_number)
);

-- Indexes for registrations
CREATE INDEX IF NOT EXISTS idx_reval_reg_institution
  ON public.revaluation_registrations(institutions_id);

CREATE INDEX IF NOT EXISTS idx_reval_reg_session
  ON public.revaluation_registrations(examination_session_id);

CREATE INDEX IF NOT EXISTS idx_reval_reg_exam_reg
  ON public.revaluation_registrations(exam_registration_id);

CREATE INDEX IF NOT EXISTS idx_reval_reg_course
  ON public.revaluation_registrations(course_id);

CREATE INDEX IF NOT EXISTS idx_reval_reg_student
  ON public.revaluation_registrations(student_id);

CREATE INDEX IF NOT EXISTS idx_reval_reg_status
  ON public.revaluation_registrations(status);

CREATE INDEX IF NOT EXISTS idx_reval_reg_payment_status
  ON public.revaluation_registrations(payment_status);

CREATE INDEX IF NOT EXISTS idx_reval_reg_previous
  ON public.revaluation_registrations(previous_revaluation_id);

-- Best Practice: Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_reval_reg_composite
  ON public.revaluation_registrations(institutions_id, examination_session_id, status);

-- Best Practice: Partial index for active revaluations
CREATE INDEX IF NOT EXISTS idx_reval_reg_active
  ON public.revaluation_registrations(institutions_id, status)
  WHERE status NOT IN ('Published', 'Cancelled');

COMMENT ON TABLE public.revaluation_registrations IS 'Core revaluation application tracking';

-- =====================================================
-- 3. REVALUATION MARKS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code VARCHAR(50) NOT NULL,
  examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
  revaluation_registration_id UUID NOT NULL REFERENCES public.revaluation_registrations(id) ON DELETE CASCADE,

  -- Links
  answer_sheet_id UUID,
  examiner_assignment_id UUID REFERENCES public.examiner_assignments(id) ON DELETE SET NULL,
  exam_registration_id UUID NOT NULL REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
  student_dummy_number_id UUID,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,

  -- Marks data
  dummy_number VARCHAR(50) NOT NULL,
  question_wise_marks JSONB,
  total_marks_obtained NUMERIC(10, 2) NOT NULL,
  total_marks_in_words VARCHAR(255),
  marks_out_of NUMERIC(10, 2) NOT NULL,
  percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN marks_out_of > 0 THEN (total_marks_obtained / marks_out_of) * 100
      ELSE 0
    END
  ) STORED,

  -- Evaluation details
  evaluation_date DATE NOT NULL,
  evaluation_time_minutes INTEGER,
  evaluator_remarks TEXT,

  -- Moderation
  is_moderated BOOLEAN DEFAULT false,
  moderated_by UUID,
  moderation_date DATE,
  marks_before_moderation NUMERIC(10, 2),
  marks_after_moderation NUMERIC(10, 2),
  moderation_difference NUMERIC(10, 2) GENERATED ALWAYS AS (
    marks_after_moderation - marks_before_moderation
  ) STORED,
  moderation_remarks TEXT,

  -- Status
  entry_status VARCHAR(50) DEFAULT 'Draft' CHECK (entry_status IN (
    'Draft',
    'Submitted',
    'Verified',
    'Locked',
    'Rejected',
    'Pending Review'
  )),
  submitted_at TIMESTAMPTZ,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  locked_by UUID,
  locked_at TIMESTAMPTZ,

  -- Audit
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- Denormalized
  program_code VARCHAR(50),

  -- Constraints
  UNIQUE(revaluation_registration_id)
);

-- Indexes for marks
CREATE INDEX IF NOT EXISTS idx_reval_marks_institution
  ON public.revaluation_marks(institutions_id);

CREATE INDEX IF NOT EXISTS idx_reval_marks_session
  ON public.revaluation_marks(examination_session_id);

CREATE INDEX IF NOT EXISTS idx_reval_marks_reval_reg
  ON public.revaluation_marks(revaluation_registration_id);

CREATE INDEX IF NOT EXISTS idx_reval_marks_examiner_assignment
  ON public.revaluation_marks(examiner_assignment_id);

CREATE INDEX IF NOT EXISTS idx_reval_marks_entry_status
  ON public.revaluation_marks(entry_status);

-- Best Practice: Composite index
CREATE INDEX IF NOT EXISTS idx_reval_marks_composite
  ON public.revaluation_marks(institutions_id, examination_session_id, entry_status);

COMMENT ON TABLE public.revaluation_marks IS 'Blind evaluation marks entry for revaluations';

-- =====================================================
-- 4. REVALUATION FINAL MARKS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_final_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  institution_code VARCHAR(50) NOT NULL,
  examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
  revaluation_registration_id UUID NOT NULL REFERENCES public.revaluation_registrations(id) ON DELETE CASCADE,
  exam_registration_id UUID NOT NULL REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,

  -- Links
  internal_marks_id UUID,
  revaluation_marks_id UUID REFERENCES public.revaluation_marks(id) ON DELETE CASCADE,
  original_final_marks_id UUID REFERENCES public.final_marks(id) ON DELETE CASCADE,

  -- Internal marks (unchanged from original)
  internal_marks_obtained NUMERIC(10, 2) NOT NULL,
  internal_marks_maximum NUMERIC(10, 2) NOT NULL,
  internal_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN internal_marks_maximum > 0 THEN (internal_marks_obtained / internal_marks_maximum) * 100
      ELSE 0
    END
  ) STORED,

  -- External marks (from revaluation)
  external_marks_obtained NUMERIC(10, 2) NOT NULL,
  external_marks_maximum NUMERIC(10, 2) NOT NULL,
  external_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN external_marks_maximum > 0 THEN (external_marks_obtained / external_marks_maximum) * 100
      ELSE 0
    END
  ) STORED,

  -- Total marks
  total_marks_obtained NUMERIC(10, 2) NOT NULL,
  total_marks_maximum NUMERIC(10, 2) NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL,

  -- Grace marks
  grace_marks NUMERIC(10, 2) DEFAULT 0,
  grace_marks_reason TEXT,
  grace_marks_approved_by UUID,
  grace_marks_approved_date DATE,

  -- Grade
  letter_grade VARCHAR(10),
  grade_points NUMERIC(5, 2),
  grade_description VARCHAR(255),
  credit NUMERIC(5, 2),
  total_grade_points NUMERIC(10, 2),

  -- Pass status
  is_pass BOOLEAN DEFAULT false,
  is_distinction BOOLEAN DEFAULT false,
  is_first_class BOOLEAN DEFAULT false,
  pass_status VARCHAR(50) CHECK (pass_status IN ('Pass', 'Fail', 'Reappear', 'Absent', 'Withheld', 'Expelled')),

  -- Comparison with original
  original_marks_obtained NUMERIC(10, 2),
  original_percentage NUMERIC(5, 2),
  original_grade VARCHAR(10),
  marks_difference NUMERIC(10, 2),
  percentage_difference NUMERIC(5, 2),
  is_better_than_original BOOLEAN DEFAULT false,

  -- Status
  result_status VARCHAR(50) DEFAULT 'Pending' CHECK (result_status IN (
    'Pending',
    'Published',
    'Withheld',
    'Cancelled',
    'Under Review'
  )),
  published_date DATE,
  published_by UUID,

  -- Lock
  is_locked BOOLEAN DEFAULT false,
  locked_by UUID,
  locked_date DATE,

  -- Calculation
  calculated_by UUID,
  calculated_at TIMESTAMPTZ,
  calculation_notes TEXT,

  -- Audit
  remarks TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- Denormalized
  register_number VARCHAR(100),
  program_code VARCHAR(50),

  -- Constraints
  UNIQUE(revaluation_registration_id)
);

-- Indexes for final marks
CREATE INDEX IF NOT EXISTS idx_reval_final_institution
  ON public.revaluation_final_marks(institutions_id);

CREATE INDEX IF NOT EXISTS idx_reval_final_session
  ON public.revaluation_final_marks(examination_session_id);

CREATE INDEX IF NOT EXISTS idx_reval_final_reval_reg
  ON public.revaluation_final_marks(revaluation_registration_id);

CREATE INDEX IF NOT EXISTS idx_reval_final_result_status
  ON public.revaluation_final_marks(result_status);

-- Best Practice: Composite index
CREATE INDEX IF NOT EXISTS idx_reval_final_composite
  ON public.revaluation_final_marks(institutions_id, examination_session_id, result_status);

-- Best Practice: Index for improvement queries
CREATE INDEX IF NOT EXISTS idx_reval_final_improvement
  ON public.revaluation_final_marks(is_better_than_original);

COMMENT ON TABLE public.revaluation_final_marks IS 'Calculated final marks with original vs revaluation comparison';

-- =====================================================
-- Enable RLS (Row Level Security)
-- =====================================================

ALTER TABLE public.revaluation_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revaluation_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revaluation_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revaluation_final_marks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Migration Complete
-- =====================================================
