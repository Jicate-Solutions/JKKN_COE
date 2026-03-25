# JKKN COE Complete Folder Structure Reference

This document provides a comprehensive reference of the project folder structure with detailed descriptions of each directory and file type.

## Complete Directory Tree

```
jkkncoe/
├── .claude/                           # Claude Code configuration
│   └── skills/                        # Custom skills for AI-assisted development
│       ├── skill-creator/             # Skill creation framework
│       ├── project-structure/         # This skill
│       └── [other-skills]/
│
├── .cursor/                           # Cursor IDE configuration
│   └── rules/                         # Development standards
│       └── DEVELOPMENT_STANDARDS.md   # Code style, naming, conventions
│
├── app/                               # Next.js 15 App Router
│   ├── coe/               # Route group: Protected pages
│   │   ├── academic-years/
│   │   │   └── page.tsx               # Academic years management
│   │   ├── attendance-correction/
│   │   │   └── page.tsx               # Attendance correction UI
│   │   ├── batch/
│   │   │   └── page.tsx               # Batch management
│   │   ├── board/
│   │   │   └── page.tsx               # Board management
│   │   ├── course-mapping/
│   │   │   ├── page.tsx               # Course mapping main page
│   │   │   ├── add/
│   │   │   │   └── page.tsx           # Add course mapping
│   │   │   └── edit/
│   │   │       └── page.tsx           # Edit course mapping
│   │   ├── course-mapping-index/
│   │   │   └── page.tsx               # Course mapping index
│   │   ├── course-offering/
│   │   │   └── page.tsx               # Course offering management
│   │   ├── courses/
│   │   │   └── page.tsx               # Courses CRUD page
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Main dashboard
│   │   ├── degree/
│   │   │   └── page.tsx               # Degrees CRUD page
│   │   ├── department/
│   │   │   └── page.tsx               # Departments CRUD page
│   │   ├── exam_timetable/
│   │   │   └── page.tsx               # Exam timetable
│   │   ├── exam-attendance/
│   │   │   └── page.tsx               # Exam attendance tracking
│   │   ├── examination-sessions/
│   │   │   └── page.tsx               # Examination sessions
│   │   ├── exam-registrations/
│   │   │   └── page.tsx               # Exam registration management
│   │   ├── exam-rooms/
│   │   │   └── page.tsx               # Exam room allocation
│   │   ├── exam-timetables/
│   │   │   └── page.tsx               # Exam timetables management
│   │   ├── exam-types/
│   │   │   └── page.tsx               # Exam types configuration
│   │   ├── grades/
│   │   │   └── page.tsx               # Grade management
│   │   ├── grade-system/
│   │   │   └── page.tsx               # Grade system configuration
│   │   ├── institutions/
│   │   │   └── page.tsx               # Institutions CRUD page
│   │   ├── permissions/
│   │   │   ├── page.tsx               # Permissions management
│   │   │   ├── add/
│   │   │   │   └── page.tsx           # Add permission
│   │   │   └── edit/
│   │   │       └── [id]/
│   │   │           └── page.tsx       # Edit permission by ID
│   │   ├── program/
│   │   │   └── page.tsx               # Programs CRUD page
│   │   ├── regulations/
│   │   │   ├── page.tsx               # Regulations management
│   │   │   ├── add/
│   │   │   │   └── page.tsx           # Add regulation
│   │   │   └── edit/
│   │   │       └── [id]/
│   │   │           └── page.tsx       # Edit regulation by ID
│   │   ├── reports/
│   │   │   ├── page.tsx               # Reports hub
│   │   │   └── attendance/
│   │   │       └── page.tsx           # Attendance reports
│   │   ├── role-permissions/
│   │   │   └── page.tsx               # Role-permission assignment
│   │   ├── roles/
│   │   │   ├── page.tsx               # Roles management
│   │   │   ├── add/
│   │   │   │   └── page.tsx           # Add role
│   │   │   └── edit/
│   │   │       └── [id]/
│   │   │           └── page.tsx       # Edit role by ID
│   │   ├── section/
│   │   │   └── page.tsx               # Sections CRUD page
│   │   ├── semester/
│   │   │   └── page.tsx               # Semesters CRUD page
│   │   ├── student/
│   │   │   └── page.tsx               # Student profile (singular)
│   │   ├── students/
│   │   │   └── page.tsx               # Students CRUD page (plural)
│   │   ├── user/
│   │   │   └── page.tsx               # User profile
│   │   ├── user-roles/
│   │   │   └── page.tsx               # User role assignment
│   │   └── layout.tsx                 # Authenticated layout wrapper
│   │
│   ├── api/                           # API route handlers
│   │   ├── academic-years/
│   │   │   └── route.ts               # GET, POST academic years
│   │   ├── api-management/
│   │   │   ├── staff/
│   │   │   │   ├── route.ts           # Staff API
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts       # Staff by ID
│   │   │   └── students/
│   │   │       ├── route.ts           # Students API
│   │   │       └── [id]/
│   │   │           └── route.ts       # Student by ID
│   │   ├── attendance-correction/
│   │   │   ├── route.ts               # Attendance correction API
│   │   │   ├── courses/
│   │   │   │   └── route.ts           # Get courses for correction
│   │   │   └── debug/
│   │   │       └── route.ts           # Debug endpoint
│   │   ├── auth/
│   │   │   ├── google/
│   │   │   │   └── route.ts           # Google OAuth handler
│   │   │   ├── permissions/
│   │   │   │   └── current/
│   │   │   │       └── route.ts       # Get current user permissions
│   │   │   ├── roles/
│   │   │   │   ├── assign/
│   │   │   │   │   └── route.ts       # Assign roles to user
│   │   │   │   └── user/
│   │   │   │       └── [userId]/
│   │   │   │           └── route.ts   # Get user roles
│   │   │   ├── send-verification/
│   │   │   │   └── route.ts           # Send verification email
│   │   │   ├── token/
│   │   │   │   └── route.ts           # Token operations
│   │   │   ├── verify/
│   │   │   │   └── route.ts           # Email verification
│   │   │   └── verify-email/
│   │   │       └── route.ts           # Email verification (alternative)
│   │   ├── batch/
│   │   │   ├── route.ts               # GET, POST batches
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE batch by ID
│   │   ├── boards/
│   │   │   └── route.ts               # Boards API
│   │   ├── course-mapping/
│   │   │   ├── route.ts               # Course mapping CRUD
│   │   │   ├── groups/
│   │   │   │   └── route.ts           # Course groups
│   │   │   ├── report/
│   │   │   │   └── route.ts           # Course mapping reports
│   │   │   └── template-data/
│   │   │       └── route.ts           # Template data for mapping
│   │   ├── course-offering/
│   │   │   └── route.ts               # Course offering API
│   │   ├── courses/
│   │   │   ├── route.ts               # GET, POST courses
│   │   │   ├── [id]/
│   │   │   │   └── route.ts           # PUT, DELETE course by ID
│   │   │   └── template/
│   │   │       └── route.ts           # Download course template
│   │   ├── dashboard/
│   │   │   └── stats/
│   │   │       └── route.ts           # Dashboard statistics
│   │   ├── degrees/
│   │   │   └── route.ts               # Degrees API
│   │   ├── departments/
│   │   │   └── route.ts               # Departments API
│   │   ├── exam-attendance/
│   │   │   ├── route.ts               # Exam attendance API
│   │   │   ├── bundle-cover/
│   │   │   │   └── route.ts           # Bundle cover generation
│   │   │   ├── dropdowns/
│   │   │   │   └── route.ts           # Dropdown data
│   │   │   ├── report/
│   │   │   │   └── route.ts           # Attendance reports
│   │   │   ├── students/
│   │   │   │   └── route.ts           # Student attendance
│   │   │   └── student-sheet/
│   │   │       └── route.ts           # Student attendance sheet
│   │   ├── examination-sessions/
│   │   │   └── route.ts               # Examination sessions API
│   │   ├── exam-registrations/
│   │   │   └── route.ts               # Exam registrations API
│   │   ├── exam-rooms/
│   │   │   └── route.ts               # Exam rooms API
│   │   ├── exam-timetables/
│   │   │   ├── route.ts               # Exam timetables API
│   │   │   └── courses-by-date/
│   │   │       └── route.ts           # Get courses by exam date
│   │   ├── exam-types/
│   │   │   └── route.ts               # Exam types API
│   │   ├── filters/
│   │   │   ├── departments/
│   │   │   │   └── route.ts           # Filter by department
│   │   │   ├── institutions/
│   │   │   │   └── route.ts           # Filter by institution
│   │   │   └── programs/
│   │   │       └── route.ts           # Filter by program
│   │   ├── grades/
│   │   │   └── route.ts               # Grades API
│   │   ├── grade-system/
│   │   │   └── route.ts               # Grade system API
│   │   ├── health/
│   │   │   └── supabase/
│   │   │       └── route.ts           # Supabase health check
│   │   ├── institutions/
│   │   │   └── route.ts               # Institutions API
│   │   ├── myjkkn/
│   │   │   └── students/
│   │   │       ├── route.ts           # MyJKKN students API
│   │   │       └── [id]/
│   │   │           └── route.ts       # Student by ID
│   │   ├── permissions/
│   │   │   ├── route.ts               # GET, POST permissions
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE permission by ID
│   │   ├── program/
│   │   │   ├── route.ts               # GET, POST programs
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE program by ID
│   │   ├── regulations/
│   │   │   ├── route.ts               # GET, POST regulations
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE regulation by ID
│   │   ├── role-permissions/
│   │   │   └── route.ts               # Role-permission assignment API
│   │   ├── roles/
│   │   │   ├── route.ts               # GET, POST roles
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE role by ID
│   │   ├── section/
│   │   │   └── route.ts               # Sections API
│   │   ├── semesters/
│   │   │   ├── route.ts               # GET, POST semesters
│   │   │   └── [id]/
│   │   │       └── route.ts           # PUT, DELETE semester by ID
│   │   ├── students/
│   │   │   └── route.ts               # Students API
│   │   ├── user-roles/
│   │   │   └── route.ts               # User roles API
│   │   └── users/
│   │       ├── route.ts               # GET, POST users
│   │       └── [id]/
│   │           ├── route.ts           # PUT, DELETE user by ID
│   │           └── roles/
│   │               └── route.ts       # User's roles
│   │
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts               # OAuth callback handler
│   │
│   ├── login/
│   │   └── page.tsx                   # Login page
│   │
│   ├── verify-email/
│   │   └── page.tsx                   # Email verification page
│   │
│   ├── contact-admin/
│   │   └── page.tsx                   # Contact admin page
│   │
│   ├── unauthorized/
│   │   └── page.tsx                   # Unauthorized access page
│   │
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Landing page
│   └── favicon.ico                    # App icon
│
├── components/                        # Reusable UI components
│   ├── common/                        # Shared components
│   │   ├── protected-route.tsx        # Auth guard component
│   │   ├── data-table.tsx             # Reusable table component
│   │   └── file-upload.tsx            # File upload component
│   │
│   ├── layout/                        # Layout components
│   │   ├── app-header.tsx             # App header with user menu
│   │   ├── app-sidebar.tsx            # Sidebar navigation
│   │   └── app-footer.tsx             # App footer
│   │
│   ├── ui/                            # Shadcn UI primitives
│   │   ├── button.tsx                 # Button component
│   │   ├── input.tsx                  # Input component
│   │   ├── sheet.tsx                  # Sheet/drawer component
│   │   ├── dialog.tsx                 # Dialog/modal component
│   │   ├── table.tsx                  # Table components
│   │   ├── select.tsx                 # Select dropdown
│   │   ├── label.tsx                  # Label component
│   │   ├── badge.tsx                  # Badge component
│   │   ├── card.tsx                   # Card component
│   │   ├── toast.tsx                  # Toast notification
│   │   ├── sidebar.tsx                # Sidebar primitives
│   │   ├── breadcrumb.tsx             # Breadcrumb navigation
│   │   ├── alert-dialog.tsx           # Alert dialog
│   │   ├── switch.tsx                 # Toggle switch
│   │   └── [other-ui-components].tsx  # More Shadcn components
│   │
│   └── users/                         # User-specific components
│       └── user-profile.tsx           # User profile component
│
├── context/                           # React Context providers
│   ├── auth-context.tsx               # Authentication context
│   └── theme-context.tsx              # Theme provider (dark mode)
│
├── hooks/                             # Custom React hooks
│   ├── use-auth.ts                    # Authentication hook
│   ├── use-toast.ts                   # Toast notification hook
│   └── use-form-validation.ts         # Form validation hook
│
├── lib/                               # Utilities and configurations
│   ├── supabase-server.ts             # Server-side Supabase client
│   ├── utils.ts                       # General utilities (cn, etc.)
│   ├── constants/                     # Application constants
│   │   ├── routes.ts                  # Route constants
│   │   └── permissions.ts             # Permission constants
│   └── utils/                         # Utility modules
│       ├── format.ts                  # Formatting utilities
│       └── validation.ts              # Validation helpers
│
├── services/                          # Business logic and data access
│   ├── courses-service.ts             # Course data access
│   ├── degrees-service.ts             # Degree data access
│   ├── students-service.ts            # Student data access
│   └── auth-service.ts                # Authentication service
│
├── store/                             # State management (Redux if needed)
│   └── index.ts                       # Store configuration
│
├── styles/                            # Global styles
│   └── globals.css                    # Global CSS and Tailwind
│
├── supabase/                          # Supabase configuration
│   ├── config.toml                    # Supabase config
│   ├── migrations/                    # Database migrations
│   │   ├── 20240101120000_create_users.sql
│   │   ├── 20240102130000_create_rbac.sql
│   │   ├── 20240103140000_create_courses.sql
│   │   └── [timestamp]_[description].sql
│   └── functions/                     # Edge functions
│       └── send-verification-email/   # Email verification function
│
├── types/                             # TypeScript type definitions
│   ├── index.ts                       # Re-export all types
│   ├── courses.ts                     # Course types
│   ├── degrees.ts                     # Degree types
│   ├── students.ts                    # Student types
│   ├── auth.ts                        # Authentication types
│   └── [entity].ts                    # Other entity types
│
├── public/                            # Static assets
│   ├── images/                        # Images
│   ├── icons/                         # Icons
│   └── fonts/                         # Custom fonts (if any)
│
├── .env.local                         # Environment variables (local)
├── .env.example                       # Environment variables template
├── .gitignore                         # Git ignore rules
├── middleware.ts                      # Next.js middleware (auth check)
├── next.config.ts                     # Next.js configuration
├── package.json                       # NPM dependencies
├── tsconfig.json                      # TypeScript configuration
├── tailwind.config.ts                 # Tailwind CSS configuration
├── postcss.config.mjs                 # PostCSS configuration
├── components.json                    # Shadcn UI configuration
├── CLAUDE.md                          # Claude Code instructions
└── README.md                          # Project documentation
```

## Directory Purpose Breakdown

### Application Core

#### `app/` - Next.js App Router
- **Purpose**: Main application code using Next.js 15 App Router
- **Key Features**:
  - File-system based routing
  - Server Components by default
  - API routes in `api/` subdirectory
  - Route groups for organization (e.g., `coe`)
- **Naming**: Always use `page.tsx` for routes, `layout.tsx` for layouts, `route.ts` for API

#### `app/coe/` - Protected Routes
- **Purpose**: Route group containing all authenticated pages
- **Key Features**:
  - Wrapped by `layout.tsx` with `<ProtectedRoute>`
  - Requires valid session and active user
  - Permission-based access control
- **Pattern**: Each entity has its own directory with `page.tsx`

#### `app/api/` - API Routes
- **Purpose**: Backend API endpoints
- **Structure**:
  - `route.ts`: GET, POST operations
  - `[id]/route.ts`: PUT, DELETE operations (specific record)
- **Key Features**:
  - Uses server-side Supabase client
  - Service role bypasses RLS
  - Error handling with specific PostgreSQL error codes

### Component Architecture

#### `components/common/` - Shared Components
- **Purpose**: Reusable components used across multiple modules
- **Examples**: `protected-route.tsx`, `data-table.tsx`, `file-upload.tsx`
- **Usage**: Import with `@/components/common/[component-name]`

#### `components/layout/` - Layout Components
- **Purpose**: App-wide layout structure
- **Components**: Header, Sidebar, Footer
- **Usage**: Imported in `app/layout.tsx` or route-specific layouts

#### `components/ui/` - Shadcn UI Primitives
- **Purpose**: Base UI components from Shadcn UI
- **Management**: Generated via `npx shadcn-ui@latest add [component]`
- **DO NOT**: Manually create files here
- **Usage**: Building blocks for all UI

### Data Layer

#### `services/` - Business Logic
- **Purpose**: Data access and business logic
- **Responsibilities**:
  - Supabase database queries
  - Data transformation
  - Validation logic
  - Error handling
- **Pattern**: One service per entity (`[entity]-service.ts`)

#### `types/` - Type Definitions
- **Purpose**: TypeScript interfaces and types
- **Structure**:
  - Database types (matching Supabase schema)
  - Form data types
  - API request/response types
  - UI state types
- **Pattern**: One file per entity (`[entity].ts`)

### Configuration & Utilities

#### `lib/` - Utilities and Config
- **Key Files**:
  - `supabase-server.ts`: Server-side Supabase client (service role)
  - `utils.ts`: General utilities (cn function, etc.)
- **Subdirectories**:
  - `constants/`: Application constants
  - `utils/`: Utility modules

#### `context/` - React Context
- **Purpose**: Global state management using React Context
- **Examples**: Auth context, theme context
- **Pattern**: `[name]-context.tsx`

#### `hooks/` - Custom Hooks
- **Purpose**: Reusable React hooks
- **Naming**: Always prefix with `use-`
- **Examples**: `use-auth.ts`, `use-toast.ts`

### Database

#### `supabase/migrations/` - Database Migrations
- **Purpose**: Version-controlled database schema changes
- **Naming**: `[timestamp]_[description].sql`
- **Management**: Create via Supabase CLI or manually
- **Important**: Always migrate up, never modify existing migrations

### Configuration Files

#### Root Configuration Files
- **`.env.local`**: Environment variables (never commit)
- **`middleware.ts`**: Next.js middleware (auth checking)
- **`next.config.ts`**: Next.js configuration
- **`tailwind.config.ts`**: Tailwind CSS configuration
- **`tsconfig.json`**: TypeScript compiler options
- **`components.json`**: Shadcn UI configuration
- **`CLAUDE.md`**: Instructions for AI assistants

## File Naming Conventions

### Directories
- **Format**: `kebab-case`
- **Examples**: `course-mapping`, `exam-timetables`, `user-roles`

### Components
- **Format**: `kebab-case` for filename, `PascalCase` for component name
- **Example**: `app-sidebar.tsx` exports `AppSidebar`

### Types/Interfaces
- **Format**: `PascalCase`
- **Examples**: `Course`, `DegreeFormData`, `StudentResponse`

### Variables/Functions
- **Format**: `camelCase`
- **Examples**: `formData`, `handleSubmit`, `getCourses`

### Constants
- **Format**: `UPPERCASE_SNAKE_CASE`
- **Examples**: `API_BASE_URL`, `MAX_FILE_SIZE`

### Files by Type
- **Pages**: `page.tsx`
- **Layouts**: `layout.tsx`
- **API Routes**: `route.ts`
- **Components**: `[component-name].tsx`
- **Services**: `[entity]-service.ts`
- **Hooks**: `use-[functionality].ts`
- **Types**: `[entity].ts`

## Import Path Patterns

### Absolute Imports (Preferred)
```typescript
import { Button } from '@/components/ui/button'
import { getCourses } from '@/services/courses-service'
import type { Course } from '@/types/courses'
import { useAuth } from '@/hooks/use-auth'
```

### Relative Imports (Avoid when possible)
```typescript
// Only use for closely related files
import { helperFunction } from './utils'
```

## Search Patterns for Quick Navigation

### Find Entity CRUD Pages
```bash
**/app/coe/[entity]/page.tsx
```

### Find Entity API Routes
```bash
**/app/api/[entity]/route.ts
```

### Find All API Endpoints
```bash
**/app/api/**/route.ts
```

### Find Type Definitions
```bash
**/types/[entity].ts
```

### Find Services
```bash
**/services/*-service.ts
```

### Find UI Components
```bash
**/components/ui/[component].tsx
```

### Find Common Components
```bash
**/components/common/[component].tsx
```

## Module Organization Pattern

For any new entity (e.g., "exams"), follow this structure:

```
jkkncoe/
├── app/
│   ├── coe/
│   │   └── exams/
│   │       └── page.tsx               # Main CRUD page
│   └── api/
│       └── exams/
│           ├── route.ts               # GET, POST
│           └── [id]/
│               └── route.ts           # PUT, DELETE
├── components/
│   └── exams/                         # (Optional) Entity-specific components
│       ├── exam-form.tsx
│       └── exam-table.tsx
├── services/
│   └── exams-service.ts               # Data access layer
├── types/
│   └── exams.ts                       # Type definitions
└── hooks/
    └── use-exams.ts                   # (Optional) Custom hook
```

## Common File Locations by Task

### Authentication
- **Login Page**: `app/login/page.tsx`
- **Auth Callback**: `app/auth/callback/route.ts`
- **Auth Context**: `context/auth-context.tsx`
- **Middleware**: `middleware.ts` (root)
- **Protected Route**: `components/common/protected-route.tsx`

### RBAC (Role-Based Access Control)
- **Roles Page**: `app/coe/roles/page.tsx`
- **Permissions Page**: `app/coe/permissions/page.tsx`
- **Role-Permissions**: `app/coe/role-permissions/page.tsx`
- **User-Roles**: `app/coe/user-roles/page.tsx`
- **API**: `app/api/roles/`, `app/api/permissions/`, etc.

### UI/UX
- **Header**: `components/layout/app-header.tsx`
- **Sidebar**: `components/layout/app-sidebar.tsx`
- **Footer**: `components/layout/app-footer.tsx`
- **Theme Provider**: `context/theme-context.tsx`
- **Global Styles**: `styles/globals.css`

### Database
- **Migrations**: `supabase/migrations/`
- **Supabase Client**: `lib/supabase-server.ts`

### Configuration
- **Environment**: `.env.local`
- **TypeScript**: `tsconfig.json`
- **Tailwind**: `tailwind.config.ts`
- **Next.js**: `next.config.ts`

## Best Practices Summary

1. **Use `@/` alias** for all imports from root
2. **Follow naming conventions** strictly (kebab-case for files/dirs, PascalCase for components/types)
3. **Collocate related files** (entity-specific components with entity)
4. **One responsibility per file** (e.g., one service per entity)
5. **Default to Server Components** (add `"use client"` only when needed)
6. **Define types first** before implementing features
7. **Use RESTful API structure** (GET/POST in route.ts, PUT/DELETE in [id]/route.ts)
8. **Never modify migrations** (always create new ones)
9. **Keep components small** (single responsibility principle)
10. **Use Shadcn for UI** (don't create custom primitives)
