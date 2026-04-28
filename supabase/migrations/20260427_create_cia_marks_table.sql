-- Create cia_marks table to store CIA assessment marks per learner per round
CREATE TABLE IF NOT EXISTS cia_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL,
  examination_session_id UUID NOT NULL,
  exam_registration_id UUID NOT NULL,
  student_id UUID NOT NULL,
  cia_setting_id UUID NOT NULL,
  cia_round INTEGER NOT NULL,
  cia_round_name TEXT,

  -- Component marks (JSON to support flexible component list)
  component_marks JSONB DEFAULT '{}',

  -- Total marks for the round
  round_total_marks DECIMAL(5, 2),

  -- AI Tools Usage score (new assessment type)
  ai_tools_score DECIMAL(5, 2),
  ai_tools_max_marks DECIMAL(5, 2),

  -- Metadata
  submission_date DATE,
  submission_time TIMESTAMP DEFAULT NOW(),
  submitted_by TEXT,
  is_locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMP,
  locked_by TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT fk_cia_marks_institutions
    FOREIGN KEY (institutions_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cia_marks_session
    FOREIGN KEY (examination_session_id) REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cia_marks_exam_registration
    FOREIGN KEY (exam_registration_id) REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cia_marks_setting
    FOREIGN KEY (cia_setting_id) REFERENCES public.cia_entry_settings(id) ON DELETE CASCADE,

  -- Unique constraint: one entry per learner per round per setting
  UNIQUE(cia_setting_id, cia_round, exam_registration_id)
);

-- Indexes for common queries
CREATE INDEX idx_cia_marks_institution ON cia_marks(institutions_id);
CREATE INDEX idx_cia_marks_session ON cia_marks(examination_session_id);
CREATE INDEX idx_cia_marks_setting_round ON cia_marks(cia_setting_id, cia_round);
CREATE INDEX idx_cia_marks_student ON cia_marks(student_id);
CREATE INDEX idx_cia_marks_exam_reg ON cia_marks(exam_registration_id);

-- Enable RLS (RLS policies to be added with role-institution mapping)
-- ALTER TABLE cia_marks ENABLE ROW LEVEL SECURITY;

-- Audit trail trigger
CREATE TABLE IF NOT EXISTS cia_marks_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cia_mark_id UUID,
  cia_setting_id UUID,
  cia_round INTEGER,
  action TEXT NOT NULL,
  before_value JSONB,
  after_value JSONB,
  performed_by TEXT,
  performed_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_cia_marks_audit_mark
    FOREIGN KEY (cia_mark_id) REFERENCES public.cia_marks(id) ON DELETE SET NULL
);

CREATE INDEX idx_cia_marks_audit_mark ON cia_marks_audit(cia_mark_id);
CREATE INDEX idx_cia_marks_audit_setting ON cia_marks_audit(cia_setting_id, cia_round);
