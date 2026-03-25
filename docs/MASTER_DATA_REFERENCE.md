# Master Data Reference Sheet

This document outlines all master data requirements for Course and Course Mapping modules. Use this as a reference for validations, dropdowns, and template uploads.

## Course Master Data

### Required Fields
- **Institution Code** *(required)*
  - Format: Based on institution master
  - Source: `/api/institutions`
  - Usage: Dropdown, Validation

- **Regulation Code** *(required)*
  - Format: Based on regulation master
  - Source: `/api/regulations`
  - Usage: Dropdown, Validation

- **Course Code** *(required)*
  - Format: Alphanumeric with hyphens and underscores only (`^[A-Za-z0-9\-_]+$`)
  - Usage: Primary identifier

- **Course Title** *(required)*
  - Format: Text
  - Usage: Display name

- **Display Code** *(required)*
  - Format: Text
  - Usage: Alternative display identifier

- **QP Code** *(required)*
  - Format: Text
  - Usage: Question paper reference

- **Course Category** *(required)*
  - Format: Text
  - Usage: Classification

- **Evaluation Type** *(required)*
  - Format: Enum
  - Values: ["CA", "ESE", "CA + ESE"]
  - Usage: Assessment type

- **Result Type** *(required)*
  - Format: Enum
  - Default: "Mark"
  - Values: ["Mark", "Status"]
  - Usage: Result display format

### Optional Fields
- **Offering Department Code**
  - Source: `/api/departments`
  - Format: Based on department master
  - Usage: Department reference

- **Course Type**
  - Format: Enum
  - Values: ["Core", "Elective", "Practical", "Project"]
  - Usage: Course classification

- **Course Part Master**
  - Format: Text
  - Usage: Part/Section identifier

### Numeric Validations
- **Credits**
  - Range: 0-99
  - Format: Integer
  - Default: 0

- **Theory Credit** (if split credit enabled)
  - Range: 0-99
  - Format: Integer
  - Required when split_credit is true

- **Practical Credit** (if split credit enabled)
  - Range: 0-99
  - Format: Integer
  - Required when split_credit is true

- **Duration Hours**
  - Range: 0-9999
  - Format: Integer
  - Optional

- **No of QP Setter**
  - Range: 0-100
  - Format: Integer
  - Optional

- **No of Scrutinizer**
  - Range: 0-100
  - Format: Integer
  - Optional

### Boolean Flags
- **Split Credit**
- **Self Study Course**
- **Outside Class Course**
- **Open Book**
- **Online Course**
- **Dummy Number Required**
- **Annual Course**
- **Multiple QP Set**
- **Fee Exception**
- **Is Active** (default: true)

## Course Mapping Master Data

### Required Fields
- **Course ID**
  - Source: `/api/courses`
  - Format: UUID
  - Usage: Course reference

- **Institution Code**
  - Source: `/api/institutions`
  - Format: Based on institution master
  - Usage: Institution reference

- **Program Code**
  - Source: `/api/programs`
  - Format: Based on program master
  - Usage: Program reference

- **Batch Code**
  - Source: `/api/batch`
  - Format: Based on batch master
  - Usage: Batch reference

### Optional Fields
- **Semester Code**
  - Source: `/api/semesters`
  - Format: Based on semester master
  - Usage: Semester reference

- **Course Group**
  - Format: Text
  - Usage: Grouping courses

### Numeric Fields
- **Course Order**
  - Default: 1
  - Format: Integer
  - Usage: Display order

- **Internal Max Mark**
  - Default: 40
  - Format: Integer
  - Usage: Internal assessment maximum

- **Internal Pass Mark**
  - Default: 0
  - Format: Integer
  - Usage: Internal assessment pass mark

- **External Max Mark**
  - Default: 60
  - Format: Integer
  - Usage: External assessment maximum

- **External Pass Mark**
  - Default: 0
  - Format: Integer
  - Usage: External assessment pass mark

- **Total Pass Mark**
  - Default: 0
  - Format: Integer
  - Usage: Overall pass mark

- **Total Max Mark**
  - Default: 100
  - Format: Integer
  - Usage: Overall maximum mark

## API Endpoints Reference

### Course Module
- GET `/api/courses` - List all courses
- POST `/api/courses` - Create new course
- PUT `/api/courses/{id}` - Update course
- DELETE `/api/courses/{id}` - Delete course

### Course Mapping Module
- GET `/api/course-mapping` - List all mappings
- POST `/api/course-mapping` - Create new mapping
- PUT `/api/course-mapping/{id}` - Update mapping
- DELETE `/api/course-mapping/{id}` - Delete mapping

### Master Data APIs
- `/api/institutions` - Institution master
- `/api/regulations` - Regulation master
- `/api/departments` - Department master
- `/api/programs` - Program master
- `/api/batch` - Batch master
- `/api/semesters` - Semester master

## Template Formats

### Course Template Headers
```
Institution Code*, Regulation Code*, Offering Department Code,
Course Code*, Course Name*, Display Code*,
Course Category*, Course Type, Part,
Credit, Split Credit (TRUE/FALSE), Theory Credit, Practical Credit,
QP Code*, E-Code Name, Duration (hours),
Evaluation Type* (CA/ESE/CA + ESE), Result Type* (Mark/Status),
Self Study Course (TRUE/FALSE), Outside Class Course (TRUE/FALSE),
Open Book (TRUE/FALSE), Online Course (TRUE/FALSE),
Dummy Number Required (TRUE/FALSE), Annual Course (TRUE/FALSE),
Multiple QP Set (TRUE/FALSE), No of QP Setter, No of Scrutinizer,
Fee Exception (TRUE/FALSE), Syllabus PDF URL, Description, Status (TRUE/FALSE)
```

### Course Mapping Template Headers
```
Course ID*, Institution Code*, Program Code*, Batch Code*,
Semester Code, Course Group, Course Order,
Internal Max Mark, Internal Pass Mark, External Max Mark, External Pass Mark,
Total Pass Mark, Total Max Mark, Is Active (TRUE/FALSE)
```

*Note: Fields marked with * are required fields.*