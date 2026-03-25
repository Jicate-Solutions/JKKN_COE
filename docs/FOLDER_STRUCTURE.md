# COE Application Folder Structure

This document describes the complete folder structure for the JKKN COE (Controller of Examination) application.

## Overview

The application uses Next.js 15 App Router with a hierarchical organization based on functional domains. All authenticated pages are under the `app/(coe)/` route group with subdirectories for each major functional area. API routes follow the same domain-based organization under `app/api/`.

## Application Structure

### Frontend Pages (`app/(coe)/`)

```
app/
├── (coe)/                                  # Route group for authenticated pages
│   ├── layout.tsx                          # Protected route wrapper with RBAC
│   │
│   ├── dashboard/                          # Main Dashboard
│   │   └── page.tsx                        # Dashboard overview
│   │
│   ├── master/                             # Master Data Management
│   │   ├── institutions/page.tsx           # Institution management
│   │   ├── degrees/page.tsx                # Degree programs
│   │   ├── departments/page.tsx            # Department management
│   │   ├── programs/page.tsx               # Program management
│   │   ├── courses/                        # Course catalog
│   │   │   ├── page.tsx                    # Main courses page
│   │   │   └── page-refactored.tsx         # Refactored version
│   │   ├── regulations/                    # Academic regulations
│   │   │   ├── page.tsx                    # List view
│   │   │   ├── add/page.tsx                # Add new regulation
│   │   │   └── edit/[id]/page.tsx          # Edit regulation
│   │   ├── academic-years/page.tsx         # Academic year setup
│   │   ├── semesters/page.tsx              # Semester management
│   │   ├── sections/page.tsx               # Section management
│   │   ├── batches/page.tsx                # Batch management
│   │   └── boards/page.tsx                 # Board management
│   │
│   ├── course-management/                  # Course Operations
│   │   ├── course-offering/page.tsx        # Course offerings for exams
│   │   ├── course-mapping/                 # Course mapping
│   │   │   ├── page.tsx                    # Main mapping page
│   │   │   ├── page-new.tsx                # New mapping interface
│   │   │   ├── add/page.tsx                # Add mapping
│   │   │   └── edit/page.tsx               # Edit mapping
│   │   └── course-mapping-index/page.tsx   # Course mapping index
│   │
│   ├── exam-management/                    # Examination Operations
│   │   ├── exam-types/page.tsx             # Exam type definitions
│   │   ├── examination-sessions/page.tsx   # Examination sessions
│   │   ├── exam-timetables/page.tsx        # Exam timetable (main)
│   │   ├── exam-timetable/page.tsx         # Exam timetable (alternative)
│   │   ├── exam-rooms/page.tsx             # Room allocation
│   │   ├── exam-attendance/page.tsx        # Attendance marking
│   │   ├── exam-registrations/page.tsx     # Student registrations
│   │   ├── attendance-correction/page.tsx  # Attendance corrections
│   │   └── reports/                        # Exam-related reports
│   │       └── attendance/page.tsx         # Attendance reports
│   │
│   ├── grading/                            # Grading & Assessment
│   │   ├── grades/page.tsx                 # Grade definitions
│   │   └── grade-system/page.tsx           # Grading system configuration
│   │
│   ├── users/                              # User & Access Management
│   │   ├── users-list/page.tsx             # User management
│   │   ├── students-list/page.tsx          # Student list
│   │   ├── student/                        # Student details
│   │   │   ├── page.tsx                    # Student page
│   │   │   └── student-details.tsx         # Student details component
│   │   ├── roles/                          # Role management
│   │   │   ├── page.tsx                    # Role list
│   │   │   ├── add/page.tsx                # Add role
│   │   │   └── edit/[id]/page.tsx          # Edit role
│   │   ├── permissions/                    # Permission management
│   │   │   ├── page.tsx                    # Permission list
│   │   │   ├── add/page.tsx                # Add permission
│   │   │   └── edit/[id]/page.tsx          # Edit permission
│   │   ├── role-permissions/page.tsx       # Role-permission mapping
│   │   └── user-roles/page.tsx             # User-role assignments
│   │
│   └── utilities/                          # Utilities & Tools
│       └── dummy-numbers/page.tsx          # Dummy number generation
│
├── auth/                                   # Authentication pages
│   └── callback/
│       └── loading.tsx                     # OAuth callback loading
│
├── login/page.tsx                          # Login page
├── register-sw.tsx                         # Service worker registration
├── verify-email/page.tsx                   # Email verification
├── contact-admin/page.tsx                  # Contact admin page
├── unauthorized/page.tsx                   # Unauthorized access page
├── check-email/page.tsx                    # Check email page
├── page.tsx                                # Landing/home page
└── layout.tsx                              # Root layout
```

### Backend API Routes (`app/api/`)

```
app/api/
├── auth/                                   # Authentication endpoints
│   ├── google/route.ts                     # Google OAuth handler
│   ├── token/route.ts                      # Token management
│   ├── verify/route.ts                     # Token verification
│   ├── verify-email/route.ts               # Email verification
│   ├── send-verification/route.ts          # Send verification code
│   ├── permissions/
│   │   └── current/route.ts                # Get current user permissions
│   └── roles/
│       ├── assign/route.ts                 # Assign roles
│       └── user/[userId]/route.ts          # User-specific roles
│
├── master/                                 # Master data API endpoints
│   ├── institutions/route.ts               # Institution CRUD
│   ├── degrees/route.ts                    # Degree CRUD
│   ├── departments/route.ts                # Department CRUD
│   ├── programs/                           # Program endpoints
│   │   ├── route.ts                        # List/Create programs
│   │   └── [id]/route.ts                   # Update/Delete program
│   ├── courses/                            # Course endpoints
│   │   ├── route.ts                        # List/Create courses
│   │   ├── [id]/route.ts                   # Update/Delete course
│   │   └── template/route.ts               # Course template
│   ├── regulations/                        # Regulation endpoints
│   │   ├── route.ts                        # List/Create regulations
│   │   └── [id]/route.ts                   # Update/Delete regulation
│   ├── academic-years/route.ts             # Academic year CRUD
│   ├── semesters/route.ts                  # Semester CRUD (missing [id])
│   ├── sections/route.ts                   # Section CRUD
│   ├── batches/                            # Batch endpoints
│   │   ├── route.ts                        # List/Create batches
│   │   └── [id]/route.ts                   # Update/Delete batch
│   └── boards/route.ts                     # Board CRUD
│
├── course-management/                      # Course management endpoints
│   ├── course-offering/route.ts            # Course offerings
│   └── course-mapping/                     # Course mapping
│       ├── route.ts                        # Main mapping endpoint
│       ├── groups/route.ts                 # Mapping groups
│       ├── report/route.ts                 # Mapping reports
│       └── template-data/route.ts          # Template data
│
├── exam-management/                        # Exam management endpoints
│   ├── exam-types/route.ts                 # Exam type CRUD
│   ├── examination-sessions/route.ts       # Examination session CRUD
│   ├── exam-timetables/                    # Timetable endpoints
│   │   ├── route.ts                        # Main timetable endpoint
│   │   └── courses-by-date/route.ts        # Filter courses by date
│   ├── exam-rooms/route.ts                 # Exam room CRUD
│   ├── exam-registrations/route.ts         # Registration CRUD
│   ├── exam-attendance/                    # Attendance endpoints
│   │   ├── route.ts                        # Main attendance endpoint
│   │   ├── dropdowns/route.ts              # Dropdown data
│   │   ├── students/route.ts               # Student attendance
│   │   ├── bundle-cover/route.ts           # Bundle cover report
│   │   ├── student-sheet/route.ts          # Student sheet report
│   │   └── report/route.ts                 # Attendance report
│   └── attendance-correction/              # Attendance correction
│       ├── route.ts                        # Main correction endpoint
│       ├── courses/route.ts                # Course-specific corrections
│       └── debug/route.ts                  # Debug endpoint
│
├── grading/                                # Grading endpoints
│   ├── grades/route.ts                     # Grade CRUD
│   └── grade-system/route.ts               # Grade system CRUD
│
├── users/                                  # User management endpoints
│   ├── users-list/                         # User list endpoints
│   │   ├── route.ts                        # List/Create users
│   │   └── [id]/
│   │       ├── route.ts                    # Update/Delete user
│   │       └── roles/route.ts              # User roles
│   ├── students/route.ts                   # Student CRUD
│   ├── roles/                              # Role endpoints
│   │   ├── route.ts                        # List/Create roles
│   │   └── [id]/route.ts                   # Update/Delete role
│   ├── permissions/                        # Permission endpoints
│   │   ├── route.ts                        # List/Create permissions
│   │   └── [id]/route.ts                   # Update/Delete permission
│   ├── role-permissions/route.ts           # Role-permission mapping
│   └── user-roles/route.ts                 # User-role mapping
│
├── utilities/                              # Utility endpoints
│   └── dummy-numbers/                      # Dummy number generation
│       ├── route.ts                        # Main endpoint
│       └── generate/route.ts               # Generate dummy numbers
│
├── filters/                                # Filter/dropdown endpoints
│   ├── institutions/route.ts               # Institution dropdown
│   ├── departments/route.ts                # Department dropdown
│   └── programs/route.ts                   # Program dropdown
│
├── dashboard/                              # Dashboard endpoints
│   └── stats/route.ts                      # Dashboard statistics
│
├── myjkkn/                                 # MyJKKN integration
│   └── students/                           # Student sync endpoints
│       ├── route.ts                        # List/Sync students
│       └── [id]/route.ts                   # Student details
│
├── api-management/                         # API management (future)
│   ├── staff/
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   └── students/
│       ├── route.ts
│       └── [id]/route.ts
│
├── health/                                 # Health check endpoints
│   └── supabase/route.ts                   # Supabase connection health
│
├── check-is-active-field/route.ts          # Check user active status
├── debug-oauth/route.ts                    # OAuth debugging
├── exam-report/route.ts                    # Exam reports
├── room-allocations/route.ts               # Room allocation management
├── seat-allocations/route.ts               # Seat allocation management
├── setup-semesters/route.ts                # Semester setup utility
├── test-semesters/route.ts                 # Semester test endpoint
└── test-supabase-auth/route.ts             # Supabase auth test
```

## URL Structure

All authenticated routes are prefixed with `/coe/` (the route group parentheses are removed from URLs):

### Master Data (`/coe/master/`)
- `/coe/master/institutions` - Institution management
- `/coe/master/degrees` - Degree programs
- `/coe/master/departments` - Department management
- `/coe/master/programs` - Program management
- `/coe/master/courses` - Course catalog
- `/coe/master/regulations` - Academic regulations
- `/coe/master/regulations/add` - Add regulation
- `/coe/master/regulations/edit/[id]` - Edit regulation
- `/coe/master/academic-years` - Academic year setup
- `/coe/master/semesters` - Semester management
- `/coe/master/sections` - Section management
- `/coe/master/batches` - Batch management
- `/coe/master/boards` - Board management

### Course Management (`/coe/course-management/`)
- `/coe/course-management/course-offering` - Course offerings
- `/coe/course-management/course-mapping` - Course mapping
- `/coe/course-management/course-mapping/add` - Add mapping
- `/coe/course-management/course-mapping/edit` - Edit mapping
- `/coe/course-management/course-mapping-index` - Mapping index

### Exam Management (`/coe/exam-management/`)
- `/coe/exam-management/exam-types` - Exam types
- `/coe/exam-management/examination-sessions` - Examination sessions
- `/coe/exam-management/exam-timetables` - Exam timetable (main)
- `/coe/exam-management/exam-timetable` - Exam timetable (alternative)
- `/coe/exam-management/exam-rooms` - Room allocation
- `/coe/exam-management/exam-attendance` - Attendance marking
- `/coe/exam-management/exam-registrations` - Student registrations
- `/coe/exam-management/attendance-correction` - Attendance corrections
- `/coe/exam-management/reports/attendance` - Attendance reports

### Grading (`/coe/grading/`)
- `/coe/grading/grades` - Grade definitions
- `/coe/grading/grade-system` - Grading system

### Users & Access (`/coe/users/`)
- `/coe/users/users-list` - User management
- `/coe/users/students-list` - Student list
- `/coe/users/student` - Student details
- `/coe/users/roles` - Role management
- `/coe/users/roles/add` - Add role
- `/coe/users/roles/edit/[id]` - Edit role
- `/coe/users/permissions` - Permission management
- `/coe/users/permissions/add` - Add permission
- `/coe/users/permissions/edit/[id]` - Edit permission
- `/coe/users/role-permissions` - Role-permission mapping
- `/coe/users/user-roles` - User-role assignments

### Utilities (`/coe/utilities/`)
- `/coe/utilities/dummy-numbers` - Dummy number generation

### Root Level
- `/coe/dashboard` - Main dashboard

## API Endpoints

All API routes are prefixed with `/api/` and follow RESTful conventions:

- **GET** `/api/[resource]` - List all items
- **POST** `/api/[resource]` - Create new item
- **PUT** `/api/[resource]` - Update item (body contains id)
- **DELETE** `/api/[resource]` - Delete item (body contains id)
- **GET/PUT/DELETE** `/api/[resource]/[id]` - Item-specific operations

## Migration Notes

### Route Group Structure

The application uses Next.js route groups (folders wrapped in parentheses):
- **File path**: `app/(coe)/dashboard/page.tsx`
- **URL**: `/coe/dashboard` (parentheses removed)

This allows for logical grouping without affecting the URL structure.

### Changed Routes (Old → New)

**Previous Structure** → **Current Structure**

Master Data:
- `/institutions` → `/coe/master/institutions`
- `/degree` → `/coe/master/degrees`
- `/department` → `/coe/master/departments`
- `/program` → `/coe/master/programs`
- `/courses` → `/coe/master/courses`
- `/regulations` → `/coe/master/regulations`
- `/academic-years` → `/coe/master/academic-years`
- `/semester` → `/coe/master/semesters`
- `/section` → `/coe/master/sections`
- `/batch` → `/coe/master/batches`
- `/board` → `/coe/master/boards`

Course Management:
- `/course-offering` → `/coe/course-management/course-offering`
- `/course-mapping` → `/coe/course-management/course-mapping`
- `/course-mapping-index` → `/coe/course-management/course-mapping-index`

Exam Management:
- `/exam-types` → `/coe/exam-management/exam-types`
- `/examination-sessions` → `/coe/exam-management/examination-sessions`
- `/exam-timetables` → `/coe/exam-management/exam-timetables`
- `/exam_timetable` → `/coe/exam-management/exam-timetable`
- `/exam-rooms` → `/coe/exam-management/exam-rooms`
- `/exam-attendance` → `/coe/exam-management/exam-attendance`
- `/exam-registrations` → `/coe/exam-management/exam-registrations`
- `/attendance-correction` → `/coe/exam-management/attendance-correction`
- `/reports/attendance` → `/coe/exam-management/reports/attendance`

Grading:
- `/grades` → `/coe/grading/grades`
- `/grade-system` → `/coe/grading/grade-system`

Users & Access:
- `/user` → `/coe/users/users-list`
- `/students` → `/coe/users/students-list`
- `/student` → `/coe/users/student`
- `/roles` → `/coe/users/roles`
- `/permissions` → `/coe/users/permissions`
- `/role-permissions` → `/coe/users/role-permissions`
- `/user-roles` → `/coe/users/user-roles`

Utilities:
- `/dummy-numbers` → `/coe/utilities/dummy-numbers`

Dashboard:
- `/dashboard` → `/coe/dashboard`

## Benefits of Current Structure

1. **Logical Organization**: Pages and APIs grouped by functional domain
2. **Scalability**: Easy to add new pages/endpoints in appropriate categories
3. **Clear Navigation**: Sidebar reflects the folder structure
4. **Maintainability**: Related functionality co-located
5. **Team Collaboration**: Clear separation of concerns
6. **Route Groups**: Clean URLs without nested path segments
7. **API Consistency**: API structure mirrors frontend organization

## Navigation Structure

The sidebar navigation ([components/layout/app-sidebar.tsx](../components/layout/app-sidebar.tsx)) reflects this structure with collapsible sections:

- **Dashboard** - Quick access to main dashboard
- **Master Data** - All master data management pages
  - Institutions, Degrees, Departments, Programs
  - Courses, Regulations, Academic Years
  - Semesters, Sections, Batches, Boards
- **Course Management** - Course operations
  - Course Offering, Course Mapping
- **Exam Management** - Examination operations
  - Exam Types, Sessions, Timetables, Rooms
  - Attendance, Registrations, Corrections
  - Reports
- **Grading** - Grading and assessment
  - Grades, Grade System
- **Users & Access** - User and permission management (admin only)
  - Users, Students, Roles, Permissions
  - Role-Permission Mapping, User-Role Assignments
- **Utilities** - Tools and utilities
  - Dummy Numbers

## Implementation Details

### Protected Routes

All pages under `app/(coe)/` are protected by the layout wrapper:
- File: [app/(coe)/layout.tsx](../app/(coe)/layout.tsx)
- Uses `<ProtectedRoute>` component for authentication and authorization
- Supports role-based and permission-based access control

### Layout Hierarchy

1. **Root Layout** ([app/layout.tsx](../app/layout.tsx))
   - Theme provider (dark mode support)
   - Auth context provider
   - Global styles and fonts

2. **COE Layout** ([app/(coe)/layout.tsx](../app/(coe)/layout.tsx))
   - Protected route wrapper
   - Sidebar navigation
   - Page header/breadcrumbs

### Sidebar Configuration

File: [components/layout/app-sidebar.tsx](../components/layout/app-sidebar.tsx)

Features:
- Dynamic navigation based on user roles/permissions
- Collapsible sections
- Active route highlighting
- Icon-based visual hierarchy

### API Route Conventions

All API routes follow these conventions:
1. Use `getSupabaseServer()` for database access (bypasses RLS)
2. Return JSON responses with appropriate status codes
3. Handle errors with specific error codes (23505, 23503, etc.)
4. Include CORS headers where needed
5. Validate input data before database operations

### Build Configuration

The application builds successfully with all routes recognized:
```bash
npm run build  # Compiles and optimizes all pages and API routes
```

## Missing API Endpoints

The following API endpoints are missing [id] routes for update/delete operations:
- `/api/master/semesters/[id]/route.ts` - Individual semester operations
- `/api/master/sections/[id]/route.ts` - Individual section operations (uses body id instead)

## Future Enhancements

Potential improvements to the structure:

1. **Exam Management Subdivision**
   - Split into `pre-exam/`, `during-exam/`, and `post-exam/` folders
   - Better organization for exam lifecycle

2. **Student Operations**
   - Dedicated top-level `students/` folder
   - Student-specific features and workflows

3. **Analytics & Reporting**
   - New top-level `reports/` or `analytics/` folder
   - Centralized reporting infrastructure

4. **Module Lazy Loading**
   - Implement dynamic imports for better performance
   - Code splitting by functional domain

5. **API Versioning**
   - Add version prefixes (e.g., `/api/v1/`)
   - Support for backward compatibility

6. **Shared Components**
   - Domain-specific component folders
   - Reusable UI patterns per domain

## Development Guidelines

When adding new pages or endpoints:

1. **Choose the correct domain folder** (master, course-management, exam-management, grading, users, utilities)
2. **Follow naming conventions** (kebab-case for folders/files)
3. **Create both frontend and API routes** if CRUD operations are needed
4. **Update sidebar navigation** in `app-sidebar.tsx`
5. **Add appropriate permissions** to route protection
6. **Follow RESTful conventions** for API endpoints
7. **Document changes** in this file

## Rollback

Git history contains the previous flat structure. Use `git log` to find commits before the reorganization if rollback is needed.

---

**Last Updated**: November 11, 2025
**Version**: 3.0 (Complete Structure Documentation)
**Author**: Claude Code AI Assistant
