-- ============================================================================
-- Migration: 20260306_create_bos_tables.sql
-- Description: Board of Studies (BoS) module tables for JKKN autonomous colleges
-- Created: 2026-03-06
-- References: board, courses, departments, institutions (existing COE tables)
-- ============================================================================

-- ── bos_external_experts ────────────────────────────────────────────────────
-- Master directory of external experts reusable across departments and years.
-- Categories follow UGC BoS composition norms for autonomous colleges.

CREATE TABLE bos_external_experts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  title               VARCHAR(50),               -- Dr., Prof., Mr., Ms.
  designation         VARCHAR(255),              -- e.g., "Assistant Professor"
  institution_name    VARCHAR(255),              -- Employing institution (if academic)
  department_name     VARCHAR(255),
  address             TEXT,
  contact_no          VARCHAR(20),
  email               VARCHAR(255),
  category            VARCHAR(50) NOT NULL CHECK (category IN (
    'university_nominee', 'subject_expert', 'industry_expert', 'alumni'
  )),
  specialization      TEXT,
  qualifications      TEXT,                      -- e.g., "MCA, M.Phil, ME(CSE), Ph.D."
  is_active           BOOLEAN DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bos_experts_institutions ON bos_external_experts(institutions_id);
CREATE INDEX idx_bos_experts_category ON bos_external_experts(category);
CREATE INDEX idx_bos_experts_is_active ON bos_external_experts(is_active);

-- ── bos_compositions ────────────────────────────────────────────────────────
-- Formal constitution of a BoS for a specific board and 3-year term.
-- UGC norm: BoS composition must be constituted/reconstituted every 3 years.

CREATE TABLE bos_compositions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  composition_title   VARCHAR(255) NOT NULL,     -- e.g., "2024-2027 Composition"
  term_start_date     DATE NOT NULL,
  term_end_date       DATE NOT NULL,             -- typically term_start + 3 years
  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"
  is_active           BOOLEAN DEFAULT true,      -- only one active composition per board
  constituted_by      UUID,                      -- staff ID who constituted this BoS
  ratified_by_gc      BOOLEAN DEFAULT false,     -- Governing Council ratified
  ratified_date       DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, term_start_date)
);

CREATE INDEX idx_bos_compositions_institutions ON bos_compositions(institutions_id);
CREATE INDEX idx_bos_compositions_board ON bos_compositions(board_id);
CREATE INDEX idx_bos_compositions_is_active ON bos_compositions(is_active);

-- ── bos_members ─────────────────────────────────────────────────────────────
-- Individual members belonging to a composition.
-- Supports both internal staff (staff_id) and external experts (expert_id).
-- Exactly one of staff_id or expert_id must be set (enforced by CHECK constraint).

CREATE TABLE bos_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  composition_id      UUID NOT NULL REFERENCES bos_compositions(id) ON DELETE CASCADE,
  member_type         VARCHAR(30) NOT NULL CHECK (member_type IN (
    'chairman', 'internal_member', 'university_nominee',
    'subject_expert', 'industry_expert', 'alumni'
  )),
  -- Internal members (faculty/staff from MyJKKN)
  staff_id            UUID,                      -- NULL for external members
  staff_name          VARCHAR(255),              -- denormalized for display
  staff_designation   VARCHAR(255),
  -- External members
  expert_id           UUID REFERENCES bos_external_experts(id),
  -- Display fields (denormalized for fast rendering without extra joins)
  display_name        VARCHAR(255) NOT NULL,
  display_designation VARCHAR(255),
  display_institution VARCHAR(255),
  address             TEXT,
  contact_no          VARCHAR(20),
  email               VARCHAR(255),
  sort_order          INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT true,
  joined_date         DATE,
  left_date           DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT bos_members_source_check CHECK (
    (staff_id IS NOT NULL AND expert_id IS NULL) OR
    (staff_id IS NULL AND expert_id IS NOT NULL)
  )
);

CREATE INDEX idx_bos_members_composition ON bos_members(composition_id);
CREATE INDEX idx_bos_members_institutions ON bos_members(institutions_id);
CREATE INDEX idx_bos_members_expert ON bos_members(expert_id);
CREATE INDEX idx_bos_members_member_type ON bos_members(member_type);

-- ── bos_meetings ─────────────────────────────────────────────────────────────
-- BoS meeting records with full 8-state machine lifecycle.
-- State: draft → principal_approved → noticed → expert_invited
--        → completed → minutes_drafted → minutes_approved → ratified

CREATE TABLE bos_meetings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id            UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  composition_id      UUID NOT NULL REFERENCES bos_compositions(id),
  meeting_number      INTEGER NOT NULL,          -- sequential per board per academic_year
  academic_year       VARCHAR(10) NOT NULL,      -- e.g., "2024-25"
  meeting_title       VARCHAR(255),              -- e.g., "Second Meeting of PG CS BoS"
  meeting_type        VARCHAR(30) NOT NULL CHECK (meeting_type IN (
    'regular', 'special', 'emergency', 'online'
  )) DEFAULT 'regular',
  status              VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'principal_approved', 'noticed', 'expert_invited',
    'completed', 'minutes_drafted', 'minutes_approved', 'ratified'
  )),
  -- Scheduling
  scheduled_date      DATE,
  scheduled_time      TIME,
  venue               VARCHAR(255),
  -- Conduct
  actual_date         DATE,
  actual_start_time   TIME,
  actual_end_time     TIME,
  quorum_met          BOOLEAN,
  -- Approval trail
  submitted_for_approval_at  TIMESTAMPTZ,
  principal_approved_at      TIMESTAMPTZ,
  principal_approved_by      UUID,               -- staff_id of principal
  -- Ratification
  ratified_by_ac      BOOLEAN DEFAULT false,     -- Academic Council ratified
  ratified_date       DATE,
  -- Agenda & Minutes
  agenda_text         TEXT,
  minutes_summary     TEXT,
  minutes_drafted_at  TIMESTAMPTZ,
  minutes_approved_at TIMESTAMPTZ,
  minutes_approved_by UUID,
  -- Signature page
  signature_page_url  TEXT,
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, academic_year, meeting_number)
);

CREATE INDEX idx_bos_meetings_institutions ON bos_meetings(institutions_id);
CREATE INDEX idx_bos_meetings_board ON bos_meetings(board_id);
CREATE INDEX idx_bos_meetings_composition ON bos_meetings(composition_id);
CREATE INDEX idx_bos_meetings_status ON bos_meetings(status);
CREATE INDEX idx_bos_meetings_academic_year ON bos_meetings(academic_year);

-- ── bos_meeting_attendees ────────────────────────────────────────────────────
-- Attendance record per member per meeting.
-- ta_da_eligible flag is set for external experts to trigger TA/DA claim creation.

CREATE TABLE bos_meeting_attendees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES bos_members(id),
  attendance_status   VARCHAR(20) NOT NULL CHECK (attendance_status IN (
    'present', 'absent', 'leave_of_absence'
  )) DEFAULT 'absent',
  absence_reason      TEXT,
  ta_da_eligible      BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);

CREATE INDEX idx_bos_attendees_meeting ON bos_meeting_attendees(meeting_id);
CREATE INDEX idx_bos_attendees_member ON bos_meeting_attendees(member_id);

-- ── bos_agenda_items ─────────────────────────────────────────────────────────
-- Individual agenda items with resolution text and action assignment.

CREATE TABLE bos_agenda_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  item_number         INTEGER NOT NULL,
  item_title          VARCHAR(255) NOT NULL,     -- e.g., "Framing of Syllabus for 2024-25"
  item_description    TEXT,
  discussion_notes    TEXT,
  resolution_text     TEXT,
  resolution_status   VARCHAR(20) CHECK (resolution_status IN (
    'pending', 'in_progress', 'completed', 'deferred', 'not_applicable'
  )),
  responsible_person  VARCHAR(255),
  target_date         DATE,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, item_number)
);

CREATE INDEX idx_bos_agenda_meeting ON bos_agenda_items(meeting_id);

-- ── bos_resolution_actions ───────────────────────────────────────────────────
-- Action tracking for follow-up on resolutions (Action Taken Report).

CREATE TABLE bos_resolution_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  agenda_item_id      UUID NOT NULL REFERENCES bos_agenda_items(id) ON DELETE CASCADE,
  action_description  TEXT NOT NULL,
  action_date         DATE,
  action_by           VARCHAR(255),
  remarks             TEXT,
  status              VARCHAR(20) NOT NULL CHECK (status IN (
    'pending', 'in_progress', 'completed'
  )) DEFAULT 'pending',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bos_resolution_actions_agenda ON bos_resolution_actions(agenda_item_id);

-- ── bos_course_reviews ───────────────────────────────────────────────────────
-- Courses reviewed and formally approved/rejected/deferred in a meeting.
-- Provides the NAAC syllabus approval audit trail.

CREATE TABLE bos_course_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  agenda_item_id      UUID REFERENCES bos_agenda_items(id),
  course_id           UUID NOT NULL,             -- references COE courses.id
  course_code         VARCHAR(50) NOT NULL,      -- denormalized
  course_name         VARCHAR(255) NOT NULL,     -- denormalized
  review_action       VARCHAR(30) NOT NULL CHECK (review_action IN (
    'approved', 'approved_with_changes', 'rejected', 'deferred', 'noted'
  )),
  changes_suggested   TEXT,
  remarks             TEXT,
  regulation_code     VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bos_course_reviews_meeting ON bos_course_reviews(meeting_id);
CREATE INDEX idx_bos_course_reviews_course ON bos_course_reviews(course_id);

-- ── bos_ta_da_claims ─────────────────────────────────────────────────────────
-- TA/DA reimbursement tracking for external experts per meeting.
-- total_amount is a GENERATED column (database computes it automatically).

CREATE TABLE bos_ta_da_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES bos_members(id),
  expert_id           UUID NOT NULL REFERENCES bos_external_experts(id),
  -- Travel
  travel_mode         VARCHAR(50),               -- bus, train, air, own vehicle
  travel_from         VARCHAR(255),
  travel_to           VARCHAR(255),
  travel_amount       NUMERIC(10,2) DEFAULT 0,
  -- Daily allowance
  da_days             NUMERIC(4,1) DEFAULT 1,
  da_rate             NUMERIC(8,2) DEFAULT 0,
  da_amount           NUMERIC(10,2) DEFAULT 0,
  -- Other
  other_amount        NUMERIC(10,2) DEFAULT 0,
  other_description   TEXT,
  -- Computed: database automatically keeps this in sync
  total_amount        NUMERIC(10,2) GENERATED ALWAYS AS (
    travel_amount + da_amount + other_amount
  ) STORED,
  -- Status
  claim_status        VARCHAR(20) NOT NULL CHECK (claim_status IN (
    'draft', 'submitted', 'approved', 'paid'
  )) DEFAULT 'draft',
  bill_number         VARCHAR(50),
  payment_date        DATE,
  payment_reference   VARCHAR(100),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);

CREATE INDEX idx_bos_ta_da_meeting ON bos_ta_da_claims(meeting_id);
CREATE INDEX idx_bos_ta_da_expert ON bos_ta_da_claims(expert_id);

-- ── bos_documents ────────────────────────────────────────────────────────────
-- Generated document metadata: notices, call letters, minutes PDFs.
-- Actual files stored in Supabase Storage; this table stores the metadata & URL.

CREATE TABLE bos_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  document_type       VARCHAR(50) NOT NULL CHECK (document_type IN (
    'meeting_notice', 'call_letter', 'minutes_of_meeting',
    'composition_certificate', 'syllabus_approval_certificate',
    'ta_da_bill', 'action_taken_report'
  )),
  file_name           VARCHAR(255) NOT NULL,
  file_url            TEXT NOT NULL,
  file_format         VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx')),
  recipient_member_id UUID REFERENCES bos_members(id),  -- NULL = general (non-member-specific) document
  generated_at        TIMESTAMPTZ DEFAULT now(),
  generated_by        UUID,
  is_latest           BOOLEAN DEFAULT true
);

CREATE INDEX idx_bos_documents_meeting ON bos_documents(meeting_id);
CREATE INDEX idx_bos_documents_type ON bos_documents(document_type);
