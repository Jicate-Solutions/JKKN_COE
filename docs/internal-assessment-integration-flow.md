# Internal Assessment Pattern Integration Flow

## Overview

This document describes how the Internal Assessment Pattern module integrates with:
1. **Internal Exam Schedule** - For scheduling periodic tests and assessments
2. **My JKKN Portal Mark Entry** - For entering learner marks
3. **Result Processing** - For final internal marks calculation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTERNAL ASSESSMENT SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │   PATTERN        │     │   COMPONENT      │     │  SUB-COMPONENT   │    │
│  │   DEFINITION     │────▶│   DEFINITION     │────▶│  DEFINITION      │    │
│  │                  │     │                  │     │                  │    │
│  │ - Course Type    │     │ - Weightage %    │     │ - Sub-weightage  │    │
│  │ - Program Type   │     │ - Calc Method    │     │ - Period/Month   │    │
│  │ - W.E.F Date     │     │ - Mandatory?     │     │ - Instance #     │    │
│  └────────┬─────────┘     └────────┬─────────┘     └──────────────────┘    │
│           │                        │                                        │
│           │                        │                                        │
│           ▼                        ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    INTEGRATION LAYER                                  │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │  │
│  │  │ INTERNAL EXAM   │  │  MARK ENTRY     │  │  RESULT         │      │  │
│  │  │ SCHEDULE        │  │  (My JKKN)      │  │  PROCESSING     │      │  │
│  │  │                 │  │                 │  │                 │      │  │
│  │  │ Fetches:        │  │ Receives:       │  │ Calculates:     │      │  │
│  │  │ - Components    │  │ - Pattern       │  │ - Weighted %    │      │  │
│  │  │ - Sub-components│  │ - Components    │  │ - Final Marks   │      │  │
│  │  │ - Periods       │  │ - Max marks     │  │ - Pass/Fail     │      │  │
│  │  │                 │  │                 │  │ - Eligibility   │      │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │  │
│  │           │                    │                    │                │  │
│  │           ▼                    ▼                    ▼                │  │
│  │  ┌───────────────────────────────────────────────────────────────┐  │  │
│  │  │                 learner_internal_marks                         │  │  │
│  │  │  (Stores raw marks per component/sub-component per learner)    │  │  │
│  │  └───────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Internal Exam Schedule Integration

When scheduling internal exams, the system:

1. **Fetches applicable pattern** for the course/program
2. **Gets components** that require scheduled exams (`requires_scheduled_exam = true`)
3. **Gets sub-components** with their `scheduled_period` to determine timing
4. **Creates exam schedule entries** linked to components/sub-components

```typescript
// Example: Fetching schedulable components for a course
const { data: pattern } = await getApplicablePattern(supabase, courseId, courseType, programId)

const { data: components } = await supabase
  .from('internal_assessment_components')
  .select(`
    *,
    internal_assessment_sub_components (*)
  `)
  .eq('pattern_id', pattern.id)
  .eq('requires_scheduled_exam', true)
  .eq('is_active', true)
  .order('display_order')

// Each sub-component with scheduled_period becomes an exam slot
for (const component of components) {
  if (component.has_sub_components) {
    for (const subComp of component.internal_assessment_sub_components) {
      // Create exam schedule entry
      await createExamSchedule({
        course_id: courseId,
        component_id: component.id,
        sub_component_id: subComp.id,
        assessment_name: `${component.component_name} - ${subComp.sub_component_name}`,
        scheduled_period: subComp.scheduled_period,
        // ... other schedule details
      })
    }
  } else {
    // Single component without sub-components
    await createExamSchedule({
      course_id: courseId,
      component_id: component.id,
      assessment_name: component.component_name,
      // ... other schedule details
    })
  }
}
```

### 2. My JKKN Portal Mark Entry Integration

The mark entry interface:

1. **Loads the applicable pattern** for the course
2. **Displays components and sub-components** as mark entry fields
3. **Accepts raw marks** (NOT percentages) from learning facilitators
4. **Stores marks** in `learner_internal_marks` table

```typescript
// Mark Entry Form Structure
interface MarkEntryForm {
  learner_id: string
  course_id: string
  pattern_id: string
  entries: {
    component_id: string
    sub_component_id?: string
    marks_obtained: number  // Raw marks entered
    max_marks: number       // Max marks for this specific assessment
    remarks?: string
    entered_by: string
    entered_at: string
  }[]
}

// Example: Mark entry API endpoint
async function submitMarks(formData: MarkEntryForm) {
  const supabase = getSupabaseServer()

  for (const entry of formData.entries) {
    await supabase
      .from('learner_internal_marks')
      .upsert({
        learner_id: formData.learner_id,
        course_id: formData.course_id,
        pattern_id: formData.pattern_id,
        component_id: entry.component_id,
        sub_component_id: entry.sub_component_id,
        marks_obtained: entry.marks_obtained,
        max_marks: entry.max_marks,
        remarks: entry.remarks,
        entered_by: entry.entered_by,
        entry_timestamp: new Date().toISOString()
      }, {
        onConflict: 'learner_id,course_id,component_id,sub_component_id'
      })
  }

  // Trigger recalculation
  await recalculateInternalMarks(formData.learner_id, formData.course_id)
}
```

### 3. Result Processing Integration

When processing results:

1. **Fetches all raw marks** for a learner/course
2. **Applies calculation service** using pattern configuration
3. **Checks eligibility and passing rules**
4. **Stores final calculated marks**

```typescript
// Result processing workflow
async function processInternalResults(courseId: string, semesterId: string) {
  const supabase = getSupabaseServer()

  // Get course details
  const { data: course } = await supabase
    .from('courses')
    .select('id, course_type, internal_max_mark')
    .eq('id', courseId)
    .single()

  // Get applicable pattern
  const pattern = await getApplicablePattern(supabase, courseId, course.course_type)

  // Get components and sub-components
  const { data: components } = await supabase
    .from('internal_assessment_components')
    .select('*, internal_assessment_sub_components (*)')
    .eq('pattern_id', pattern.id)
    .eq('is_active', true)

  // Get eligibility and passing rules
  const { data: eligibilityRules } = await supabase
    .from('internal_assessment_eligibility_rules')
    .select('*')
    .eq('pattern_id', pattern.id)
    .eq('is_active', true)

  const { data: passingRules } = await supabase
    .from('internal_assessment_passing_rules')
    .select('*')
    .eq('pattern_id', pattern.id)
    .eq('is_active', true)

  // Get all learners enrolled in course
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('learner_id')
    .eq('course_id', courseId)
    .eq('semester_id', semesterId)

  for (const enrollment of enrollments) {
    // Get raw marks
    const { data: rawMarks } = await supabase
      .from('learner_internal_marks')
      .select('*')
      .eq('learner_id', enrollment.learner_id)
      .eq('course_id', courseId)

    // Get attendance
    const { data: attendance } = await supabase
      .from('learner_attendance')
      .select('percentage')
      .eq('learner_id', enrollment.learner_id)
      .eq('course_id', courseId)
      .single()

    // Build input for calculation
    const input: LearnerAssessmentInput = {
      learner_id: enrollment.learner_id,
      course_id: courseId,
      course_internal_max_mark: course.internal_max_mark,
      component_inputs: buildComponentInputs(rawMarks, components),
      attendance_percentage: attendance?.percentage
    }

    // Calculate marks
    const calculatedMarks = calculateInternalMarks(
      pattern,
      components,
      components.flatMap(c => c.internal_assessment_sub_components),
      input
    )

    // Check eligibility
    const eligibility = checkEligibility(
      eligibilityRules,
      components,
      calculatedMarks,
      attendance?.percentage
    )

    // Check passing
    const passing = checkPassing(
      passingRules,
      components,
      calculatedMarks,
      course.internal_max_mark
    )

    // Store final result
    await supabase
      .from('learner_internal_results')
      .upsert({
        learner_id: enrollment.learner_id,
        course_id: courseId,
        semester_id: semesterId,
        pattern_id: pattern.id,
        total_percentage: calculatedMarks.total_raw_percentage,
        total_marks: calculatedMarks.total_after_rounding,
        max_marks: course.internal_max_mark,
        is_eligible_for_external: eligibility.is_eligible,
        eligibility_remarks: eligibility.failure_reasons.join('; '),
        is_passed: passing.is_passed,
        pass_fail_remarks: passing.failure_reasons.join('; '),
        grace_marks_applied: passing.grace_marks_applied.amount,
        processed_at: new Date().toISOString()
      }, {
        onConflict: 'learner_id,course_id,semester_id'
      })
  }
}
```

## Data Flow Sequence

### Mark Entry to Result Processing

```
┌─────────────────┐
│ Learning        │
│ Facilitator     │
└────────┬────────┘
         │ 1. Enters marks for component
         ▼
┌─────────────────┐
│ Mark Entry      │
│ Interface       │
│ (My JKKN)       │
└────────┬────────┘
         │ 2. Validates against pattern structure
         ▼
┌─────────────────┐
│ learner_        │
│ internal_marks  │
│ (Raw marks)     │
└────────┬────────┘
         │ 3. Triggers recalculation
         ▼
┌─────────────────┐
│ Calculation     │
│ Service         │
│                 │
│ - Weighted %    │
│ - Best-of-N     │
│ - Rounding      │
└────────┬────────┘
         │ 4. Applies rules
         ▼
┌─────────────────┐
│ Eligibility &   │
│ Passing Check   │
└────────┬────────┘
         │ 5. Stores final result
         ▼
┌─────────────────┐
│ learner_        │
│ internal_results│
│ (Final marks)   │
└─────────────────┘
```

## Database Tables for Integration

### New Tables Required

```sql
-- Raw marks entry by learning facilitators
CREATE TABLE learner_internal_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    pattern_id UUID NOT NULL REFERENCES internal_assessment_patterns(id),
    component_id UUID NOT NULL REFERENCES internal_assessment_components(id),
    sub_component_id UUID REFERENCES internal_assessment_sub_components(id),
    marks_obtained NUMERIC(5, 2) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL,
    remarks TEXT,
    entered_by UUID REFERENCES users(id),
    entry_timestamp TIMESTAMPTZ DEFAULT NOW(),
    is_finalized BOOLEAN DEFAULT FALSE,
    finalized_by UUID REFERENCES users(id),
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(learner_id, course_id, component_id, sub_component_id)
);

-- Final calculated results
CREATE TABLE learner_internal_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    semester_id UUID NOT NULL REFERENCES semesters(id),
    pattern_id UUID NOT NULL REFERENCES internal_assessment_patterns(id),

    -- Calculated values
    total_percentage NUMERIC(5, 2) NOT NULL,
    total_marks NUMERIC(5, 2) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL,

    -- Eligibility
    is_eligible_for_external BOOLEAN DEFAULT FALSE,
    eligibility_remarks TEXT,

    -- Passing
    is_passed BOOLEAN DEFAULT FALSE,
    pass_fail_remarks TEXT,
    grace_marks_applied NUMERIC(5, 2) DEFAULT 0,

    -- Metadata
    processed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(learner_id, course_id, semester_id)
);

-- Link exam schedule to pattern components
CREATE TABLE internal_exam_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id),
    semester_id UUID NOT NULL REFERENCES semesters(id),
    component_id UUID NOT NULL REFERENCES internal_assessment_components(id),
    sub_component_id UUID REFERENCES internal_assessment_sub_components(id),

    exam_name VARCHAR(200) NOT NULL,
    exam_date DATE,
    start_time TIME,
    end_time TIME,
    venue VARCHAR(200),
    max_marks NUMERIC(5, 2) NOT NULL,

    status VARCHAR(20) DEFAULT 'scheduled',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Key Calculation Examples

### Theory Course (25 Internal Marks)

```
Pattern: IAP-TH-UG-2024
Components:
  1. Periodic Tests (60% weightage)
     - PT1: 18/25 = 72%
     - PT2: 20/25 = 80%
     - PT3: 15/25 = 60%
     - Best 2 of 3: (72% + 80%) / 2 = 76%
     - Weighted: 76% × 60% = 45.6%

  2. Assignments (25% weightage)
     - Asgn1: 8/10 = 80%
     - Asgn2: 7/10 = 70%
     - Average: 75%
     - Weighted: 75% × 25% = 18.75%

  3. Attendance (15% weightage)
     - 85% attendance
     - Weighted: 85% × 15% = 12.75%

Total Weighted Percentage: 45.6 + 18.75 + 12.75 = 77.1%
Final Internal Marks: 77.1% × 25 = 19.275 → 19 marks (rounded)

Eligibility Check:
  - Attendance: 85% ≥ 75% ✓
  - All mandatory components attempted ✓
  - Result: ELIGIBLE for external exam

Passing Check:
  - Overall: 77.1% ≥ 40% ✓
  - Result: PASSED internal assessment
```

### Practical Course (40 Internal Marks)

```
Pattern: IAP-PR-UG-2024
Components:
  1. Lab Record (40% weightage)
     - Score: 14/16 = 87.5%
     - Weighted: 87.5% × 40% = 35%

  2. Practical Tests (35% weightage)
     - PTest1: 12/20 = 60%
     - PTest2: 17/20 = 85%
     - Best 1 of 2: 85%
     - Weighted: 85% × 35% = 29.75%

  3. Viva Voce (25% weightage)
     - Score: 8/10 = 80%
     - Weighted: 80% × 25% = 20%

Total Weighted Percentage: 35 + 29.75 + 20 = 84.75%
Final Internal Marks: 84.75% × 40 = 33.9 → 34 marks (rounded)

Eligibility Check:
  - Attendance: 82% ≥ 80% ✓
  - Lab record completed ✓
  - Result: ELIGIBLE for external exam

Passing Check:
  - Overall: 84.75% ≥ 50% ✓
  - Lab Record: 87.5% ≥ 40% ✓
  - Result: PASSED internal assessment
```

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/internal-assessment-patterns` | GET | List patterns with filters |
| `/api/internal-assessment-patterns` | POST | Create new pattern |
| `/api/internal-assessment-patterns` | PUT | Update pattern |
| `/api/internal-assessment-patterns` | DELETE | Delete pattern |
| `/api/internal-assessment-patterns/components` | GET/POST/PUT/DELETE | Manage components |
| `/api/internal-assessment-patterns/eligibility-rules` | GET/POST/PUT/DELETE | Manage eligibility rules |
| `/api/internal-assessment-patterns/passing-rules` | GET/POST/PUT/DELETE | Manage passing rules |
| `/api/internal-marks/entry` | POST | Submit marks (Mark Entry) |
| `/api/internal-marks/calculate` | POST | Calculate final marks |
| `/api/internal-marks/results` | GET | Get calculated results |

## Security Considerations

1. **Role-based Access**:
   - Pattern management: COE Admin only
   - Mark entry: Learning Facilitators (for assigned courses)
   - Result viewing: HOD, COE, Learners (own results)

2. **Audit Trail**:
   - All mark entries tracked with `entered_by` and timestamp
   - Changes logged in audit table
   - Finalization requires approval

3. **Data Validation**:
   - Marks cannot exceed max_marks
   - Weightages validated to not exceed 100%
   - Pattern changes require W.E.F versioning
