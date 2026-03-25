# Database Schema for GPA/CGPA Calculation

## Required Tables

### 1. courses

Stores course information including pass mark requirements.

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  credits NUMERIC(3,1) NOT NULL,

  -- Max marks configuration
  internal_max_mark NUMERIC DEFAULT 40,
  external_max_mark NUMERIC DEFAULT 60,
  total_max_mark NUMERIC DEFAULT 100,

  -- Pass mark configuration (COURSE-SPECIFIC)
  internal_pass_mark NUMERIC DEFAULT 0,  -- 0 = no minimum
  external_pass_mark NUMERIC DEFAULT 0,  -- Set per course
  total_pass_mark NUMERIC DEFAULT 0,     -- Set per course

  -- Other fields
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Key Points:**
- Pass marks are stored per course, not hardcoded by program type
- Default `0` means no minimum required for that component
- Values can be absolute marks or percentages (trigger handles both)

---

### 2. grade_system

Stores grade conversion tables for UG and PG programs.

```sql
CREATE TABLE grade_system (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_system_code VARCHAR(10) NOT NULL,  -- 'UG' or 'PG'
  min_mark NUMERIC NOT NULL,
  max_mark NUMERIC NOT NULL,
  grade_point NUMERIC(3,1) NOT NULL,
  grade VARCHAR(10) NOT NULL,
  description VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3. final_marks

Stores student marks for each course offering.

```sql
CREATE TABLE final_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id),

  -- Marks obtained
  internal_marks_obtained NUMERIC DEFAULT 0,
  external_marks_obtained NUMERIC DEFAULT 0,
  total_marks_obtained NUMERIC DEFAULT 0,

  -- Max marks (denormalized for performance)
  internal_marks_maximum NUMERIC DEFAULT 40,
  external_marks_maximum NUMERIC DEFAULT 60,
  total_marks_maximum NUMERIC DEFAULT 100,

  -- Calculated fields (set by trigger)
  is_pass BOOLEAN,
  pass_status VARCHAR(10),  -- 'Pass' or 'Fail'
  is_distinction BOOLEAN,
  is_first_class BOOLEAN,

  -- Grade info (set by application or trigger)
  grade_point NUMERIC(3,1),
  letter_grade VARCHAR(10),

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4. course_offerings

Links courses to specific semesters/sessions.

```sql
CREATE TABLE course_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  program_id UUID NOT NULL REFERENCES programs(id),

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

### 5. semester_results (Optional - for storing calculated GPA)

```sql
CREATE TABLE semester_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  session_id UUID NOT NULL REFERENCES sessions(id),

  -- Calculated values
  total_credits NUMERIC,
  total_credit_points NUMERIC,
  gpa NUMERIC(4,2),

  -- Statistics
  courses_count INTEGER,
  passed_count INTEGER,
  failed_count INTEGER,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

## Auto Pass Status Trigger

The `auto_determine_pass_status` trigger automatically calculates pass status when marks are inserted or updated.

### Trigger Function

```sql
CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_internal_max_mark NUMERIC;
    v_external_max_mark NUMERIC;
    v_total_max_mark NUMERIC;
    v_internal_pct DECIMAL(5,2);
    v_external_pct DECIMAL(5,2);
    v_total_pct DECIMAL(5,2);
    v_internal_pass_pct DECIMAL(5,2);
    v_external_pass_pct DECIMAL(5,2);
    v_total_pass_pct DECIMAL(5,2);
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Fetch pass criteria from COURSES table
    SELECT
        c.internal_pass_mark,
        c.external_pass_mark,
        c.total_pass_mark,
        c.internal_max_mark,
        c.external_max_mark,
        c.total_max_mark
    INTO
        v_internal_pass_mark,
        v_external_pass_mark,
        v_total_pass_mark,
        v_internal_max_mark,
        v_external_max_mark,
        v_total_max_mark
    FROM public.course_offerings co
    INNER JOIN public.courses c ON co.course_id = c.id
    WHERE co.id = NEW.course_offering_id;

    -- Default max marks from NEW record if not found
    v_internal_max_mark := COALESCE(v_internal_max_mark, NEW.internal_marks_maximum);
    v_external_max_mark := COALESCE(v_external_max_mark, NEW.external_marks_maximum);
    v_total_max_mark := COALESCE(v_total_max_mark, NEW.total_marks_maximum);

    -- Pass marks default to 0 (no minimum if not set)
    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

    -- Calculate obtained percentages
    IF NEW.internal_marks_maximum > 0 THEN
        v_internal_pct := ROUND((NEW.internal_marks_obtained / NEW.internal_marks_maximum) * 100, 2);
    ELSE
        v_internal_pct := 0;
    END IF;

    IF NEW.external_marks_maximum > 0 THEN
        v_external_pct := ROUND((NEW.external_marks_obtained / NEW.external_marks_maximum) * 100, 2);
    ELSE
        v_external_pct := 0;
    END IF;

    IF NEW.total_marks_maximum > 0 THEN
        v_total_pct := ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- Calculate pass percentage thresholds
    -- If pass_mark < max_mark, it's absolute - convert to percentage
    -- If pass_mark >= max_mark, assume stored as percentage

    IF v_internal_max_mark > 0 AND v_internal_pass_mark > 0 THEN
        IF v_internal_pass_mark < v_internal_max_mark THEN
            v_internal_pass_pct := ROUND((v_internal_pass_mark / v_internal_max_mark) * 100, 2);
        ELSE
            v_internal_pass_pct := v_internal_pass_mark;
        END IF;
    ELSE
        v_internal_pass_pct := 0;
    END IF;

    IF v_external_max_mark > 0 AND v_external_pass_mark > 0 THEN
        IF v_external_pass_mark < v_external_max_mark THEN
            v_external_pass_pct := ROUND((v_external_pass_mark / v_external_max_mark) * 100, 2);
        ELSE
            v_external_pass_pct := v_external_pass_mark;
        END IF;
    ELSE
        v_external_pass_pct := 0;
    END IF;

    IF v_total_max_mark > 0 AND v_total_pass_mark > 0 THEN
        IF v_total_pass_mark < v_total_max_mark THEN
            v_total_pass_pct := ROUND((v_total_pass_mark / v_total_max_mark) * 100, 2);
        ELSE
            v_total_pass_pct := v_total_pass_mark;
        END IF;
    ELSE
        v_total_pass_pct := 0;
    END IF;

    -- Determine pass/fail
    v_passes_internal := (v_internal_pass_pct = 0) OR (v_internal_pct >= v_internal_pass_pct);
    v_passes_external := (v_external_pass_pct = 0) OR (v_external_pct >= v_external_pass_pct);
    v_passes_total := (v_total_pass_pct = 0) OR (v_total_pct >= v_total_pass_pct);

    IF v_passes_internal AND v_passes_external AND v_passes_total THEN
        NEW.is_pass = true;
        NEW.pass_status = 'Pass';
        NEW.is_distinction = (v_total_pct >= 75);
        NEW.is_first_class = (v_total_pct >= 60);
    ELSE
        NEW.is_pass = false;
        NEW.pass_status = 'Fail';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Create Trigger

```sql
CREATE TRIGGER trg_auto_determine_pass_status
BEFORE INSERT OR UPDATE ON final_marks
FOR EACH ROW
EXECUTE FUNCTION auto_determine_pass_status();
```

---

## Useful Queries

### Get Student GPA for a Semester

```sql
SELECT
    s.register_no,
    s.student_name,
    SUM(c.credits * fm.grade_point) / SUM(c.credits) AS gpa,
    SUM(c.credits) AS total_credits,
    SUM(c.credits * fm.grade_point) AS total_credit_points
FROM final_marks fm
JOIN course_offerings co ON fm.course_offering_id = co.id
JOIN courses c ON co.course_id = c.id
JOIN students s ON fm.student_id = s.id
WHERE co.semester_id = :semester_id
  AND fm.is_active = true
GROUP BY s.id, s.register_no, s.student_name;
```

### Get Student CGPA (All Semesters)

```sql
WITH semester_gpas AS (
    SELECT
        s.id AS student_id,
        co.semester_id,
        SUM(c.credits * fm.grade_point) / SUM(c.credits) AS gpa,
        SUM(c.credits) AS total_credits
    FROM final_marks fm
    JOIN course_offerings co ON fm.course_offering_id = co.id
    JOIN courses c ON co.course_id = c.id
    JOIN students s ON fm.student_id = s.id
    WHERE fm.is_active = true
    GROUP BY s.id, co.semester_id
)
SELECT
    student_id,
    SUM(gpa * total_credits) / SUM(total_credits) AS cgpa,
    SUM(total_credits) AS overall_credits
FROM semester_gpas
GROUP BY student_id;
```
