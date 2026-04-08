# Internal Marks API Integration Spec

**For:** MyJKKN Portal Development Team
**Version:** 1.0
**Date:** 2026-04-07

---

## Overview

This document describes how MyJKKN portal can integrate with COE's Internal Mark Entry system. MyJKKN users (HOD / Faculty) can enter CIA (Continuous Internal Assessment) marks and download reports via COE's external API.

### Architecture

```
MyJKKN Portal                          COE System
+------------------+                   +------------------+
| HOD / Faculty    |                   | cia_entry_settings|
| Mark Entry UI    | --- API Key ----> | cia_marks table   |
| Report Download  |                   | exam_registrations|
+------------------+                   +------------------+
       |                                       |
       |  Programs, Courses, Learners          |
       +--- MyJKKN's own DB ------------------+
```

### Key Points
- **MyJKKN already has**: Programs, Courses, Learners, Staff data (no need to fetch from COE)
- **COE provides**: CIA Settings (round config), Mark storage, Report generation
- **Auth**: API key from Developer Portal (X-API-Key-Id + X-API-Secret headers)

---

## Authentication

### API Key Setup

1. Go to **Developer Portal > Applications** in COE
2. Create application: "MyJKKN Internal Marks"
3. Generate API key pair
4. Assign permissions:

| Module | Operations | Description |
|--------|-----------|-------------|
| `cia-settings` | `read` | Read CIA round configuration |
| `cia-marks` | `read`, `create`, `update` | Enter and edit CIA marks |
| `cia-report` | `read` | Download mark entry reports |

### Request Headers

```
X-API-Key-Id: ak_coe_xxxxxxxxxxxxxxxxxxxxxxxx
X-API-Secret: sk_coe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Error Responses (Auth)

| Status | Error | Meaning |
|--------|-------|---------|
| 401 | `Missing API credentials` | Headers not provided |
| 401 | `Invalid API key` | Key not found or secret mismatch |
| 401 | `API key expired` | Key past expiry date |
| 403 | `Insufficient permissions` | Key doesn't have required module/operation |
| 429 | `Rate limit exceeded` | Too many requests |

---

## API Endpoints

### Base URL
```
Production: https://coe.jkkn.ai/api/v1
```

---

### 1. Get CIA Settings

Read the CIA round configuration for a given institution + exam session.

```
GET /api/v1/cia-settings
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `institutions_id` | uuid | Yes | COE institution ID |
| `examination_session_id` | uuid | Yes | Exam session ID |
| `program_code` | string | No | Filter by program (e.g., "UEN") |

**Permission:** `cia-settings:read`

**Response:**
```json
[
  {
    "id": "uuid",
    "setting_name": "CIA Theory - 2024",
    "institution_code": "CAS",
    "regulation_code": "R-2024",
    "program_codes": ["UEN", "UHI", "UMA"],
    "course_type": ["Theory", "Practical"],
    "use_course_max": false,
    "total_rounds": 3,
    "cia_rounds": [
      {
        "round": 1,
        "round_name": "CIA-1",
        "entry_from": "2026-04-01",
        "entry_to": "2026-04-15",
        "components": [
          { "code": "test_1", "name": "Test 1", "max_marks": 25 }
        ]
      },
      {
        "round": 2,
        "round_name": "CIA-2",
        "entry_from": "2026-04-16",
        "entry_to": "2026-04-30",
        "components": [
          { "code": "test_2", "name": "Test 2", "max_marks": 25 }
        ]
      },
      {
        "round": 3,
        "round_name": "CIA-3",
        "entry_from": "2026-05-01",
        "entry_to": "2026-05-15",
        "components": [
          { "code": "test_3", "name": "Test 3", "max_marks": 20 },
          { "code": "assignment", "name": "Assignment", "max_marks": 10 },
          { "code": "quiz", "name": "Quiz", "max_marks": 5 },
          { "code": "attendance", "name": "Attendance", "max_marks": 5 }
        ]
      }
    ]
  }
]
```

**Usage:** MyJKKN reads this to determine:
- Which CIA rounds exist
- Which components to show per round
- Max marks per component
- Entry date window (optional — MyJKKN can enforce or ignore)

---

### 2. Submit CIA Marks

Create or update CIA marks for learners.

```
POST /api/v1/cia-marks/sync
```

**Permission:** `cia-marks:create`

**Request Body:**
```json
{
  "records": [
    {
      "institutions_id": "uuid",
      "examination_session_id": "uuid",
      "course_offering_id": "uuid",
      "student_id": "uuid",
      "exam_registration_id": "uuid",
      "cia_round": 1,
      "test_1_mark": 22,
      "max_test_1_mark": 25,
      "marks_status": "Submitted",
      "total_internal_marks": 22,
      "max_internal_marks": 25
    }
  ]
}
```

**Component Mark Fields:**

| Component | Mark Field | Max Field |
|-----------|-----------|-----------|
| Assignment | `assignment_marks` | `max_assignment_marks` |
| Quiz | `quiz_marks` | `max_quiz_marks` |
| Mid Term | `mid_term_marks` | `max_mid_term_marks` |
| Presentation | `presentation_marks` | `max_presentation_marks` |
| Attendance | `attendance_marks` | `max_attendance_marks` |
| Lab | `lab_marks` | `max_lab_marks` |
| Project | `project_marks` | `max_project_marks` |
| Seminar | `seminar_marks` | `max_seminar_marks` |
| Viva | `viva_marks` | `max_viva_marks` |
| Test 1 | `test_1_mark` | `max_test_1_mark` |
| Test 2 | `test_2_mark` | `max_test_2_mark` |
| Test 3 | `test_3_mark` | `max_test_3_mark` |
| Other | `other_marks` | `max_other_marks` |

**Upsert Behavior:** If a record already exists for the same `(student_id, course_offering_id, examination_session_id, cia_round)`, it will be updated.

**Limits:** Max 500 records per request.

**Response (Success):**
```json
{
  "success": true,
  "inserted": 45,
  "updated": 5,
  "total": 50,
  "message": "Saved marks: 45 new, 5 updated"
}
```

**Response (Error):**
```json
{
  "error": "Validation failed",
  "details": [
    "25JUGENG001: test_1 mark (30) exceeds max (25)"
  ]
}
```

---

### 3. Get Marks Report Data

Fetch entered marks for generating reports.

```
GET /api/v1/cia-marks/report
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `institutions_id` | uuid | Yes | Institution |
| `examination_session_id` | uuid | Yes | Exam session |
| `course_code` | string | Yes | Course code (e.g., "24UGTA02") |
| `program_code` | string | No | Program filter |
| `cia_round` | integer | Yes | CIA round number (1, 2, 3) |

**Permission:** `cia-report:read`

**Response:**
```json
{
  "course": {
    "course_code": "24UGTA02",
    "course_name": "GENERAL TAMIL-II",
    "internal_max_mark": 25
  },
  "learners": [
    {
      "register_number": "25JUGENG001",
      "student_name": "DEEPA D",
      "dummy_number": "DN001",
      "marks": {
        "test_1": 22
      },
      "total": 22,
      "marks_in_words": "Twenty Two"
    }
  ],
  "summary": {
    "total_learners": 50,
    "marks_entered": 48,
    "pending": 2
  }
}
```

---

## MyJKKN Implementation Guide

### User Flow

```
HOD / Faculty logs into MyJKKN
  |
  v
Select: Institution > Exam Session
  |
  v
[Call GET /api/v1/cia-settings] --> Get CIA round config
  |
  v
Select: Assessment (Setting + Round) > Program > Semester > Course
  |
  v
[MyJKKN shows learners from own DB]
  |
  v
Enter marks per component
  |
  v
[Call POST /api/v1/cia-marks/sync] --> Save to COE
  |
  v
[Call GET /api/v1/cia-marks/report] --> Generate PDF
```

### Role-Based Access

| Role | Access | Scope |
|------|--------|-------|
| HOD | Enter marks for all courses in their department's programs | Filtered by department > programs |
| Faculty (future) | Enter marks for their assigned courses only | Filtered by staff_plan assignment |

### Data Mapping (MyJKKN to COE)

MyJKKN already has programs, courses, and learners. Key mappings:

| MyJKKN Field | COE Field | Notes |
|--------------|-----------|-------|
| `institution_id` | `institutions_id` | Use `myjkkn_institution_ids` on COE institutions table |
| `program_id` (CODE) | `program_code` | MyJKKN `program_id` is a CODE like "UEN", not UUID |
| `course.internal_max_mark` | Same | Both systems have this |
| Learner `id` | `student_id` | MyJKKN learner UUID |
| Learner `register_no` | `stu_register_no` | Register number |

### Entry Date Validation

CIA settings include `entry_from` and `entry_to` dates per round. MyJKKN **should** enforce these:
- If `today < entry_from`: Show "Opens on {date}" (disabled)
- If `today >= entry_from && today <= entry_to`: Allow entry
- If `today > entry_to`: Show "Entry closed" (read-only, can view)

### Finding course_offering_id

MyJKKN needs `course_offering_id` for the sync API. Options:
1. **Recommended:** COE can expose a lookup: `GET /api/v1/course-offerings?course_code=X&program_code=Y&semester=Z`
2. **Alternative:** MyJKKN stores COE course_offering_ids during initial setup

---

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 200 | - | Success |
| 201 | - | Created |
| 400 | `VALIDATION_ERROR` | Invalid marks or missing fields |
| 400 | `EXCEEDS_MAX` | Mark exceeds max marks |
| 401 | `AUTH_REQUIRED` | Missing or invalid API key |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Course/session not found |
| 429 | `RATE_LIMITED` | Too many requests (limit: 100/min) |
| 500 | `SERVER_ERROR` | Internal error |

---

## Developer Portal Setup

1. **Create Application** in COE Developer Portal
   - Name: "MyJKKN Internal Marks"
   - Description: "CIA mark entry from MyJKKN portal"

2. **Generate API Key**
   - Key name: "Production Key"
   - Expiry: 90 days (regenerate before expiry)

3. **Assign Permissions**
   ```
   Module: cia-settings  | Operation: read
   Module: cia-marks     | Operation: read, create, update
   Module: cia-report    | Operation: read
   ```

4. **Restrict to Institution** (optional)
   - Scope key to specific `institution_id` for security

---

## Sample cURL

### Get CIA Settings
```bash
curl -X GET "https://coe.jkkn.ai/api/v1/cia-settings?institutions_id=UUID&examination_session_id=UUID" \
  -H "X-API-Key-Id: ak_coe_xxx" \
  -H "X-API-Secret: sk_coe_xxx"
```

### Submit Marks
```bash
curl -X POST "https://coe.jkkn.ai/api/v1/cia-marks/sync" \
  -H "X-API-Key-Id: ak_coe_xxx" \
  -H "X-API-Secret: sk_coe_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "institutions_id": "uuid",
        "examination_session_id": "uuid",
        "course_offering_id": "uuid",
        "student_id": "uuid",
        "exam_registration_id": "uuid",
        "cia_round": 1,
        "test_1_mark": 22,
        "max_test_1_mark": 25,
        "total_internal_marks": 22,
        "max_internal_marks": 25,
        "marks_status": "Submitted"
      }
    ]
  }'
```

### Get Report
```bash
curl -X GET "https://coe.jkkn.ai/api/v1/cia-marks/report?institutions_id=UUID&examination_session_id=UUID&course_code=24UGTA02&cia_round=1" \
  -H "X-API-Key-Id: ak_coe_xxx" \
  -H "X-API-Secret: sk_coe_xxx"
```
