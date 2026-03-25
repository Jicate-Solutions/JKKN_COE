# 📊 Supabase Database Tables

**Database**: JKKN COE (Controller of Examination)
**Project**: qtsuqhduiuagjjtlalbh
**Last Updated**: November 11, 2025

---

## 📈 Database Summary

**Total Tables**: 29
**Total Records**: 18,400+

---

## 📁 Table Categories

### 1. Authentication & Authorization (6 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **users** | 8 | User accounts with authentication data |
| **roles** | 10 | Role definitions (super_admin, admin, etc.) |
| **permissions** | 34 | Permission definitions (resource:action) |
| **role_permissions** | 67 | Role-permission mappings |
| **user_roles** | 9 | User-role assignments |
| **verification_codes** | 1 | Email verification codes |

**Key Features**:
- Role-based access control (RBAC)
- Permission system (resource:action pattern)
- Email verification
- User management

---

### 2. Master Data (11 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **institutions** | 2 | Educational institutions |
| **departments** | 26 | Academic departments |
| **programs** | 26 | Academic programs |
| **degrees** | 10 | Degree types (BA, BSc, etc.) |
| **courses** | 304 | Course catalog |
| **regulations** | 1 | Academic regulations |
| **semesters** | 136 | Semester definitions |
| **academic_years** | 2 | Academic year periods |
| **batches** | 0 | Student batches (empty) |
| **sections** | 1 | Class sections |
| **boards** | 0 | Education boards (empty) |

**Current Data**:
- ✅ 2 Institutions configured
- ✅ 304 Courses available
- ✅ 26 Programs active
- ✅ 136 Semesters defined

---

### 3. Exam Management (6 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **exam_types** | 1 | Exam type definitions |
| **examination_sessions** | 1 | Exam sessions/periods |
| **exam_timetables** | 244 | Exam schedules |
| **exam_rooms** | 8 | Exam room allocations |
| **exam_registrations** | 9,731 | Student exam registrations |
| **exam_attendance** | 6,085 | Exam attendance records |

**Current Data**:
- ✅ 9,731 Exam registrations
- ✅ 6,085 Attendance records
- ✅ 244 Exam schedules
- ✅ 8 Exam rooms configured

---

### 4. Course Management (2 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **course_mapping** | 431 | Course-program mappings |
| **course_offering** | 0 | Course offerings per semester (empty) |

**Current Data**:
- ✅ 431 Course mappings configured

---

### 5. Grading (2 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **grade_system** | 1 | Grading schemes |
| **grades** | 1 | Student grades |

**Status**: Minimal data (setup phase)

---

### 6. Students (2 tables)

| Table | Records | Description |
|-------|---------|-------------|
| **students** | 1,260 | Student records |
| **dummy_numbers** | 0 | Dummy number assignments (empty) |

**Current Data**:
- ✅ 1,260 Students registered

---

## 🔧 Useful Commands

### List All Tables
```bash
node scripts/list-tables.js
```

### Describe Table Schema
```bash
node scripts/describe-table.js <table_name>
```

**Examples**:
```bash
node scripts/describe-table.js institutions
node scripts/describe-table.js students
node scripts/describe-table.js courses
node scripts/describe-table.js exam_registrations
```

### Test Connection
```bash
node scripts/test-supabase-connection.js
```

---

## 📝 Table Details

### institutions (2 records, 28 columns)

**Purpose**: Stores educational institution information

**Key Columns**:
- `id` (uuid) - Primary key
- `institution_code` (string) - Unique institution code
- `name` (string) - Institution name
- `email`, `phone`, `website` - Contact information
- `address_line1`, `address_line2`, `city`, `state`, `country`, `pin_code` - Address
- `institution_type` - Type (university, college, etc.)
- `timetable_type` - Timetable configuration
- `logo_url` - Institution logo
- `is_active` - Status flag

**Current Institutions**:
1. JKKNCAS - JKKN College of Arts and Science
2. JKKNCAS[SF] - JKKN College of Arts and Science(SF)

---

### users (8 records, 25 columns)

**Purpose**: User authentication and profile data

**Key Columns**:
- `id` (uuid) - Primary key
- `email` (string) - User email
- `full_name` (string) - User full name
- `is_active` (boolean) - Account status
- `created_at`, `updated_at` - Timestamps

**Current Users**: 8 active users

---

### roles (10 records, 7 columns)

**Purpose**: Role definitions for RBAC

**Key Columns**:
- `id` (uuid) - Primary key
- `name` (string) - Role name
- `description` (string) - Role description
- `is_system_role` (boolean) - System role flag
- `is_active` (boolean) - Status flag

**Current Roles**:
1. super_admin - Super Administrator with full access
2. admin - Administrator with limited access
3. moderator - Moderator with content management access
4. user - Regular user with basic access
5. guest - Guest user with read-only access
6. ... (5 more roles)

---

### permissions (34 records, 8 columns)

**Purpose**: Permission definitions

**Key Columns**:
- `id` (uuid) - Primary key
- `name` (string) - Permission name (e.g., "users.create")
- `resource` (string) - Resource name (e.g., "users")
- `action` (string) - Action name (e.g., "create")
- `description` (string) - Permission description

**Permission Pattern**: `{resource}.{action}`

**Examples**:
- users.create
- users.delete
- roles.create
- roles.update

**Current Permissions**: 34 permission rules defined

---

### courses (304 records, 54 columns)

**Purpose**: Course catalog with full course information

**Key Columns**:
- `id` (uuid) - Primary key
- `course_code` (string) - Unique course code
- `course_title` (string) - Course name
- `credits` (integer) - Credit hours
- `course_type` - Theory/Practical/Both
- `institution_code` - Institution reference
- `regulation_code` - Regulation reference
- `is_active` - Status flag

**Current Courses**: 304 courses in catalog

---

### students (1,260 records, 67 columns)

**Purpose**: Student records with comprehensive student information

**Key Columns**:
- `id` (uuid) - Primary key
- `student_id` (string) - Student ID
- `first_name`, `last_name` - Student name
- `email`, `phone` - Contact information
- `program_id` - Program reference
- `batch_id` - Batch reference
- `section_id` - Section reference
- `is_active` - Status flag

**Current Students**: 1,260 students registered

---

### exam_registrations (9,731 records, 23 columns)

**Purpose**: Student exam registrations

**Key Columns**:
- `id` (uuid) - Primary key
- `student_id` - Student reference
- `exam_timetable_id` - Exam schedule reference
- `registration_date` - Registration timestamp
- `status` - Registration status
- `is_active` - Status flag

**Current Registrations**: 9,731 exam registrations

---

### exam_attendance (6,085 records, 20 columns)

**Purpose**: Exam attendance tracking

**Key Columns**:
- `id` (uuid) - Primary key
- `exam_registration_id` - Registration reference
- `attendance_status` - Present/Absent/Late
- `attendance_time` - Check-in time
- `remarks` - Additional notes

**Current Attendance Records**: 6,085 attendance entries

---

### exam_timetables (244 records, 15 columns)

**Purpose**: Exam schedules and timetable

**Key Columns**:
- `id` (uuid) - Primary key
- `exam_session_id` - Session reference
- `course_id` - Course reference
- `exam_date` - Exam date
- `start_time`, `end_time` - Exam timing
- `exam_room_id` - Room allocation

**Current Schedules**: 244 exam schedules

---

### course_mapping (431 records, 28 columns)

**Purpose**: Maps courses to programs and semesters

**Key Columns**:
- `id` (uuid) - Primary key
- `course_id` - Course reference
- `program_id` - Program reference
- `semester_id` - Semester reference
- `is_active` - Status flag

**Current Mappings**: 431 course-program mappings

---

## 🔍 Query Examples

### Fetch All Institutions
```typescript
const { data, error } = await supabase
  .from('institutions')
  .select('*')
```

### Get Students with Programs
```typescript
const { data, error } = await supabase
  .from('students')
  .select(`
    *,
    programs:program_id (
      program_name,
      institutions:institutions_id (name)
    )
  `)
  .limit(10)
```

### Get Exam Registrations with Details
```typescript
const { data, error } = await supabase
  .from('exam_registrations')
  .select(`
    *,
    students:student_id (first_name, last_name),
    exam_timetables:exam_timetable_id (
      exam_date,
      courses:course_id (course_title)
    )
  `)
  .limit(10)
```

### Get Courses by Institution
```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('institution_code', 'JKKNCAS')
  .eq('is_active', true)
```

---

## 📊 Database Statistics

### By Category

**Master Data**: 508 records
- Institutions: 2
- Departments: 26
- Programs: 26
- Degrees: 10
- Courses: 304
- Semesters: 136
- Academic Years: 2
- Sections: 1
- Regulations: 1

**Exam Management**: 16,069 records
- Exam Registrations: 9,731
- Exam Attendance: 6,085
- Exam Timetables: 244
- Exam Rooms: 8
- Exam Sessions: 1

**Students**: 1,260 records

**Authentication**: 128 records
- Users: 8
- Roles: 10
- Permissions: 34
- Role Permissions: 67
- User Roles: 9

**Total**: ~18,400 records

---

## 🔗 Database Access

### Supabase Dashboard
https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh

### Database Editor
https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh/editor

### Table Editor
https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh/editor/{table_name}

---

## 💡 Tips

1. **Use the describe script** to see detailed schema:
   ```bash
   node scripts/describe-table.js <table_name>
   ```

2. **Check table relationships** using joins:
   ```typescript
   .select('*, related_table:foreign_key ( columns )')
   ```

3. **Count records** efficiently:
   ```typescript
   .select('*', { count: 'exact', head: true })
   ```

4. **Filter by status**:
   ```typescript
   .eq('is_active', true)
   ```

---

## 📌 Notes

- All tables use UUID for primary keys
- Most tables have `is_active` status flags
- Timestamps: `created_at`, `updated_at`
- Foreign keys link tables for relationships
- Row Level Security (RLS) is enabled

---

**Need more details?** Use the `describe-table.js` script or check the [Supabase Dashboard](https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh/editor).
