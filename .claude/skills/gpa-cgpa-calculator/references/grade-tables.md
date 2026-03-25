# Grade Conversion Tables

## UG (Undergraduate) Grade Table

| Percentage Range | Grade Point | Letter Grade | Description |
|------------------|-------------|--------------|-------------|
| 90-100 | 10.0 | O | Outstanding |
| 80-89 | 9.0 | D+ | Excellent |
| 75-79 | 8.0 | D | Distinction |
| 70-74 | 7.5 | A+ | Very Good |
| 60-69 | 7.0 | A | Good |
| 50-59 | 6.0 | B | Average |
| 40-49 | 5.0 | C | Satisfactory |
| 0-39 | 0.0 | U | Re-Appear |
| Absent | 0.0 | AAA | ABSENT |

### UG Default Pass Requirements (Fallback Only)

| Component | Minimum |
|-----------|---------|
| CIA (Internal) | No minimum |
| CE (External) | ≥ 40% |
| Total | ≥ 40% |

**Note:** Actual pass marks should be fetched from the `courses` table.

---

## PG (Postgraduate) Grade Table

| Percentage Range | Grade Point | Letter Grade | Description |
|------------------|-------------|--------------|-------------|
| 90-100 | 10.0 | O | Outstanding |
| 80-89 | 9.0 | D+ | Excellent |
| 75-79 | 8.0 | D | Distinction |
| 70-74 | 7.5 | A+ | Very Good |
| 60-69 | 7.0 | A | Good |
| 50-59 | 6.0 | B | Average |
| 0-49 | 0.0 | U | Re-Appear |
| Absent | 0.0 | AAA | ABSENT |

### PG Default Pass Requirements (Fallback Only)

| Component | Minimum |
|-----------|---------|
| CIA (Internal) | No minimum |
| CE (External) | ≥ 50% |
| Total | ≥ 50% |

**Note:** Actual pass marks should be fetched from the `courses` table.

---

## TypeScript Interface

```typescript
interface GradeTableEntry {
  min: number        // Minimum percentage (inclusive)
  max: number        // Maximum percentage (inclusive)
  gradePoint: number // Grade point value (0-10)
  letterGrade: string // Letter grade (O, D+, D, A+, A, B, C, U, AAA)
  description: string // Grade description
}

// Fallback UG Grade Table
const FALLBACK_UG_GRADE_TABLE: GradeTableEntry[] = [
  { min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
  { min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
  { min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
  { min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
  { min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
  { min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
  { min: 40, max: 49, gradePoint: 5.0, letterGrade: 'C', description: 'Satisfactory' },
  { min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
  { min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

// Fallback PG Grade Table
const FALLBACK_PG_GRADE_TABLE: GradeTableEntry[] = [
  { min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
  { min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
  { min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
  { min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
  { min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
  { min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
  { min: 0, max: 49, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
  { min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]
```

---

## Database Schema (grade_system table)

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

### Fetching Grade Tables from Database

```typescript
async function fetchGradeTables() {
  const res = await fetch('/api/grading/grade-system?is_active=true')
  if (!res.ok) throw new Error('Failed to fetch grade tables')

  const data = await res.json()

  const transformToGradeEntry = (record: any): GradeTableEntry => ({
    min: Number(record.min_mark),
    max: Number(record.max_mark),
    gradePoint: Number(record.grade_point),
    letterGrade: record.grade,
    description: record.description
  })

  const ugRecords = data
    .filter((r: any) => r.grade_system_code === 'UG')
    .map(transformToGradeEntry)
    .sort((a: GradeTableEntry, b: GradeTableEntry) => b.min - a.min)

  const pgRecords = data
    .filter((r: any) => r.grade_system_code === 'PG')
    .map(transformToGradeEntry)
    .sort((a: GradeTableEntry, b: GradeTableEntry) => b.min - a.min)

  return { ugGradeTable: ugRecords, pgGradeTable: pgRecords }
}
```
