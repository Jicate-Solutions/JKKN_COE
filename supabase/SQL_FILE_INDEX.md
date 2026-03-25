# SQL File Index

## Overview
This document tracks all SQL files and database objects in the JKKN COE Supabase project.

**Last Updated**: 2025-11-03

⚠️ **IMPORTANT**: This file may be outdated. Always use Supabase MCP tools to query real-time database state before relying on this documentation.

## Directory Structure

```
supabase/
├── setup/              # Consolidated SQL files (production schema)
│   ├── 01_tables.sql   # All table definitions
│   ├── 02_functions.sql # All database functions
│   ├── 03_policies.sql  # All RLS policies
│   ├── 04_triggers.sql  # All triggers
│   └── 05_views.sql     # All views
├── migrations/         # Historical migration files (development history)
├── functions/          # Edge functions
├── references/         # Templates and patterns
└── scripts/           # Utility scripts
```

## Core Tables

### Authentication & Authorization
- **users** - User profiles and authentication data
- **roles** - Role definitions (admin, teacher, student, etc.)
- **permissions** - Permission definitions (resource:action format)
- **role_permissions** - Many-to-many relationship between roles and permissions
- **user_roles** - Many-to-many relationship between users and roles

### Academic Structure
- **institutions** - Educational institutions (colleges)
- **degrees** - Degree programs (BA, BSc, etc.)
- **departments** - Academic departments
- **programs** - Specific programs (BA English, BSc Physics, etc.)
- **regulations** - Academic regulations (2021, 2022, etc.)
- **semesters** - Semester definitions (Semester 1-8)
- **sections** - Class sections (A, B, C, etc.)
- **academic_years** - Academic year periods

### Course Management
- **courses** - Course definitions
- **course_mapping** - Maps courses to programs/semesters
- **course_offering** - Actual course offerings per academic year

### Student Management
- **students** - Student information
- **verification_codes** - Email verification codes

### Grading System
- **grade_system** - Grade system definitions
- **grades** - Grade definitions and point mappings

### Examination
- **exam_attendance** - Exam attendance tracking

## Database Functions

### Utility Functions
- **update_updated_at()** - Automatically updates updated_at timestamp
- **update_updated_at_column()** - Alternative updated_at trigger function
- **log_user_activity()** - Logs user activity for audit trail

### Student Functions
- **auto_populate_student_institution()** - Auto-populates institution from program
- **validate_student_semester_consistency()** - Validates semester against program duration
- **sync_student_email_with_profile()** - Syncs student email with user profile
- **validate_student_email_change()** - Prevents duplicate college emails
- **set_username_from_email()** - Sets username from email if not provided

### Reporting Functions
- **get_student_attendance_sheet()** - Generates student attendance sheet
- **get_exam_attendance_report()** - Generates exam attendance report

## Views

- **students_detailed_view** - Denormalized student data with all related entities

## RLS Policies

### Users Table
- Users can read own data
- Users can update own data
- Service role can manage all users
- Admins can view all users
- Admins can manage users

### Multi-Tenant Pattern
Most tables follow institution-based RLS:
- Users can only access data from their institution
- Filtering by `institution_id` column

## Indexes

All tables have appropriate indexes on:
- Primary keys (automatic)
- Foreign keys (for join performance)
- Columns used in RLS policies (critical for performance)
- Frequently queried columns (email, codes, status fields)

## Triggers

### Updated At Triggers
Most tables have `BEFORE UPDATE` triggers that automatically update `updated_at` timestamp.

### Validation Triggers
- **students**: Email uniqueness, semester consistency validation
- **users**: Username auto-population from email

### Audit Triggers
- **users**: Activity logging trigger

## Multi-Tenant Architecture

All entity tables include:
- `institution_id` - UUID reference to institutions table
- `institution_code` - TEXT reference for human-readable lookups

Both fields are maintained for:
- Performance (UUID joins are faster)
- Readability (codes are easier to work with in UI/imports)

## Security Notes

- All tables have RLS enabled
- Service role bypasses RLS for admin operations
- Authenticated users can only access their institution's data
- Anonymous access is restricted
- Function security defaults to `SECURITY INVOKER` (safer)

## Migration History

See `supabase/migrations/` directory for chronological migration history.
Total migrations: 33+

## Adding New Objects

When adding new database objects:

1. **FIRST**: Query real-time database with Supabase MCP tools
2. **NEVER** create duplicate SQL files
3. **UPDATE** existing files in `supabase/setup/` directory:
   - Tables → `01_tables.sql`
   - Functions → `02_functions.sql`
   - Policies → `03_policies.sql`
   - Triggers → `04_triggers.sql`
   - Views → `05_views.sql`
4. **ADD** dated comments explaining changes
5. **UPDATE** this index file
6. **CREATE** indexes for RLS policy columns
7. **TEST** with different user roles

## Common Queries

### List All Tables
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

### Get Table Structure
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;
```

### Check RLS Status
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

### List All Policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

**Remember**: ALWAYS use Supabase MCP tools to query real-time database state. This file is for documentation reference only and may not reflect current database reality.
