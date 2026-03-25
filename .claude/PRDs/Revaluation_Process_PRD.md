# Product Requirements Document: Revaluation Process Module

**Version:** 1.0
**Date:** 2026-01-23
**Project:** JKKN COE (Controller of Examination)
**Module:** Revaluation Management System

---

## Executive Summary

The Revaluation Process Module enables students to apply for re-evaluation of their examination marks when they believe the original evaluation was incorrect or incomplete. This module supports up to 3 sequential revaluation attempts per course, maintains complete audit trails, automates examiner assignments, and ensures unbiased evaluation through blind re-evaluation processes.

### Key Features
- **Sequential Revaluations**: Students can request up to 3 revaluation attempts per course
- **Blind Re-evaluation**: Examiners evaluate without seeing previous marks
- **Best of Both**: System maintains both original and revaluation marks, uses whichever is better
- **Complete History**: Full audit trail of all revaluation attempts and mark changes
- **Automated Workflows**: Streamlined approval, assignment, and publishing processes
- **Comprehensive Reports**: Statistics, course analysis, examiner comparison, financial summaries

---

## Table of Contents

1. [Business Context](#business-context)
2. [User Stories](#user-stories)
3. [Functional Requirements](#functional-requirements)
4. [Database Schema](#database-schema)
5. [API Specifications](#api-specifications)
6. [UI/UX Specifications](#ui-ux-specifications)
7. [Business Rules & Validation](#business-rules--validation)
8. [Workflows](#workflows)
9. [Integration Points](#integration-points)
10. [Reports & Analytics](#reports--analytics)
11. [Non-Functional Requirements](#non-functional-requirements)
12. [Implementation Phases](#implementation-phases)

---

## 1. Business Context

### 1.1 Problem Statement

After examination results are published, students may feel their answers were under-marked or incorrectly evaluated. Currently, there's no systematic way to handle revaluation requests, track revaluation progress, or maintain a complete history of mark changes.

### 1.2 Solution Overview

A comprehensive revaluation management system that:
- Allows students to apply for course revaluations after results are published
- Supports up to 3 sequential revaluation attempts per course
- Assigns revaluations to different examiners for unbiased evaluation
- Maintains complete history of original and all revaluation marks
- Automatically recalculates grades and GPA/CGPA based on best marks
- Generates before/after galley reports for audit and compliance

### 1.3 Success Metrics

- **Efficiency**: Reduce revaluation processing time by 50%
- **Transparency**: 100% visibility into revaluation status for all stakeholders
- **Accuracy**: Zero errors in mark updates and grade recalculation
- **Audit**: Complete traceable history of all mark changes
- **Student Satisfaction**: Improved trust in evaluation fairness

---

## 2. User Stories

### 2.1 COE Administrator

**As a COE Administrator, I want to:**

1. **Create Revaluation Applications**
   - Select institution → exam session → student registration → course(s)
   - Enter fee payment details and proof
   - Create application on behalf of student (offline requests)

2. **Manage Revaluation Workflow**
   - View all revaluation applications with filters (institution, session, status, course)
   - Verify payment and approve applications
   - Assign revaluations to qualified examiners
   - Track revaluation progress in real-time
   - Bulk approve, assign, or update status for multiple applications

3. **Publish Revaluation Results**
   - Review revaluation marks before publication
   - Compare original vs revaluation marks side-by-side
   - Approve mark updates (system uses best of original/revaluation)
   - Generate revised final marks and grades
   - Publish updated results to students

4. **Generate Reports**
   - Revaluation statistics (applications, approvals, mark changes)
   - Course-wise analysis (which courses have most revaluations)
   - Examiner-wise comparison (original vs revaluation examiner patterns)
   - Financial summary (fees collected, pending, refunds)

### 2.2 Examiner

**As an Examiner, I want to:**

1. **Receive Revaluation Assignments**
   - Be notified of revaluation assignments
   - View assigned revaluations in my dashboard
   - Access answer sheets for re-evaluation

2. **Enter Revaluation Marks**
   - Evaluate answer sheets without seeing previous marks (blind evaluation)
   - Enter question-wise marks just like regular evaluation
   - Add evaluation remarks if needed
   - Submit marks for review

3. **Track My Revaluation Work**
   - See pending, completed, and submitted revaluations
   - View turnaround time for each assignment

### 2.3 Student (Future Phase)

**As a Student, I want to:**

1. **Apply for Revaluation**
   - View published results
   - Select courses for revaluation
   - Provide reason for revaluation request
   - Upload payment proof
   - Submit application

2. **Track Application Status**
   - View application status (Applied, Approved, Evaluated, Published)
   - Get in-system notifications on status changes
   - See updated marks after revaluation completion

3. **View Revaluation History**
   - See all my revaluation applications
   - Compare original vs revaluation marks
   - Understand impact on grades and GPA/CGPA

---

## 3. Functional Requirements

### 3.1 Revaluation Application

#### FR-101: Create Revaluation Application
**Priority:** High
**Description:** COE admin creates revaluation application on behalf of student

**Acceptance Criteria:**
- ✅ Select institution, exam session, student registration
- ✅ Display all courses from selected exam registration
- ✅ Multi-select courses for revaluation
- ✅ Only show courses where final marks are published
- ✅ Calculate and display fee based on institution fee structure
- ✅ Enter payment transaction ID and date
- ✅ Enter reason for revaluation (text field, max 500 chars)
- ✅ Validate payment before allowing application creation
- ✅ Create entry in `revaluation_registrations` table
- ✅ Update `exam_registrations.revaluation_attempts` array
- ✅ Set initial status to 'Payment Pending' or 'Applied'

**Validations:**
- Cannot apply if course already has 3 revaluation attempts
- Cannot apply if previous revaluation for same course is pending/in-progress
- Cannot apply if original result is not published
- Must provide valid payment details

#### FR-102: View Revaluation Applications
**Priority:** High
**Description:** View and filter revaluation applications

**Acceptance Criteria:**
- ✅ Display applications in data table with pagination
- ✅ Filter by institution, exam session, status, course, student
- ✅ Search by student register number, student name
- ✅ Show application details: student, course, attempt number, status, dates
- ✅ Show payment status and fee amount
- ✅ Click to view full application details

**Table Columns:**
- Application ID
- Student Register Number / Name
- Institution
- Exam Session
- Course Code / Title
- Attempt Number (1/2/3)
- Status
- Fee Amount / Payment Status
- Applied Date
- Assigned Examiner (if any)
- Actions (Approve, Assign, View)

#### FR-103: Approve Revaluation Application
**Priority:** High
**Description:** Verify payment and approve application

**Acceptance Criteria:**
- ✅ View payment details (transaction ID, date, amount)
- ✅ Verify payment outside system
- ✅ Approve or reject application
- ✅ Update status to 'Approved' on approval
- ✅ Update status to 'Rejected' with reason on rejection
- ✅ Record who approved and when
- ✅ Support bulk approval for multiple applications
- ✅ Cannot approve if payment not verified

### 3.2 Examiner Assignment

#### FR-201: Assign Examiner to Revaluation
**Priority:** High
**Description:** Assign qualified examiner for revaluation

**Acceptance Criteria:**
- ✅ Select examiner from qualified examiner list for the course
- ✅ Exclude original examiner from selection (must be different)
- ✅ Assign examiner and update status to 'Assigned'
- ✅ Create entry in `examiner_assignments` table with type='revaluation'
- ✅ Link to answer sheet via `answer_sheets` table
- ✅ Set assignment date and evaluation deadline
- ✅ Notify examiner of new assignment
- ✅ Support bulk assignment (assign multiple revaluations to same examiner)

**Business Rules:**
- Revaluation examiner MUST be different from original examiner
- Examiner must be qualified for the subject/course
- Revaluation turnaround time: 30 days from assignment

#### FR-202: View Examiner Assignments
**Priority:** Medium
**Description:** Examiner views assigned revaluations

**Acceptance Criteria:**
- ✅ Display assigned revaluations in examiner dashboard
- ✅ Filter by status (Pending, In Progress, Completed)
- ✅ Show course, student dummy number, assignment date, deadline
- ✅ Indicate revaluation vs regular evaluation
- ✅ Click to access marks entry interface

### 3.3 Revaluation Marks Entry

#### FR-301: Enter Revaluation Marks
**Priority:** High
**Description:** Examiner enters marks for revaluation (blind evaluation)

**Acceptance Criteria:**
- ✅ Access answer sheet for evaluation
- ✅ Enter question-wise marks (if applicable)
- ✅ Enter total marks obtained
- ✅ Cannot see original marks or previous revaluation marks (blind)
- ✅ Validation: marks must be within 0 to maximum marks
- ✅ Enter evaluator remarks (optional)
- ✅ Save as draft or submit for verification
- ✅ Create/update entry in `revaluation_marks` table
- ✅ Interface identical to regular marks entry

**Revaluation Marks Interface:**
- Displays: Student dummy number, course, exam session, attempt number
- Hides: Student identity, original marks, previous revaluation marks
- Shows: Answer sheet (scanned copy or reference)
- Input: Question-wise marks (JSON), total marks, remarks
- Actions: Save Draft, Submit, Cancel

#### FR-302: Verify Revaluation Marks
**Priority:** Medium
**Description:** Admin or senior examiner verifies revaluation marks

**Acceptance Criteria:**
- ✅ View submitted revaluation marks
- ✅ Verify marks are within valid range
- ✅ Verify mark totaling is correct
- ✅ Approve or send back for correction
- ✅ Update status to 'Verified' on approval
- ✅ Record who verified and when

#### FR-303: Lock Revaluation Marks
**Priority:** High
**Description:** Lock marks after verification to prevent changes

**Acceptance Criteria:**
- ✅ Lock marks after verification
- ✅ Update status to 'Locked'
- ✅ Prevent any further edits once locked
- ✅ Record who locked and when
- ✅ Only super_admin can unlock if needed

### 3.4 Final Marks Update

#### FR-401: Generate Revaluation Final Marks
**Priority:** High
**Description:** Calculate final marks using revaluation marks

**Acceptance Criteria:**
- ✅ Fetch revaluation marks from `revaluation_marks`
- ✅ Fetch original marks from `marks_entry`
- ✅ Fetch internal marks (unchanged)
- ✅ Calculate new external marks from revaluation
- ✅ Calculate new total marks = internal + revaluation external + grace (if any)
- ✅ Calculate new percentage
- ✅ Create entry in `revaluation_final_marks` table
- ✅ Store original marks for comparison
- ✅ Automatic grade assignment based on new percentage
- ✅ Automatic pass/fail determination
- ✅ Calculate GPA/CGPA impact

**Formula:**
```
revaluation_total = internal_marks (original) + external_marks (revaluation) + grace_marks
revaluation_percentage = (revaluation_total / total_maximum) * 100
```

#### FR-402: Compare and Apply Best Marks
**Priority:** High
**Description:** Compare original vs revaluation marks and use whichever is better

**Acceptance Criteria:**
- ✅ Compare original_final_marks vs revaluation_final_marks
- ✅ For each metric: total_marks, percentage, grade_points, pass_status
- ✅ Determine which is better for student:
  - Higher total marks → better
  - Higher percentage → better
  - Better grade (higher grade_points) → better
  - Pass > Fail → better
- ✅ Flag the better result as 'active' for transcripts
- ✅ Store both results in database for audit
- ✅ Update semester results with better marks

**Best Marks Logic:**
```
IF revaluation_percentage > original_percentage THEN
  use_revaluation = TRUE
ELSE IF revaluation_percentage == original_percentage AND revaluation_grade_points >= original_grade_points THEN
  use_revaluation = TRUE
ELSE
  use_revaluation = FALSE
END IF
```

#### FR-403: Update Semester Results
**Priority:** High
**Description:** Recalculate GPA/CGPA based on best marks

**Acceptance Criteria:**
- ✅ Update semester results with best marks (original or revaluation)
- ✅ Recalculate semester GPA
- ✅ Recalculate cumulative CGPA
- ✅ Update pass/fail status for semester
- ✅ Update backlog courses if changed from fail to pass
- ✅ Generate updated grade sheet
- ✅ Maintain history of GPA changes

### 3.5 Result Publication

#### FR-501: Review Revaluation Results
**Priority:** High
**Description:** Admin reviews revaluation results before publication

**Acceptance Criteria:**
- ✅ View side-by-side comparison:
  - Original marks vs Revaluation marks
  - Original grade vs Revaluation grade
  - Mark difference (increase/decrease/no change)
  - GPA impact
- ✅ Filter by institution, session, course, mark change status
- ✅ Export comparison report to Excel
- ✅ Flag any anomalies (e.g., marks decreased significantly)

#### FR-502: Publish Revaluation Results
**Priority:** High
**Description:** Publish revaluation results to students

**Acceptance Criteria:**
- ✅ Bulk publish multiple revaluation results
- ✅ Update status to 'Published'
- ✅ Record publication date and who published
- ✅ Update final_marks table with best marks
- ✅ Update semester_results table
- ✅ Generate updated galley reports
- ✅ Send in-system notifications to affected students
- ✅ Lock published results (prevent further changes)

#### FR-503: Generate Revaluation Galleys
**Priority:** High
**Description:** Generate before/after galley reports

**Acceptance Criteria:**
- ✅ Generate "Before Revaluation" galley (original marks)
- ✅ Generate "After Revaluation" galley (updated marks)
- ✅ Highlight changes (mark increases/decreases, grade changes)
- ✅ Include summary statistics:
  - Total revaluations processed
  - Mark increases / decreases / no change
  - Pass to fail / Fail to pass changes
  - Average mark change
- ✅ Export as PDF and Excel

### 3.6 Sequential Revaluations

#### FR-601: Apply for Second Revaluation
**Priority:** High
**Description:** Student applies for Revaluation 2 after Revaluation 1 results

**Acceptance Criteria:**
- ✅ Can only apply after Revaluation 1 is published
- ✅ Must pay separate fee for Revaluation 2
- ✅ Same workflow as Revaluation 1
- ✅ Revaluation 2 examiner must be different from both original AND Revaluation 1 examiner
- ✅ Revaluation 2 evaluation is blind (doesn't see Reval 1 marks)
- ✅ Update `exam_registrations.revaluation_attempts` array [1, 2]

#### FR-602: Apply for Third Revaluation
**Priority:** Medium
**Description:** Student applies for Revaluation 3 (final attempt)

**Acceptance Criteria:**
- ✅ Can only apply after Revaluation 2 is published
- ✅ Must pay separate fee for Revaluation 3
- ✅ Same workflow as previous revaluations
- ✅ Revaluation 3 examiner must be different from original, Reval 1, and Reval 2 examiners
- ✅ Revaluation 3 is FINAL - no further revaluations allowed
- ✅ Update `exam_registrations.revaluation_attempts` array [1, 2, 3]
- ✅ System enforces 3-attempt maximum

#### FR-603: Chain of Revaluations
**Priority:** High
**Description:** Track complete chain of revaluation attempts

**Acceptance Criteria:**
- ✅ Store all revaluation attempts in database
- ✅ Link Revaluation 2 to Revaluation 1 via `previous_revaluation_id`
- ✅ Link Revaluation 3 to Revaluation 2 via `previous_revaluation_id`
- ✅ Maintain complete history: Original → Reval 1 → Reval 2 → Reval 3
- ✅ For final marks, always use best of ALL attempts (original + all revaluations)

### 3.7 Bulk Operations

#### FR-701: Bulk Application Approval
**Priority:** Medium
**Description:** Approve multiple applications at once

**Acceptance Criteria:**
- ✅ Select multiple applications from list (checkboxes)
- ✅ Bulk approve selected applications
- ✅ Verify all selected have valid payment
- ✅ Update status to 'Approved' for all
- ✅ Show success/error summary

#### FR-702: Bulk Examiner Assignment
**Priority:** Medium
**Description:** Assign multiple revaluations to same examiner

**Acceptance Criteria:**
- ✅ Select multiple approved applications
- ✅ Select one examiner to assign all
- ✅ Validate examiner is qualified for all selected courses
- ✅ Validate examiner is different from original for all
- ✅ Create examiner assignments for all
- ✅ Update status to 'Assigned' for all

#### FR-703: Bulk Status Update
**Priority:** Low
**Description:** Update status for multiple applications

**Acceptance Criteria:**
- ✅ Select multiple applications
- ✅ Choose new status from dropdown
- ✅ Apply status to all selected
- ✅ Validate status transition is valid

#### FR-704: Export/Import Revaluation List
**Priority:** Medium
**Description:** Export applications to Excel, import updates

**Acceptance Criteria:**
- ✅ Export applications to Excel with all fields
- ✅ Include columns for offline updates (examiner assignment, status)
- ✅ Import updated Excel file
- ✅ Validate all data before import
- ✅ Show preview of changes before confirming
- ✅ Apply updates in bulk

### 3.8 Reporting & Analytics

#### FR-801: Revaluation Statistics Dashboard
**Priority:** Medium
**Description:** Overview of revaluation metrics

**Acceptance Criteria:**
- ✅ Total applications (by institution, session, course)
- ✅ Approval rate
- ✅ Mark change statistics:
  - Average mark increase/decrease
  - Percentage of no change
  - Max mark increase/decrease
- ✅ Pass rate improvement after revaluation
- ✅ Turnaround time metrics
- ✅ Charts: Applications over time, mark changes distribution

#### FR-802: Course-wise Analysis
**Priority:** Medium
**Description:** Analyze revaluation patterns by course

**Acceptance Criteria:**
- ✅ Table: Course → Total revaluations → Avg mark change → Pass improvement
- ✅ Identify courses with most revaluation requests
- ✅ Identify courses with highest mark changes
- ✅ Export to Excel

#### FR-803: Examiner-wise Comparison
**Priority:** Low
**Description:** Compare original vs revaluation examiner patterns

**Acceptance Criteria:**
- ✅ Table: Original Examiner → Revaluation Examiner → Avg mark difference
- ✅ Identify examiners whose marks are frequently increased in revaluation
- ✅ Identify examiners whose marks are frequently decreased
- ✅ Helps identify evaluation bias or inconsistencies
- ✅ Export to Excel

#### FR-804: Financial Summary
**Priority:** High
**Description:** Track revaluation fees

**Acceptance Criteria:**
- ✅ Total fees collected (by institution, session, attempt number)
- ✅ Pending payments
- ✅ Payment verification rate
- ✅ Refunds issued (if any)
- ✅ Revenue by time period
- ✅ Export to Excel

---

## 4. Database Schema

### 4.1 New Tables

#### 4.1.1 `revaluation_registrations`

Stores revaluation applications submitted by students.

```sql
CREATE TABLE public.revaluation_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  examination_session_id UUID NOT NULL REFERENCES examination_sessions(id) ON DELETE CASCADE,
  exam_registration_id UUID NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,

  -- Revaluation Details
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number BETWEEN 1 AND 3),
  previous_revaluation_id UUID REFERENCES revaluation_registrations(id) ON DELETE SET NULL,

  -- Application Info
  application_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_for_revaluation TEXT,

  -- Fee & Payment
  fee_amount NUMERIC(10, 2) NOT NULL,
  payment_transaction_id VARCHAR(100),
  payment_date DATE,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Verified', 'Rejected')),
  payment_verified_by UUID REFERENCES auth.users(id),
  payment_verified_date TIMESTAMP WITH TIME ZONE,

  -- Workflow Status
  status VARCHAR(50) NOT NULL DEFAULT 'Applied' CHECK (status IN (
    'Applied', 'Payment Pending', 'Payment Verified', 'Approved',
    'Rejected', 'Assigned', 'In Progress', 'Evaluated',
    'Verified', 'Published', 'Cancelled'
  )),

  -- Assignment
  examiner_assignment_id UUID REFERENCES examiner_assignments(id),
  assigned_date TIMESTAMP WITH TIME ZONE,
  evaluation_deadline DATE,

  -- Approval
  approved_by UUID REFERENCES auth.users(id),
  approved_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,

  -- Publication
  published_by UUID REFERENCES auth.users(id),
  published_date TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),

  -- Denormalized fields for easy access
  student_register_number VARCHAR NOT NULL,
  student_name VARCHAR NOT NULL,
  course_code VARCHAR NOT NULL,
  course_title VARCHAR NOT NULL,
  session_code VARCHAR NOT NULL,
  institution_code VARCHAR NOT NULL,

  CONSTRAINT unique_revaluation_attempt UNIQUE (exam_registration_id, course_id, attempt_number)
);

-- Indexes
CREATE INDEX idx_reval_reg_institution ON revaluation_registrations(institutions_id);
CREATE INDEX idx_reval_reg_session ON revaluation_registrations(examination_session_id);
CREATE INDEX idx_reval_reg_student ON revaluation_registrations(student_id);
CREATE INDEX idx_reval_reg_course ON revaluation_registrations(course_id);
CREATE INDEX idx_reval_reg_status ON revaluation_registrations(status);
CREATE INDEX idx_reval_reg_payment_status ON revaluation_registrations(payment_status);
CREATE INDEX idx_reval_reg_attempt ON revaluation_registrations(attempt_number);
CREATE INDEX idx_reval_reg_exam_registration ON revaluation_registrations(exam_registration_id);
CREATE INDEX idx_reval_reg_previous ON revaluation_registrations(previous_revaluation_id) WHERE previous_revaluation_id IS NOT NULL;
```

#### 4.1.2 `revaluation_marks`

Stores marks entered during revaluation (similar to marks_entry).

```sql
CREATE TABLE public.revaluation_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  examination_session_id UUID NOT NULL REFERENCES examination_sessions(id) ON DELETE CASCADE,
  revaluation_registration_id UUID NOT NULL REFERENCES revaluation_registrations(id) ON DELETE CASCADE,

  -- Links to existing tables
  answer_sheet_id UUID REFERENCES answer_sheets(id) ON DELETE CASCADE,
  examiner_assignment_id UUID REFERENCES examiner_assignments(id) ON DELETE RESTRICT,
  exam_registration_id UUID NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
  student_dummy_number_id UUID REFERENCES student_dummy_numbers(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,

  -- Marks Data
  dummy_number VARCHAR(50) NOT NULL,
  question_wise_marks JSONB,
  total_marks_obtained NUMERIC(5, 2) NOT NULL CHECK (total_marks_obtained >= 0),
  total_marks_in_words VARCHAR(255) NOT NULL,
  marks_out_of NUMERIC(5, 2) NOT NULL CHECK (marks_out_of > 0),
  percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN marks_out_of > 0 THEN ROUND((total_marks_obtained / marks_out_of) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- Evaluation Details
  evaluation_date DATE NOT NULL,
  evaluation_time_minutes INTEGER CHECK (evaluation_time_minutes IS NULL OR evaluation_time_minutes > 0),
  evaluator_remarks TEXT,

  -- Moderation
  is_moderated BOOLEAN DEFAULT FALSE,
  moderated_by UUID REFERENCES auth.users(id),
  moderation_date DATE,
  marks_before_moderation NUMERIC(5, 2),
  marks_after_moderation NUMERIC(5, 2),
  moderation_difference NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN marks_after_moderation IS NOT NULL AND marks_before_moderation IS NOT NULL
      THEN marks_after_moderation - marks_before_moderation
      ELSE NULL
    END
  ) STORED,
  moderation_remarks TEXT,

  -- Status
  entry_status VARCHAR(50) DEFAULT 'Draft' CHECK (entry_status IN (
    'Draft', 'Submitted', 'Verified', 'Locked', 'Rejected', 'Pending Review'
  )),
  submitted_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),

  -- Denormalized
  program_code TEXT,

  CONSTRAINT check_marks_obtained_valid CHECK (total_marks_obtained <= marks_out_of),
  CONSTRAINT check_moderation_consistency CHECK (
    (is_moderated = FALSE AND moderated_by IS NULL AND moderation_date IS NULL) OR
    (is_moderated = TRUE AND moderated_by IS NOT NULL AND moderation_date IS NOT NULL)
  ),
  CONSTRAINT unique_reval_marks_entry UNIQUE (institutions_id, examination_session_id, revaluation_registration_id, student_dummy_number_id, course_id)
);

-- Indexes
CREATE INDEX idx_reval_marks_institution ON revaluation_marks(institutions_id);
CREATE INDEX idx_reval_marks_session ON revaluation_marks(examination_session_id);
CREATE INDEX idx_reval_marks_reval_reg ON revaluation_marks(revaluation_registration_id);
CREATE INDEX idx_reval_marks_course ON revaluation_marks(course_id);
CREATE INDEX idx_reval_marks_student_dummy ON revaluation_marks(student_dummy_number_id);
CREATE INDEX idx_reval_marks_status ON revaluation_marks(entry_status);
CREATE INDEX idx_reval_marks_examiner ON revaluation_marks(examiner_assignment_id);
```

#### 4.1.3 `revaluation_final_marks`

Stores final calculated marks from revaluation (similar to final_marks).

```sql
CREATE TABLE public.revaluation_final_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  examination_session_id UUID NOT NULL REFERENCES examination_sessions(id) ON DELETE CASCADE,
  revaluation_registration_id UUID NOT NULL REFERENCES revaluation_registrations(id) ON DELETE CASCADE,
  exam_registration_id UUID NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,

  -- Links to marks
  internal_marks_id UUID REFERENCES internal_marks(id) ON DELETE SET NULL,
  revaluation_marks_id UUID REFERENCES revaluation_marks(id) ON DELETE SET NULL,
  original_final_marks_id UUID REFERENCES final_marks(id) ON DELETE SET NULL,

  -- Internal Marks (from original - unchanged)
  internal_marks_obtained NUMERIC(5, 2) NOT NULL DEFAULT 0,
  internal_marks_maximum NUMERIC(5, 2) NOT NULL,
  internal_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN internal_marks_maximum > 0 THEN ROUND((internal_marks_obtained / internal_marks_maximum) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- External Marks (from revaluation)
  external_marks_obtained NUMERIC(5, 2) NOT NULL DEFAULT 0,
  external_marks_maximum NUMERIC(5, 2) NOT NULL,
  external_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN external_marks_maximum > 0 THEN ROUND((external_marks_obtained / external_marks_maximum) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- Total Marks
  total_marks_obtained NUMERIC(5, 2) NOT NULL,
  total_marks_maximum NUMERIC(5, 2) NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL,

  -- Grace Marks
  grace_marks NUMERIC(5, 2) DEFAULT 0,
  grace_marks_reason TEXT,
  grace_marks_approved_by UUID REFERENCES auth.users(id),
  grace_marks_approved_date DATE,

  -- Grade
  letter_grade VARCHAR(5),
  grade_points NUMERIC(4, 2) CHECK (grade_points IS NULL OR (grade_points >= 0 AND grade_points <= 10)),
  grade_description VARCHAR(50),
  credit NUMERIC(4, 2),
  total_grade_points NUMERIC(6, 2),

  -- Pass Status
  is_pass BOOLEAN NOT NULL,
  is_distinction BOOLEAN DEFAULT FALSE,
  is_first_class BOOLEAN DEFAULT FALSE,
  pass_status VARCHAR(50) CHECK (pass_status IS NULL OR pass_status IN (
    'Pass', 'Fail', 'Reappear', 'Absent', 'Withheld', 'Expelled'
  )),

  -- Comparison with Original
  original_marks_obtained NUMERIC(5, 2),
  original_percentage NUMERIC(5, 2),
  original_grade VARCHAR(5),
  marks_difference NUMERIC(5, 2),
  percentage_difference NUMERIC(5, 2),
  is_better_than_original BOOLEAN DEFAULT FALSE,

  -- Status
  result_status VARCHAR(50) DEFAULT 'Pending' CHECK (result_status IN (
    'Pending', 'Published', 'Withheld', 'Cancelled', 'Under Review'
  )),
  published_date DATE,
  published_by UUID REFERENCES auth.users(id),

  -- Lock
  is_locked BOOLEAN DEFAULT FALSE,
  locked_by UUID REFERENCES auth.users(id),
  locked_date DATE,

  -- Calculation
  calculated_by UUID REFERENCES auth.users(id),
  calculated_at TIMESTAMP WITH TIME ZONE,
  calculation_notes TEXT,

  -- Audit
  remarks TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),

  -- Denormalized
  register_number TEXT NOT NULL,
  program_code TEXT NOT NULL,

  CONSTRAINT unique_reval_final_marks UNIQUE (institutions_id, revaluation_registration_id, course_offering_id),
  CONSTRAINT check_marks_within_maximum CHECK (
    internal_marks_obtained <= internal_marks_maximum AND
    external_marks_obtained <= external_marks_maximum AND
    total_marks_obtained <= (total_marks_maximum + grace_marks)
  )
);

-- Indexes
CREATE INDEX idx_reval_final_institution ON revaluation_final_marks(institutions_id);
CREATE INDEX idx_reval_final_session ON revaluation_final_marks(examination_session_id);
CREATE INDEX idx_reval_final_student ON revaluation_final_marks(student_id);
CREATE INDEX idx_reval_final_course ON revaluation_final_marks(course_id);
CREATE INDEX idx_reval_final_reval_reg ON revaluation_final_marks(revaluation_registration_id);
CREATE INDEX idx_reval_final_status ON revaluation_final_marks(result_status);
CREATE INDEX idx_reval_final_is_better ON revaluation_final_marks(is_better_than_original);
CREATE INDEX idx_reval_final_marks_diff ON revaluation_final_marks(marks_difference) WHERE marks_difference IS NOT NULL;
```

#### 4.1.4 `revaluation_fee_config`

Stores institution-specific revaluation fee structure.

```sql
CREATE TABLE public.revaluation_fee_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Fee Structure
  attempt_1_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_1_fee >= 0),
  attempt_2_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_2_fee >= 0),
  attempt_3_fee NUMERIC(10, 2) NOT NULL CHECK (attempt_3_fee >= 0),

  -- Optional: Different fees for different course types
  theory_course_fee NUMERIC(10, 2),
  practical_course_fee NUMERIC(10, 2),
  project_course_fee NUMERIC(10, 2),

  -- Validity
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT unique_institution_fee_config UNIQUE (institutions_id, effective_from)
);

CREATE INDEX idx_reval_fee_institution ON revaluation_fee_config(institutions_id);
CREATE INDEX idx_reval_fee_active ON revaluation_fee_config(is_active);
```

### 4.2 Modified Tables

#### 4.2.1 `exam_registrations` - Add revaluation tracking

```sql
-- Add column to track revaluation attempts
ALTER TABLE public.exam_registrations
ADD COLUMN IF NOT EXISTS revaluation_attempts INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Add index
CREATE INDEX IF NOT EXISTS idx_exam_registrations_reval_attempts
ON exam_registrations USING GIN (revaluation_attempts);

COMMENT ON COLUMN exam_registrations.revaluation_attempts IS 'Array of revaluation attempt numbers: [1, 2, 3]';
```

#### 4.2.2 `examiner_assignments` - Add revaluation type

```sql
-- Add column to distinguish revaluation assignments
ALTER TABLE public.examiner_assignments
ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(50) DEFAULT 'regular' CHECK (assignment_type IN ('regular', 'revaluation'));

-- Add reference to revaluation registration
ALTER TABLE public.examiner_assignments
ADD COLUMN IF NOT EXISTS revaluation_registration_id UUID REFERENCES revaluation_registrations(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_type
ON examiner_assignments(assignment_type);

CREATE INDEX IF NOT EXISTS idx_examiner_assignments_reval_reg
ON examiner_assignments(revaluation_registration_id)
WHERE revaluation_registration_id IS NOT NULL;
```

---

## 5. API Specifications

### 5.1 Revaluation Registration APIs

#### 5.1.1 Create Revaluation Application

**Endpoint:** `POST /api/revaluation/registrations`

**Request Body:**
```json
{
  "institutions_id": "uuid",
  "examination_session_id": "uuid",
  "exam_registration_id": "uuid",
  "course_offering_ids": ["uuid1", "uuid2"],
  "reason_for_revaluation": "string",
  "payment_transaction_id": "string",
  "payment_date": "2026-01-15",
  "payment_amount": 500.00
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "exam_registration_id": "uuid",
      "course_id": "uuid",
      "course_code": "CS101",
      "course_title": "Data Structures",
      "attempt_number": 1,
      "fee_amount": 500.00,
      "status": "Payment Pending",
      "application_date": "2026-01-23T10:30:00Z"
    }
  ],
  "message": "Revaluation applications created successfully"
}
```

**Business Logic:**
1. Validate student has final marks published for selected courses
2. Check attempt count < 3 for each course
3. Check no pending revaluation for same courses
4. Calculate fee based on institution fee config and attempt number
5. Create revaluation_registrations entry for each course
6. Update exam_registrations.revaluation_attempts array
7. Set status to 'Payment Pending' if payment info provided, else 'Applied'

**Error Responses:**
- 400: Invalid course / Already at max attempts / Previous revaluation pending
- 404: Exam registration not found / Course not found
- 500: Database error

#### 5.1.2 Get Revaluation Applications

**Endpoint:** `GET /api/revaluation/registrations`

**Query Parameters:**
- `institutions_id` (optional): Filter by institution
- `examination_session_id` (optional): Filter by exam session
- `status` (optional): Filter by status
- `student_id` (optional): Filter by student
- `course_id` (optional): Filter by course
- `attempt_number` (optional): Filter by attempt number
- `search` (optional): Search by student name/register number

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "student_register_number": "21CS001",
      "student_name": "John Doe",
      "institution_code": "JKKN",
      "session_code": "JAN2026",
      "course_code": "CS101",
      "course_title": "Data Structures",
      "attempt_number": 1,
      "status": "Approved",
      "fee_amount": 500.00,
      "payment_status": "Verified",
      "payment_transaction_id": "TXN123456",
      "application_date": "2026-01-23T10:30:00Z",
      "approved_date": "2026-01-24T11:00:00Z",
      "assigned_examiner": {
        "id": "uuid",
        "name": "Dr. Smith",
        "assigned_date": "2026-01-24T11:05:00Z"
      },
      "original_marks": 42,
      "original_grade": "D"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
}
```

#### 5.1.3 Approve Revaluation Application

**Endpoint:** `POST /api/revaluation/registrations/approve`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2"],
  "payment_verified": true,
  "remarks": "Payment verified via bank statement"
}
```

**Response:**
```json
{
  "success": true,
  "approved_count": 2,
  "message": "2 applications approved successfully"
}
```

**Business Logic:**
1. Verify payment status for each application
2. Update status to 'Approved'
3. Record who approved and when
4. Can be bulk operation

#### 5.1.4 Assign Examiner to Revaluation

**Endpoint:** `POST /api/revaluation/registrations/assign-examiner`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2"],
  "examiner_id": "uuid",
  "evaluation_deadline": "2026-02-15"
}
```

**Response:**
```json
{
  "success": true,
  "assigned_count": 2,
  "message": "Examiner assigned successfully"
}
```

**Business Logic:**
1. Validate examiner is qualified for course
2. Validate examiner is different from original evaluator
3. Create examiner_assignments entry with type='revaluation'
4. Link to answer_sheets
5. Update revaluation_registrations with assignment info
6. Update status to 'Assigned'
7. Can be bulk operation

### 5.2 Revaluation Marks APIs

#### 5.2.1 Enter Revaluation Marks

**Endpoint:** `POST /api/revaluation/marks`

**Request Body:**
```json
{
  "revaluation_registration_id": "uuid",
  "dummy_number": "DN001",
  "question_wise_marks": {
    "q1": 8,
    "q2": 7,
    "q3": 9
  },
  "total_marks_obtained": 72,
  "total_marks_in_words": "Seventy Two",
  "marks_out_of": 100,
  "evaluator_remarks": "Good improvement in answers",
  "evaluation_date": "2026-02-10",
  "entry_status": "Submitted"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "revaluation_registration_id": "uuid",
    "total_marks_obtained": 72,
    "percentage": 72.00,
    "entry_status": "Submitted",
    "submitted_at": "2026-02-10T15:30:00Z"
  },
  "message": "Revaluation marks submitted successfully"
}
```

**Business Logic:**
1. Validate examiner is assigned to this revaluation
2. Validate marks are within valid range (0 to marks_out_of)
3. Create/update revaluation_marks entry
4. If status = 'Submitted', update revaluation_registration status to 'Evaluated'
5. Examiner CANNOT see original marks or previous revaluation marks (blind)

#### 5.2.2 Get Revaluation Marks

**Endpoint:** `GET /api/revaluation/marks`

**Query Parameters:**
- `revaluation_registration_id`: Required
- `include_original`: true/false (for comparison - admin only)

**Response:**
```json
{
  "data": {
    "revaluation_marks": {
      "id": "uuid",
      "total_marks_obtained": 72,
      "percentage": 72.00,
      "entry_status": "Verified",
      "evaluator_remarks": "Good improvement"
    },
    "original_marks": {
      "total_marks_obtained": 42,
      "percentage": 42.00
    },
    "difference": {
      "marks": 30,
      "percentage": 30.00
    }
  }
}
```

### 5.3 Final Marks APIs

#### 5.3.1 Generate Revaluation Final Marks

**Endpoint:** `POST /api/revaluation/final-marks/generate`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "success": true,
  "generated_count": 2,
  "data": [
    {
      "id": "uuid",
      "revaluation_registration_id": "uuid1",
      "student_register_number": "21CS001",
      "course_code": "CS101",
      "internal_marks": 15,
      "external_marks_revaluation": 72,
      "total_marks": 87,
      "percentage": 87.00,
      "grade": "A",
      "is_pass": true,
      "is_better_than_original": true,
      "original_total": 57,
      "marks_increase": 30
    }
  ]
}
```

**Business Logic:**
1. Fetch revaluation_marks for each registration
2. Fetch original internal_marks (unchanged)
3. Calculate: total = internal + revaluation_external + grace
4. Calculate percentage, assign grade, determine pass/fail
5. Fetch original_final_marks for comparison
6. Determine if revaluation is better than original
7. Store in revaluation_final_marks table

#### 5.3.2 Compare Original vs Revaluation

**Endpoint:** `GET /api/revaluation/final-marks/compare`

**Query Parameters:**
- `institutions_id`
- `examination_session_id`
- `course_id` (optional)
- `only_changed` (optional): true = show only where marks changed

**Response:**
```json
{
  "data": [
    {
      "student_register_number": "21CS001",
      "student_name": "John Doe",
      "course_code": "CS101",
      "attempt_number": 1,
      "original": {
        "total_marks": 57,
        "percentage": 57.00,
        "grade": "D",
        "is_pass": true
      },
      "revaluation": {
        "total_marks": 87,
        "percentage": 87.00,
        "grade": "A",
        "is_pass": true
      },
      "difference": {
        "marks": 30,
        "percentage": 30.00,
        "grade_improvement": "D → A"
      },
      "use_revaluation": true
    }
  ],
  "summary": {
    "total_revaluations": 50,
    "marks_increased": 35,
    "marks_decreased": 5,
    "no_change": 10,
    "average_increase": 15.5,
    "pass_improvements": 8
  }
}
```

#### 5.3.3 Publish Revaluation Results

**Endpoint:** `POST /api/revaluation/final-marks/publish`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2"],
  "update_final_marks": true,
  "update_semester_results": true
}
```

**Response:**
```json
{
  "success": true,
  "published_count": 2,
  "updated_final_marks": 2,
  "updated_semester_results": 2,
  "message": "Revaluation results published successfully"
}
```

**Business Logic:**
1. Update revaluation_registrations status to 'Published'
2. If `update_final_marks` = true:
   - For each revaluation, compare with original final_marks
   - If revaluation is better, update final_marks with new values
   - Keep both original and revaluation marks in database
3. If `update_semester_results` = true:
   - Recalculate semester GPA/CGPA using best marks
   - Update backlog status if changed from fail to pass
4. Lock published results
5. Send notifications to students

### 5.4 Bulk Operations APIs

#### 5.4.1 Bulk Approve

**Endpoint:** `POST /api/revaluation/bulk/approve`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2", "uuid3"],
  "remarks": "Bulk approval - payment verified"
}
```

#### 5.4.2 Bulk Assign Examiner

**Endpoint:** `POST /api/revaluation/bulk/assign`

**Request Body:**
```json
{
  "revaluation_registration_ids": ["uuid1", "uuid2"],
  "examiner_id": "uuid",
  "evaluation_deadline": "2026-02-15"
}
```

#### 5.4.3 Export Revaluations

**Endpoint:** `GET /api/revaluation/export`

**Query Parameters:**
- Same as list API filters
- `format`: 'excel' | 'csv'

**Response:** File download (Excel or CSV)

#### 5.4.4 Import Revaluation Updates

**Endpoint:** `POST /api/revaluation/import`

**Request Body:** Multipart form data with Excel file

**Expected Excel Columns:**
- revaluation_registration_id
- examiner_id (optional)
- status (optional)
- remarks (optional)

**Response:**
```json
{
  "success": true,
  "imported_count": 50,
  "errors": []
}
```

### 5.5 Reports APIs

#### 5.5.1 Revaluation Statistics

**Endpoint:** `GET /api/revaluation/reports/statistics`

**Query Parameters:**
- `institutions_id`
- `examination_session_id`
- `date_from`, `date_to` (optional)

**Response:**
```json
{
  "summary": {
    "total_applications": 150,
    "approved": 120,
    "rejected": 10,
    "pending": 20,
    "evaluated": 100,
    "published": 80
  },
  "mark_changes": {
    "increased": 60,
    "decreased": 10,
    "no_change": 10,
    "average_increase": 12.5,
    "max_increase": 35,
    "max_decrease": -8
  },
  "pass_improvements": {
    "fail_to_pass": 15,
    "pass_to_fail": 2,
    "grade_improvements": 45
  },
  "financials": {
    "total_fees_collected": 60000.00,
    "pending_payments": 5000.00
  },
  "turnaround": {
    "average_days": 18,
    "min_days": 7,
    "max_days": 30
  }
}
```

#### 5.5.2 Course-wise Analysis

**Endpoint:** `GET /api/revaluation/reports/course-analysis`

**Response:**
```json
{
  "data": [
    {
      "course_code": "CS101",
      "course_title": "Data Structures",
      "total_revaluations": 25,
      "marks_increased": 18,
      "marks_decreased": 2,
      "no_change": 5,
      "average_increase": 15.2,
      "max_increase": 35,
      "pass_improvements": 5
    }
  ]
}
```

#### 5.5.3 Examiner-wise Comparison

**Endpoint:** `GET /api/revaluation/reports/examiner-comparison`

**Response:**
```json
{
  "data": [
    {
      "original_examiner": "Dr. John Smith",
      "original_examiner_id": "uuid1",
      "revaluation_examiner": "Dr. Jane Doe",
      "revaluation_examiner_id": "uuid2",
      "evaluations_count": 15,
      "average_difference": 12.5,
      "increased_count": 12,
      "decreased_count": 3,
      "max_difference": 30
    }
  ]
}
```

---

## 6. UI/UX Specifications

### 6.1 Revaluation Application Page

**Route:** `/revaluation/apply`

**User Role:** COE Admin (with `revaluation:manage` permission)

**Layout:** Standard COE page with sidebar

#### 6.1.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Revaluation Application                              [Help] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Step 1: Select Institution & Exam Session                    │
│ ┌───────────────────┐  ┌────────────────────┐              │
│ │ Institution       ▼│  │ Exam Session      ▼│              │
│ └───────────────────┘  └────────────────────┘              │
│                                                               │
│ Step 2: Select Student Registration                          │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Search Student (Register Number / Name)              ▼│   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Selected Student: 21CS001 - John Doe                    │ │
│ │ Program: B.Tech CSE | Semester: 6 | Batch: 2021-2025   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Step 3: Select Courses for Revaluation                       │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ ☐ CS101 - Data Structures                             │   │
│ │   Current Marks: 42 | Grade: D | Pass ✓               │   │
│ │   Revaluation Attempts: 0/3 | Fee: ₹500              │   │
│ │                                                         │   │
│ │ ☑ CS102 - Algorithms                                   │   │
│ │   Current Marks: 38 | Grade: E | Fail ✗               │   │
│ │   Revaluation Attempts: 0/3 | Fee: ₹500              │   │
│ │                                                         │   │
│ │ ☐ CS103 - Database Systems                            │   │
│ │   Current Marks: 55 | Grade: C | Pass ✓               │   │
│ │   Revaluation Attempts: 1/3 | Fee: ₹600 (Attempt 2)  │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ Selected: 1 course | Total Fee: ₹500                        │
│                                                               │
│ Step 4: Payment & Application Details                        │
│ ┌──────────────────────┐  ┌────────────────┐               │
│ │ Transaction ID      │  │ Payment Date  ▼│               │
│ └──────────────────────┘  └────────────────┘               │
│                                                               │
│ Reason for Revaluation:                                      │
│ ┌───────────────────────────────────────────────────────┐   │
│ │                                                         │   │
│ │ (Max 500 characters)                                   │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌────────────┐  ┌────────┐                                  │
│ │ Submit     │  │ Cancel │                                  │
│ └────────────┘  └────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

#### 6.1.2 Validation Rules

- Institution and Exam Session required
- Student registration required
- At least 1 course must be selected
- Payment transaction ID required
- Payment date cannot be future date
- Reason for revaluation required (min 20 chars)

#### 6.1.3 Course Selection Logic

**Show course if:**
- ✅ Final marks are published
- ✅ Revaluation attempts < 3
- ✅ No pending revaluation for this course

**Display for each course:**
- Course code and title
- Current marks, percentage, grade
- Pass/Fail status
- Number of revaluation attempts (X/3)
- Fee amount (varies by attempt number)

**Disable course if:**
- ❌ Already has 3 revaluation attempts
- ❌ Previous revaluation is pending/in-progress
- ❌ Final marks not published

### 6.2 Revaluation Management Dashboard

**Route:** `/revaluation/manage`

**User Role:** COE Admin (with `revaluation:manage` permission)

#### 6.2.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Revaluation Management                          [Export] [Help] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📊 Statistics                                               │ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │ │
│ │ │ Total    │ │ Pending  │ │ Approved │ │ Published│       │ │
│ │ │   150    │ │    25    │ │    80    │ │    45    │       │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Filters:                                                          │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐   │
│ │ Institution ▼│ │ Exam Session▼│ │ Status  ▼│ │ Search   │   │
│ └──────────────┘ └──────────────┘ └──────────┘ └──────────┘   │
│                                                                   │
│ Bulk Actions: ☑ Select All  [Approve] [Assign Examiner]         │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ ☐ | ID | Student | Course | Attempt | Status | Fee | ... │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | R001 | 21CS001 | CS101 |    1    | Pending | ₹500    │   │
│ │          John Doe    Data Struct.         Applied              │
│ │          Applied: 2026-01-23    [Approve] [View]              │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | R002 | 21CS002 | CS102 |    1    | Approved | ₹500   │   │
│ │          Jane Smith  Algorithms           Approved             │
│ │          Approved: 2026-01-24   [Assign] [View]               │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | R003 | 21CS003 | CS103 |    2    | Assigned | ₹600   │   │
│ │          Bob Wilson  Database Sys.        Assigned             │
│ │          Assigned: Dr. Smith    [View]                        │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Showing 1-20 of 150         [← 1 2 3 ... 8 →]                   │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.2 Table Columns

- **Checkbox** (for bulk actions)
- **Application ID** (clickable to view details)
- **Student** (Register Number, Name)
- **Course** (Code, Title)
- **Attempt** (1/2/3)
- **Status** (with color badges)
- **Fee** (Amount, Payment Status)
- **Applied Date**
- **Assigned Examiner** (if assigned)
- **Actions** (Approve, Assign, View, Edit)

#### 6.2.3 Status Badges

- **Applied** - Blue
- **Payment Pending** - Yellow
- **Approved** - Green
- **Assigned** - Cyan
- **In Progress** - Purple
- **Evaluated** - Orange
- **Published** - Dark Green
- **Rejected** - Red

#### 6.2.4 Bulk Actions

1. **Bulk Approve**
   - Select multiple 'Applied' applications
   - Click "Approve" button
   - Modal: Confirm payment verification
   - System approves all selected

2. **Bulk Assign Examiner**
   - Select multiple 'Approved' applications
   - Click "Assign Examiner" button
   - Modal: Select examiner, set deadline
   - System validates and assigns

### 6.3 Revaluation Marks Entry Page

**Route:** `/revaluation/marks/entry`

**User Role:** Examiner (with `revaluation:evaluate` permission)

#### 6.3.1 Page Structure

**Interface is identical to regular marks entry, with key differences:**

```
┌─────────────────────────────────────────────────────────────┐
│ Revaluation Marks Entry                              [Help] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ 🔒 REVALUATION MODE - Original marks are hidden             │
│                                                               │
│ Course: CS101 - Data Structures                              │
│ Exam Session: JAN2026                                        │
│ Dummy Number: DN001                                          │
│ Revaluation Attempt: 1                                       │
│                                                               │
│ ⚠️ This is a blind evaluation. You cannot see:              │
│    • Student identity                                        │
│    • Original marks                                          │
│    • Previous revaluation marks (if any)                     │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Question-wise Marks:                                  │   │
│ │                                                         │   │
│ │ Q1 (Max 10): [____] Q2 (Max 15): [____]               │   │
│ │ Q3 (Max 20): [____] Q4 (Max 25): [____]               │   │
│ │ Q5 (Max 30): [____]                                    │   │
│ │                                                         │   │
│ │ Total Marks Obtained: [____] / 100                     │   │
│ │                                                         │   │
│ │ Total Marks in Words: [_________________________]      │   │
│ │                                                         │   │
│ │ Evaluator Remarks:                                     │   │
│ │ ┌─────────────────────────────────────────────────┐   │   │
│ │ │                                                   │   │   │
│ │ └─────────────────────────────────────────────────┘   │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ [View Answer Sheet]                                          │
│                                                               │
│ ┌────────────┐  ┌────────────┐  ┌────────┐                 │
│ │ Save Draft │  │ Submit     │  │ Cancel │                 │
│ └────────────┘  └────────────┘  └────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

#### 6.3.2 Key Features

- **Prominent Warning**: Banner indicating this is revaluation mode
- **Hidden Information**: No access to student name, original marks, previous revaluation marks
- **Same Interface**: Identical to regular marks entry for consistency
- **Answer Sheet Access**: Button to view scanned answer sheet
- **Question-wise Marks**: Same format as regular evaluation
- **Validation**: Same validation rules as regular marks entry

### 6.4 Revaluation Results Publisher Page

**Route:** `/revaluation/results/publish`

**User Role:** COE Admin (with `revaluation:publish` permission)

#### 6.4.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Revaluation Results Publisher                  [Export] [Help]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📊 Summary                                                  │ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │ │
│ │ │ Evaluated│ │ Increased│ │ Decreased│ │ No Change│       │ │
│ │ │    80    │ │    60    │ │     5    │ │    15    │       │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Filters:                                                          │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐            │
│ │ Institution ▼│ │ Exam Session▼│ │ Show: All    ▼│            │
│ └──────────────┘ └──────────────┘ └───────────────┘            │
│                                     (Changed Only/All)            │
│                                                                   │
│ ☑ Select All  [Publish Selected]                                │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Comparison View                                           │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | Student: 21CS001 - John Doe | Course: CS101          │   │
│ │                                                             │   │
│ │   Original:      42 marks | 42% | Grade D | Pass ✓        │   │
│ │   Revaluation:   72 marks | 72% | Grade B+ | Pass ✓       │   │
│ │   Difference:    +30 marks | +30% | Grade improved        │   │
│ │                                                             │   │
│ │   📊 Impact: Grade improved by 2 levels                    │   │
│ │   ✅ Recommended: Use Revaluation marks                    │   │
│ │                                                             │   │
│ │   [View Details] [Approve] [Reject]                        │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | Student: 21CS002 - Jane Smith | Course: CS102         │   │
│ │                                                             │   │
│ │   Original:      38 marks | 38% | Grade E | Fail ✗        │   │
│ │   Revaluation:   52 marks | 52% | Grade C | Pass ✓        │   │
│ │   Difference:    +14 marks | +14% | Grade improved        │   │
│ │                                                             │   │
│ │   📊 Impact: Fail → Pass, Grade improved                   │   │
│ │   ✅ Recommended: Use Revaluation marks                    │   │
│ │                                                             │   │
│ │   [View Details] [Approve] [Reject]                        │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ | Student: 21CS003 - Bob Wilson | Course: CS103         │   │
│ │                                                             │   │
│ │   Original:      75 marks | 75% | Grade A | Pass ✓        │   │
│ │   Revaluation:   68 marks | 68% | Grade B | Pass ✓        │   │
│ │   Difference:    -7 marks | -7% | Grade decreased         │   │
│ │                                                             │   │
│ │   ⚠️ Warning: Marks decreased after revaluation           │   │
│ │   ✅ Recommended: Keep Original marks                      │   │
│ │                                                             │   │
│ │   [View Details] [Approve] [Reject]                        │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Showing 1-10 of 80                                               │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.4.2 Comparison Card Features

Each card shows:
- Student and course info
- **Original marks**: Total, Percentage, Grade, Pass/Fail
- **Revaluation marks**: Total, Percentage, Grade, Pass/Fail
- **Difference**: Clearly highlighted (+ green, - red)
- **Impact summary**: Grade changes, fail to pass transitions
- **Recommendation**: System suggests which marks to use (better of both)
- **Actions**: View full details, Approve, Reject

#### 6.4.3 Color Coding

- **Green**: Marks increased, favorable for student
- **Red**: Marks decreased, unfavorable (rare case)
- **Gray**: No change
- **Orange**: Pass/Fail status changed

#### 6.4.4 Publishing Action

1. Admin selects revaluations to publish
2. Clicks "Publish Selected"
3. **Confirmation Modal:**
   ```
   ┌────────────────────────────────────────────────┐
   │ Confirm Revaluation Results Publication        │
   ├────────────────────────────────────────────────┤
   │                                                 │
   │ You are about to publish 10 revaluation results│
   │                                                 │
   │ Summary:                                        │
   │ • 8 results will use revaluation marks         │
   │ • 2 results will keep original marks           │
   │ • 5 students will see grade improvement        │
   │ • 2 students will change from Fail to Pass     │
   │                                                 │
   │ This action will:                               │
   │ ✓ Update final_marks table                     │
   │ ✓ Recalculate semester GPA/CGPA                │
   │ ✓ Update backlog courses                       │
   │ ✓ Generate updated galley reports              │
   │ ✓ Notify students via in-system notifications  │
   │                                                 │
   │ ⚠️ Published results cannot be unpublished     │
   │                                                 │
   │ ┌────────────┐  ┌────────┐                     │
   │ │ Confirm    │  │ Cancel │                     │
   │ └────────────┘  └────────┘                     │
   └────────────────────────────────────────────────┘
   ```
4. System executes publication workflow
5. Shows success toast with summary

### 6.5 Reports Pages

#### 6.5.1 Revaluation Statistics

**Route:** `/revaluation/reports/statistics`

- Dashboard with charts and metrics
- Filters: Institution, Exam Session, Date Range
- Charts:
  - Applications over time (line chart)
  - Mark changes distribution (bar chart)
  - Pass improvements (pie chart)
  - Status breakdown (donut chart)

#### 6.5.2 Course-wise Analysis

**Route:** `/revaluation/reports/course-analysis`

- Table view with sortable columns
- Identify courses with most revaluations
- Export to Excel

#### 6.5.3 Examiner-wise Comparison

**Route:** `/revaluation/reports/examiner-comparison`

- Table comparing original vs revaluation examiners
- Identify evaluation patterns and biases
- Export to Excel

#### 6.5.4 Financial Summary

**Route:** `/revaluation/reports/financial`

- Total fees collected
- Breakdown by institution, session, attempt number
- Payment status tracking
- Export to Excel

### 6.6 UI Components to Reuse/Create

#### 6.6.1 Reuse Existing Components

- `<Sheet>` - for application form
- `<DataTable>` - for listing revaluations
- `<Badge>` - for status indicators
- `<Select>` - for filters and dropdowns
- `<Button>` - for actions
- `<Dialog>` - for confirmations
- `<Toast>` - for success/error messages
- `<Checkbox>` - for bulk selections

#### 6.6.2 New Components to Create

1. **`<RevaluationApplicationForm>`**
   - Step-by-step application form
   - Institution/Session/Student/Course selection
   - Payment details entry
   - Course eligibility checking

2. **`<RevaluationComparisonCard>`**
   - Side-by-side original vs revaluation marks
   - Visual diff highlighting
   - Impact summary
   - Recommendation badge

3. **`<RevaluationStatusBadge>`**
   - Colored badges for each status
   - Icons for quick recognition
   - Tooltips with status description

4. **`<RevaluationStatsCard>`**
   - Dashboard statistics cards
   - Icon + Number + Label
   - Hover effects

5. **`<MarksComparisonTable>`**
   - Table showing original, revaluation, difference
   - Color-coded difference cells
   - Sortable columns

6. **`<RevaluationTimeline>`**
   - Visual timeline of revaluation workflow
   - Shows: Applied → Approved → Assigned → Evaluated → Published
   - Highlights current status

---

## 7. Business Rules & Validation

### 7.1 Application Rules

1. **Eligibility**
   - ✅ Student must have published final marks for the course
   - ✅ Maximum 3 revaluation attempts per course
   - ✅ No concurrent revaluations (previous must be completed)
   - ❌ Cannot apply if original result not published

2. **Fee Rules**
   - Fee amount determined by institution fee config
   - Fee may vary by attempt number (Attempt 1 < Attempt 2 < Attempt 3)
   - Payment verification required before approval
   - Transaction ID must be unique

3. **Timing Rules**
   - Can apply anytime after result publication (no deadline in Phase 1)
   - Evaluation turnaround: 30 days from assignment
   - Can apply for Revaluation 2 only after Revaluation 1 is published

### 7.2 Examiner Assignment Rules

1. **Qualification**
   - ✅ Examiner must be qualified for the subject/course
   - ✅ Examiner must be active and available

2. **Uniqueness**
   - ❌ Revaluation examiner MUST be different from original examiner
   - ❌ For Revaluation 2, must be different from original AND Revaluation 1 examiner
   - ❌ For Revaluation 3, must be different from original, Reval 1, AND Reval 2 examiners

3. **Workload**
   - Consider examiner workload when assigning
   - Limit concurrent revaluation assignments per examiner

### 7.3 Marks Entry Rules

1. **Validation**
   - ✅ Marks must be within 0 to marks_out_of
   - ✅ Total marks must equal sum of question-wise marks (if applicable)
   - ✅ Total marks in words must match numeric marks

2. **Blind Evaluation**
   - ❌ Examiner CANNOT see student identity
   - ❌ Examiner CANNOT see original marks
   - ❌ Examiner CANNOT see previous revaluation marks

3. **Status Transitions**
   - Draft → Submitted → Verified → Locked
   - Once Locked, cannot be edited (only super_admin can unlock)

### 7.4 Final Marks Rules

1. **Internal Marks**
   - ✅ Internal marks remain unchanged during revaluation
   - ✅ Only external marks are re-evaluated

2. **Calculation**
   ```
   Revaluation Total = Internal (original) + External (revaluation) + Grace
   Revaluation % = (Revaluation Total / Total Maximum) * 100
   ```

3. **Grade Assignment**
   - Automatic grade assignment based on percentage
   - Uses same grading scheme as original evaluation

4. **Best of Both**
   - System maintains both original and revaluation final marks
   - Compares based on:
     1. Total marks (higher is better)
     2. Percentage (higher is better)
     3. Grade points (higher is better)
     4. Pass > Fail (always)
   - Flags the better result as 'active' for transcripts

5. **GPA/CGPA Impact**
   - Recalculate semester GPA using best marks
   - Recalculate cumulative CGPA
   - Update backlog if changed from fail to pass

### 7.5 Publication Rules

1. **Pre-publication Checks**
   - ✅ Revaluation marks must be verified
   - ✅ Final marks calculated
   - ✅ Best marks determined

2. **Publication Actions**
   - Update revaluation_registrations status to 'Published'
   - Update final_marks table with best marks
   - Recalculate semester_results
   - Generate updated galley reports
   - Send notifications

3. **Post-publication**
   - ❌ Published results cannot be unpublished
   - ❌ Published marks cannot be edited (locked)
   - ✅ Can apply for next revaluation if < 3 attempts

---

## 8. Workflows

### 8.1 End-to-End Revaluation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                   REVALUATION WORKFLOW                          │
└─────────────────────────────────────────────────────────────────┘

[1] STUDENT REQUEST (Offline or via future portal)
    │
    ├── Submits physical form / email to COE
    ├── Pays fee via bank/UPI
    │
    ▼
[2] COE ADMIN - CREATE APPLICATION
    │
    ├── Log in to COE system
    ├── Navigate to /revaluation/apply
    ├── Select institution, exam session, student
    ├── Select course(s) for revaluation
    ├── Enter payment details (transaction ID, date)
    ├── Enter reason for revaluation
    ├── Submit application
    │
    ├── SYSTEM: Validate eligibility
    ├── SYSTEM: Calculate fee based on attempt number
    ├── SYSTEM: Create revaluation_registrations entry
    ├── SYSTEM: Update exam_registrations.revaluation_attempts[]
    ├── SYSTEM: Set status to 'Payment Pending' or 'Applied'
    │
    ▼
[3] COE ADMIN - VERIFY PAYMENT
    │
    ├── View application in /revaluation/manage
    ├── Verify payment via bank statement
    ├── Approve application
    │
    ├── SYSTEM: Update payment_status to 'Verified'
    ├── SYSTEM: Update status to 'Approved'
    ├── SYSTEM: Record who approved and when
    │
    ▼
[4] COE ADMIN - ASSIGN EXAMINER
    │
    ├── Select approved application
    ├── Choose qualified examiner (must be different from original)
    ├── Set evaluation deadline (30 days)
    ├── Assign examiner
    │
    ├── SYSTEM: Create examiner_assignments entry (type='revaluation')
    ├── SYSTEM: Link to answer_sheets
    ├── SYSTEM: Update status to 'Assigned'
    ├── SYSTEM: Notify examiner (in-system notification)
    │
    ▼
[5] EXAMINER - EVALUATE (Blind Evaluation)
    │
    ├── Receive notification of assignment
    ├── Navigate to /revaluation/marks/entry
    ├── View answer sheet (scanned)
    ├── Enter question-wise marks
    ├── Enter total marks and remarks
    ├── Submit marks for verification
    │
    ├── SYSTEM: Validate marks are within range
    ├── SYSTEM: Create revaluation_marks entry
    ├── SYSTEM: Update status to 'Evaluated'
    ├── SYSTEM: Cannot see original marks (blind evaluation)
    │
    ▼
[6] COE ADMIN - VERIFY MARKS
    │
    ├── View submitted revaluation marks
    ├── Verify marks are correct
    ├── Approve marks
    │
    ├── SYSTEM: Update marks status to 'Verified'
    ├── SYSTEM: Lock marks (prevent further edits)
    │
    ▼
[7] SYSTEM - GENERATE FINAL MARKS
    │
    ├── Fetch revaluation_marks
    ├── Fetch original internal_marks (unchanged)
    ├── Calculate: Total = Internal + Revaluation External + Grace
    ├── Calculate percentage
    ├── Assign grade automatically
    ├── Determine pass/fail status
    ├── Create revaluation_final_marks entry
    │
    ├── Fetch original_final_marks for comparison
    ├── Compare: Which is better? (total, %, grade, pass)
    ├── Flag better result
    ├── Store both results in database
    │
    ▼
[8] COE ADMIN - REVIEW & PUBLISH
    │
    ├── Navigate to /revaluation/results/publish
    ├── Review side-by-side comparison (original vs revaluation)
    ├── See mark differences, grade changes, impact
    ├── Select revaluations to publish
    ├── Confirm publication
    │
    ├── SYSTEM: Update revaluation_registrations status to 'Published'
    ├── SYSTEM: Update final_marks with best marks
    ├── SYSTEM: Recalculate semester GPA/CGPA
    ├── SYSTEM: Update backlog status if needed
    ├── SYSTEM: Lock published results
    ├── SYSTEM: Send in-system notification to student
    ├── SYSTEM: Generate updated galley reports
    │
    ▼
[9] STUDENT (Future Phase)
    │
    ├── Receive notification
    ├── Log in to student portal
    ├── View updated marks and grade
    ├── See comparison (original vs revaluation)
    │
    ▼
[10] OPTIONAL: APPLY FOR REVALUATION 2
    │
    ├── If not satisfied with Revaluation 1 results
    ├── Apply for Revaluation 2 (repeat workflow)
    ├── Pay separate fee
    ├── Same process, different examiner
    │
    ▼
[11] OPTIONAL: APPLY FOR REVALUATION 3 (Final Attempt)
    │
    ├── If not satisfied with Revaluation 2 results
    ├── Apply for Revaluation 3 (final attempt)
    ├── Pay separate fee
    ├── Same process, third examiner
    ├── Result is FINAL (no further revaluations)
    │
    ▼
[END]
```

### 8.2 Status State Machine

```
APPLICATION STATUS FLOW:

Applied (Initial)
  │
  ├─[Payment Verified]→ Payment Pending
  │                          │
  │                          ├─[Admin Verifies]→ Payment Verified
  │                          │                        │
  │                          ▼                        │
  ├─[Admin Approves]────────────────────────────────→ Approved
  │                                                       │
  ├─[Admin Rejects]→ Rejected (Terminal)                │
  │                                                       │
  ▼                                                       ▼
Payment Verified ──────────────────────────────→ [Admin Assigns]
                                                          │
                                                          ▼
                                                      Assigned
                                                          │
                                                          ├─[Examiner Starts]→ In Progress
                                                          │                        │
                                                          │                        ▼
                                                          ├─[Examiner Submits]─→ Evaluated
                                                          │                        │
                                                          │                        ▼
                                                          ├─[Admin Verifies]───→ Verified
                                                          │                        │
                                                          │                        ▼
                                                          ├─[Admin Publishes]──→ Published (Terminal)
                                                          │
                                                          ▼
                                                      Cancelled (Admin can cancel)
```

### 8.3 Marks Entry Status Flow

```
MARKS ENTRY STATUS FLOW:

Draft (Initial)
  │
  ├─[Examiner Submits]→ Submitted
  │                        │
  │                        ├─[Admin Verifies]→ Verified
  │                        │                      │
  │                        │                      ├─[Auto/Manual]→ Locked (Terminal)
  │                        │                      │
  │                        ├─[Admin Rejects]→ Rejected
  │                        │                   │
  │                        │                   └──→ [Examiner Fixes] → Draft
  │                        │
  │                        └─[Admin Sends Back]→ Pending Review
  │                                                  │
  │                                                  └──→ [Examiner Updates] → Draft
  │
  └─[Examiner Abandons]→ (Remains Draft)
```

---

## 9. Integration Points

### 9.1 Existing System Integration

#### 9.1.1 Integration with `exam_registrations`

- **Read**: Fetch student registrations to identify eligible courses
- **Update**: Add revaluation attempt numbers to `revaluation_attempts[]` array

#### 9.1.2 Integration with `marks_entry`

- **Read**: Fetch original external marks for comparison
- **No Update**: Original marks remain unchanged

#### 9.1.3 Integration with `internal_marks`

- **Read**: Fetch internal marks (unchanged during revaluation)
- **No Update**: Internal marks are never changed by revaluation

#### 9.1.4 Integration with `final_marks`

- **Read**: Fetch original final marks for comparison
- **Update**: Update with best marks (original or revaluation) after publication
- **Insert**: May create new final_marks if using revaluation marks

#### 9.1.5 Integration with `examiner_assignments`

- **Insert**: Create new assignment for revaluation examiner
- **Update**: Track progress and completion

#### 9.1.6 Integration with `answer_sheets`

- **Read**: Access answer sheet for revaluation
- **Link**: revaluation_marks links to same answer_sheets record

#### 9.1.7 Integration with Grading System

- **Trigger**: Recalculate grades when revaluation marks are published
- **Update**: semester_results, GPA, CGPA, backlog courses

#### 9.1.8 Integration with Galley Reports

- **Generate**: Before revaluation galley (original marks)
- **Generate**: After revaluation galley (updated marks)
- **Highlight**: Mark changes and grade improvements

### 9.2 External System Integration (Future)

#### 9.2.1 Payment Gateway (Future Phase)

- Online fee payment for student self-service portal
- Real-time payment verification
- Automatic payment status update

#### 9.2.2 Email/SMS Notifications (Future Phase)

- Send email/SMS notifications on status changes
- Currently: In-system notifications only

#### 9.2.3 Document Management System (Future)

- Store scanned answer sheets
- Retrieve for revaluation access

---

## 10. Reports & Analytics

### 10.1 Revaluation Statistics Report

**Purpose:** Overall revaluation metrics and trends

**Data Points:**
- Total applications (by institution, session, course)
- Status breakdown (Applied, Approved, Published, etc.)
- Approval rate
- Mark change statistics:
  - Average mark increase/decrease
  - Percentage of no change
  - Max mark increase/decrease
  - Distribution of mark changes
- Pass rate improvement
- Grade distribution changes
- Turnaround time metrics (average, min, max)
- Financial metrics (total fees collected)

**Visualizations:**
- Line chart: Applications over time
- Bar chart: Mark changes distribution
- Pie chart: Pass improvements (fail→pass, pass→fail, no change)
- Donut chart: Status breakdown
- Heat map: Revaluations by course and institution

**Filters:**
- Institution
- Exam Session
- Date Range
- Course
- Attempt Number

**Export:** Excel, PDF

### 10.2 Course-wise Analysis Report

**Purpose:** Identify courses with frequent revaluations and patterns

**Data Points (per course):**
- Course code, title
- Total revaluations
- Mark increase count, decrease count, no change
- Average mark change
- Max mark increase/decrease
- Pass improvement count
- Percentage of students applying for revaluation (of total students)

**Visualizations:**
- Table with sortable columns
- Bar chart: Top 10 courses by revaluation count
- Scatter plot: Revaluation count vs average mark change

**Filters:**
- Institution
- Exam Session
- Program
- Semester

**Use Cases:**
- Identify courses where evaluation quality may need review
- Spot courses with consistent mark increases (possible lenient revaluation)
- Spot courses with minimal changes (good original evaluation)

**Export:** Excel, PDF

### 10.3 Examiner-wise Comparison Report

**Purpose:** Compare original examiners vs revaluation examiners

**Data Points:**
- Original examiner name
- Revaluation examiner name
- Number of revaluations compared
- Average mark difference (revaluation - original)
- Count of mark increases
- Count of mark decreases
- Count of no change
- Max mark difference
- Standard deviation of differences

**Visualizations:**
- Table with comparison metrics
- Bar chart: Top 10 examiner pairs by average difference
- Box plot: Distribution of differences by examiner pair

**Filters:**
- Institution
- Exam Session
- Course
- Date Range

**Use Cases:**
- Identify examiners whose marks are frequently adjusted in revaluation
- Spot evaluation bias or inconsistencies
- Quality assurance for evaluation standards
- Training needs identification

**Export:** Excel, PDF

### 10.4 Financial Summary Report

**Purpose:** Track revaluation fee collection and payments

**Data Points:**
- Total fees collected (by institution, session, attempt number)
- Breakdown by:
  - Institution
  - Exam session
  - Attempt number (1, 2, 3)
  - Course
- Payment status breakdown (Pending, Verified, Rejected)
- Pending payments
- Payment verification rate
- Refunds issued (if any)
- Revenue by time period (monthly, quarterly)

**Visualizations:**
- Bar chart: Fees by institution
- Line chart: Revenue over time
- Pie chart: Payment status breakdown

**Filters:**
- Institution
- Exam Session
- Date Range
- Payment Status

**Export:** Excel, PDF

### 10.5 Student Revaluation History Report

**Purpose:** Complete revaluation history for a student

**Data Points (per student):**
- Student register number, name, program
- List of all revaluation applications:
  - Course code, title
  - Attempt number (1/2/3)
  - Application date
  - Status
  - Original marks, grade
  - Revaluation marks, grade (if completed)
  - Mark difference
  - Fee paid
  - Result (better/worse/same)

**Filters:**
- Student (search by register number/name)
- Institution
- Exam Session

**Use Cases:**
- Student inquiry handling
- Academic counseling
- Dispute resolution

**Export:** Excel, PDF

### 10.6 Galley Comparison Report

**Purpose:** Before/After galley report for audit and compliance

**Data Points:**
- Institution, Exam Session, Program, Semester
- For each student:
  - Register number, name
  - For each course:
    - Original marks, grade, pass/fail
    - Revaluation marks (if any), grade, pass/fail
    - Mark difference
    - Grade change
- Summary:
  - Total students affected
  - Total revaluations processed
  - Mark increases/decreases/no change
  - Grade improvements
  - Fail to pass transitions

**Format:**
- Side-by-side comparison
- Highlighted changes (color-coded)
- Summary statistics at bottom

**Export:** Excel, PDF

---

## 11. Non-Functional Requirements

### 11.1 Performance

- **Response Time**:
  - Page load: < 2 seconds
  - API response: < 500ms for read operations, < 1s for write operations
  - Bulk operations: < 5s for up to 100 records

- **Scalability**:
  - Support 10,000+ revaluation applications per exam session
  - Handle 100+ concurrent users
  - Efficient pagination for large datasets

- **Database**:
  - Proper indexes on all query columns
  - Optimized queries with JOINs
  - Avoid N+1 query problems

### 11.2 Security

- **Authentication & Authorization**:
  - RBAC enforced at page and API level
  - Permissions: `revaluation:apply`, `revaluation:manage`, `revaluation:evaluate`, `revaluation:publish`
  - Multi-tenant data isolation (institution-based)

- **Data Protection**:
  - Blind evaluation: Examiners cannot access student identity or previous marks
  - Payment info encrypted at rest
  - Audit trail for all sensitive operations

- **Input Validation**:
  - Server-side validation for all inputs
  - Prevent SQL injection, XSS attacks
  - Sanitize user input

### 11.3 Reliability

- **Data Integrity**:
  - Foreign key constraints enforced
  - Database transactions for multi-step operations
  - Prevent orphaned records

- **Error Handling**:
  - Graceful error handling with user-friendly messages
  - Rollback on transaction failures
  - Logging of all errors

- **Backup & Recovery**:
  - Regular database backups
  - Point-in-time recovery capability

### 11.4 Usability

- **User Interface**:
  - Consistent design following existing COE UI patterns
  - Responsive design (mobile-friendly)
  - Accessible (ARIA labels, keyboard navigation)

- **User Guidance**:
  - Clear instructions and help text
  - Validation error messages with corrective guidance
  - Confirmation dialogs for critical actions

- **Workflow**:
  - Intuitive navigation
  - Progress indicators for multi-step processes
  - Undo/cancel options where appropriate

### 11.5 Maintainability

- **Code Quality**:
  - Follow existing project conventions
  - TypeScript strict mode
  - Component reusability
  - Comprehensive comments for complex logic

- **Documentation**:
  - API documentation
  - Database schema documentation
  - User manual (for COE admins)

- **Testing**:
  - Unit tests for business logic
  - Integration tests for APIs
  - Manual testing for UI workflows

### 11.6 Compliance

- **Audit Trail**:
  - Complete history of all revaluation attempts
  - Track who did what and when
  - Immutable audit logs

- **Data Retention**:
  - Retain revaluation records for X years (as per policy)
  - Soft delete (mark as inactive) instead of hard delete

- **Reporting**:
  - Ability to generate compliance reports
  - Export data for external audits

---

## 12. Implementation Phases

### Phase 1: Core Revaluation Module (MVP)

**Goal:** Admin-driven revaluation process with basic workflow

**Features:**
- ✅ Create revaluation application (admin-only)
- ✅ Approve/Reject applications
- ✅ Assign examiners
- ✅ Enter revaluation marks (blind evaluation)
- ✅ Generate revaluation final marks
- ✅ Compare original vs revaluation marks
- ✅ Publish revaluation results
- ✅ Update final marks with best marks
- ✅ Basic reports (statistics, course-wise)

**Database:**
- ✅ revaluation_registrations
- ✅ revaluation_marks
- ✅ revaluation_final_marks
- ✅ revaluation_fee_config
- ✅ Modify exam_registrations (add revaluation_attempts[])
- ✅ Modify examiner_assignments (add assignment_type, revaluation_registration_id)

**Pages:**
- ✅ /revaluation/apply
- ✅ /revaluation/manage
- ✅ /revaluation/marks/entry
- ✅ /revaluation/results/publish
- ✅ /revaluation/reports/statistics
- ✅ /revaluation/reports/course-analysis

**Duration:** 4-6 weeks

### Phase 2: Enhanced Features

**Goal:** Bulk operations, advanced reports, notifications

**Features:**
- ✅ Bulk approve applications
- ✅ Bulk assign examiners
- ✅ Bulk status update
- ✅ Export/Import revaluation list (Excel)
- ✅ Examiner-wise comparison report
- ✅ Financial summary report
- ✅ Galley comparison report
- ✅ In-system notifications for students and examiners

**Duration:** 2-3 weeks

### Phase 3: Student Self-Service Portal

**Goal:** Students can apply online and track status

**Features:**
- ✅ Student login portal
- ✅ View published results
- ✅ Apply for revaluation online
- ✅ Upload payment proof
- ✅ Track application status
- ✅ View revaluation results
- ✅ Compare original vs revaluation marks
- ✅ Student notifications (in-system, email)

**Database:**
- ✅ student_notifications table (if not exists)

**Pages:**
- ✅ /student/results
- ✅ /student/revaluation/apply
- ✅ /student/revaluation/status
- ✅ /student/notifications

**Duration:** 3-4 weeks

### Phase 4: Advanced Features

**Goal:** Online payment, advanced analytics, automation

**Features:**
- ✅ Integrated payment gateway (Razorpay/PayU)
- ✅ Automated payment verification
- ✅ Email/SMS notifications
- ✅ Advanced analytics dashboard
- ✅ Predictive analytics (revaluation likelihood)
- ✅ Mobile app integration

**Duration:** 4-6 weeks

---

## 13. Risks & Mitigation

### Risk 1: Data Integrity Issues

**Risk:** Marks accidentally overwritten or lost during revaluation process

**Mitigation:**
- Always maintain both original and revaluation marks in separate tables
- Use database transactions for all critical operations
- Implement soft deletes (mark as inactive instead of deleting)
- Regular backups with point-in-time recovery

**Impact:** High | **Probability:** Medium

### Risk 2: Examiner Bias

**Risk:** Revaluation examiner sees original marks, leading to biased evaluation

**Mitigation:**
- Enforce blind evaluation (hide original marks, student identity)
- System prevents access to previous marks
- Separate UI for revaluation marks entry with warnings
- Audit trail to detect if marks are suspiciously similar

**Impact:** High | **Probability:** Low

### Risk 3: Performance Degradation

**Risk:** System slows down with large number of revaluations

**Mitigation:**
- Proper database indexing on all query columns
- Pagination for large datasets
- Optimize queries (avoid N+1, use bulk operations)
- Load testing before production

**Impact:** Medium | **Probability:** Medium

### Risk 4: Payment Verification Delays

**Risk:** Manual payment verification causes bottlenecks

**Mitigation:**
- Bulk approval feature for faster processing
- Export/Import for offline verification
- Phase 4: Integrate payment gateway for automation

**Impact:** Medium | **Probability:** High (Phase 1)

### Risk 5: Complex Business Logic Bugs

**Risk:** Grade calculation, best marks logic, GPA recalculation errors

**Mitigation:**
- Comprehensive unit tests for business logic
- Manual testing with diverse scenarios
- Dry-run on test data before production deployment
- Rollback plan for critical bugs

**Impact:** High | **Probability:** Medium

### Risk 6: User Confusion

**Risk:** Admins/Examiners confused by complex workflow

**Mitigation:**
- Clear UI with step-by-step guidance
- Help text and tooltips throughout
- User training before go-live
- User manual and video tutorials

**Impact:** Medium | **Probability:** Medium

---

## 14. Assumptions & Dependencies

### Assumptions

1. **Revaluation is complete re-evaluation**, not just re-totaling
2. **Internal marks remain unchanged** during revaluation (only external marks re-evaluated)
3. **Revaluation marks become final** once published (student must accept)
4. **Best of both approach**: System uses whichever is better (original or revaluation)
5. **Sequential revaluations**: Revaluation 2 can only be applied after Revaluation 1 is published
6. **Blind evaluation**: Examiners cannot see previous marks
7. **No deadline** for revaluation applications in Phase 1 (can be added later)
8. **Manual payment verification** in Phase 1 (automated in Phase 4)
9. **Admin-driven process** in Phase 1 (student self-service in Phase 3)

### Dependencies

1. **Existing Tables**: exam_registrations, marks_entry, internal_marks, final_marks, examiner_assignments, answer_sheets
2. **Grading System**: Auto-grade assignment logic must be in place
3. **Semester Results**: Semester GPA/CGPA calculation logic must work
4. **Galley Reports**: Existing galley generation must be adaptable for revaluation
5. **RBAC System**: Permissions system must support new permissions
6. **Notification System**: In-system notification infrastructure
7. **File Storage**: For scanned answer sheets (Supabase Storage)

---

## 15. Open Questions & Future Enhancements

### Open Questions

1. **Refund Policy**: What happens if student withdraws application? Is fee refunded?
2. **Answer Sheet Access**: How are scanned answer sheets stored and retrieved?
3. **Deadline Policy**: Should there be a deadline for revaluation applications?
4. **Multiple Courses**: Can student apply for multiple courses in one application, or separate applications?
5. **Notification Preferences**: Email, SMS, or in-system only?

### Future Enhancements

1. **Revaluation Types**: Different types (Re-totaling, Re-evaluation, Photocopy + Review) with different fees
2. **Mobile App**: Student mobile app for revaluation applications and tracking
3. **AI-powered Insights**: Predict which courses/students are likely to apply for revaluation
4. **Blockchain Audit Trail**: Immutable audit trail for regulatory compliance
5. **Video Proctoring**: For high-stakes revaluations, record examiner evaluation via video
6. **Automated Examiner Allocation**: AI-based examiner assignment considering workload, expertise, historical patterns
7. **Student Dispute Resolution**: Built-in mechanism for students to raise disputes with supporting documents
8. **Comparative Analytics**: Compare institution's revaluation patterns with peer institutions
9. **Integration with University**: Direct submission of revaluation results to affiliating university
10. **Answer Sheet Annotation**: Allow examiners to annotate answer sheets digitally during revaluation

---

## 16. Success Criteria

The Revaluation Process Module will be considered successful if:

1. **Functional**:
   - ✅ All FR requirements implemented and tested
   - ✅ All workflows functional end-to-end
   - ✅ Zero critical bugs in production

2. **Performance**:
   - ✅ Page load < 2s, API response < 1s
   - ✅ Supports 10,000+ revaluations per session
   - ✅ No performance degradation under load

3. **Quality**:
   - ✅ Data integrity maintained (no marks lost or overwritten)
   - ✅ Blind evaluation enforced (examiners cannot see previous marks)
   - ✅ Audit trail complete and accurate

4. **Usability**:
   - ✅ User training < 2 hours
   - ✅ Positive feedback from COE admins and examiners
   - ✅ < 5% user error rate

5. **Business Impact**:
   - ✅ Revaluation processing time reduced by 50%
   - ✅ 100% transparency in revaluation status
   - ✅ Zero manual errors in mark updates

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **Revaluation** | Process of re-evaluating a student's answer sheet by a different examiner |
| **Blind Evaluation** | Evaluation where examiner cannot see student identity or previous marks |
| **Attempt Number** | Sequence number of revaluation (1, 2, or 3) |
| **Original Marks** | Marks from first evaluation (before any revaluation) |
| **Revaluation Marks** | Marks from revaluation evaluation |
| **Best of Both** | System approach where better of original or revaluation marks is used |
| **Final Marks** | Calculated marks (internal + external + grace) used for grade and GPA |
| **Galley** | Consolidated mark sheet showing all students' marks for a program/semester |
| **Sequential Revaluation** | Chain of revaluations (1 → 2 → 3) where next can only be applied after previous is published |
| **Grace Marks** | Additional marks awarded for rounding or special circumstances |
| **Pass Improvement** | When revaluation changes fail to pass or improves grade |

---

## 18. Approval & Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Product Owner** | | | |
| **Tech Lead** | | | |
| **COE Administrator** | | | |
| **QA Lead** | | | |

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-23
- **Next Review:** 2026-02-23
- **Owner:** JKKN COE Development Team

---

**Appendix A: Database ER Diagram**

```
┌─────────────────────┐
│ exam_registrations  │
│ ─────────────────── │
│ id (PK)             │
│ student_id          │
│ session_id          │
│ course_offering_id  │
│ revaluation_attempts│◄────┐
│ ...                 │     │
└─────────────────────┘     │
                             │
                             │ FK
┌──────────────────────────────┐
│ revaluation_registrations    │
│ ─────────────────────────── │
│ id (PK)                      │
│ exam_registration_id (FK)    │─────┐
│ course_offering_id (FK)      │     │
│ student_id                   │     │
│ attempt_number (1/2/3)       │     │
│ previous_revaluation_id (FK) │◄────┤ (self-reference)
│ status                       │     │
│ fee_amount                   │     │
│ payment_status               │     │
│ examiner_assignment_id (FK)  │     │
│ ...                          │     │
└──────────────────────────────┘     │
        │                            │
        │ FK                         │
        ▼                            │
┌──────────────────────┐             │
│ revaluation_marks    │             │
│ ──────────────────── │             │
│ id (PK)              │             │
│ reval_reg_id (FK)    │─────────────┘
│ answer_sheet_id (FK) │
│ examiner_assign_id   │
│ total_marks_obtained │
│ percentage           │
│ entry_status         │
│ ...                  │
└──────────────────────┘
        │
        │ FK
        ▼
┌────────────────────────────┐
│ revaluation_final_marks    │
│ ─────────────────────────  │
│ id (PK)                    │
│ reval_reg_id (FK)          │
│ reval_marks_id (FK)        │
│ original_final_marks_id    │
│ internal_marks (original)  │
│ external_marks (reval)     │
│ total_marks                │
│ percentage                 │
│ grade                      │
│ is_better_than_original    │
│ ...                        │
└────────────────────────────┘
```

---

**Appendix B: API Endpoint Summary**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/revaluation/registrations | Create application |
| GET | /api/revaluation/registrations | List applications |
| POST | /api/revaluation/registrations/approve | Approve applications |
| POST | /api/revaluation/registrations/assign-examiner | Assign examiner |
| POST | /api/revaluation/marks | Enter marks |
| GET | /api/revaluation/marks | Get marks |
| POST | /api/revaluation/final-marks/generate | Generate final marks |
| GET | /api/revaluation/final-marks/compare | Compare original vs reval |
| POST | /api/revaluation/final-marks/publish | Publish results |
| POST | /api/revaluation/bulk/approve | Bulk approve |
| POST | /api/revaluation/bulk/assign | Bulk assign |
| GET | /api/revaluation/export | Export to Excel |
| POST | /api/revaluation/import | Import updates |
| GET | /api/revaluation/reports/statistics | Statistics report |
| GET | /api/revaluation/reports/course-analysis | Course analysis |
| GET | /api/revaluation/reports/examiner-comparison | Examiner comparison |

---

**End of Document**
