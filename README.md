# JKKN COE - Controller of Examination

## Overview

**JKKN COE (Controller of Examination)** is a comprehensive Next.js 15 application for managing examination systems at JKKN Arts Colleges. Built with TypeScript, Supabase, and Tailwind CSS, it features role-based access control (RBAC), secure authentication, and an intuitive interface for exam management.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma Client
- **Authentication**: Supabase Auth with Google OAuth
- **UI Components**: Shadcn UI, Radix UI, Tailwind CSS
- **State Management**: React Context API
- **Forms**: React Hook Form, Zod validation
- **Tables**: TanStack React Table
- **Charts**: Recharts
- **PDF Generation**: jsPDF, jsPDF-AutoTable
- **Excel/CSV**: XLSX library
- **Icons**: Lucide React
- **Drag & Drop**: dnd-kit

## Key Features

### Authentication & Authorization
- Google OAuth integration via Supabase Auth
- Role-Based Access Control (RBAC) with permissions system
- User activation/deactivation management
- Session timeout handling
- Protected routes with flexible authorization logic
- Email verification system with race condition protection

### Core Modules

#### 1. **Institution Management**
- Create, read, update, and delete institutions
- Excel/JSON import and export
- Template-based data upload with reference sheets
- Bulk upload with row-by-row validation

#### 2. **Academic Structure**
- **Departments**: Manage academic departments
- **Degrees**: Configure degree programs
- **Programs**: Define program offerings with multi-FK relationships
- **Regulations**: Manage academic regulations and rules
- **Semesters**: Configure semester details
- **Sections**: Organize student sections
- **Academic Years**: Academic year management
- **Batches**: Student batch management

#### 3. **Course Management**
- **Courses**: Comprehensive course catalog with split credits
- **Course Mapping**: Map courses to programs and semesters
- **Course Offering**: Schedule course offerings with enrollment tracking
- Excel template with single combined reference sheet
- Foreign key auto-resolution and validation

#### 4. **Student Management**
- Student record management (CRUD operations)
- **MyJKKN API Integration**:
  - Fetch student data from MyJKKN platform
  - List view with search, sort, and pagination
  - Detailed student information view
  - Real-time profile completion tracking
  - Comprehensive student details (academic, family, address, transport)

#### 5. **Examination Management**
- **Exam Registrations**: Student course registration for exams
- **Examination Sessions**: Session configuration and management
- **Exam Timetables**: Exam scheduling and timetable management
- **Exam Types**: Exam type configuration
- **Exam Rooms**: Configure examination halls and rooms
- **Boards**: Manage examination boards and authorities
- **Dummy Numbers**: Secure dummy number generation for anonymous grading

#### 6. **Pre-Examination Module**
- **Internal Marks Upload**: Bulk internal marks entry with validation
- **Hall Ticket Generation**: Student hall ticket generation
- **Attendance Sheets**: Generate attendance sheets for exams

#### 7. **Post-Examination Module**
- **External Marks Entry**: Single mark entry with validation
- **External Marks Bulk Upload**: Bulk upload with template
- **Marks Correction**: Mark correction with complete audit trail
- **Answer Sheet Packets**: Answer sheet packet management
- **Answer Sheet Tracking**: Track answer sheets through evaluation

#### 8. **Grading System** (NEW - December 2025)
- **Grade Master**: Configure grade ranges (O, A+, A, B+, B, C, U, AAA)
- **Grade System**: Institution/regulation-specific grade configurations
- **Final Marks Generation**: Automatic grade assignment from marks
- **Semester Results**: GPA calculation per semester
- **CGPA Calculation**: Cumulative GPA across semesters
- **Student Backlogs**: Track and manage student backlogs with priority levels
- **Galley Report**: Comprehensive result publication report with PDF export

#### 9. **Results Processing** (NEW - December 2025)
- **GPA Formula**: Σ(Credits × Grade Points) / Σ(Credits)
- **CGPA Formula**: Σ(Semester GPA × Semester Credits) / Σ(Semester Credits)
- **Part-wise Aggregation**: UG (Parts I-V), PG (Parts A-B)
- **Pass/Fail Determination**: Automatic based on internal + external marks
- **Absent Handling**: AAA grade with 0 grade points for absent students
- **Re-Appear Tracking**: Failed attempts with U grade

### Import/Export Features

All modules support standardized import/export patterns:

#### Export Options
- **JSON Export**: Raw data in JSON format
- **Excel Export**: Formatted spreadsheet with all fields
  - Separate columns for codes and names
  - Optimized column widths
  - Human-readable format
- **PDF Export**: Formatted reports with tables

#### Template Download
- **Styled Headers**: Mandatory fields marked with red background and asterisk (*)
- **Sample Data**: Pre-filled example row with realistic data
- **Reference Sheets**: Combined reference data in organized sections
- **Visual Indicators**: Clear distinction between required and optional fields

#### Import Support
- **Multiple Formats**: JSON, CSV, Excel (.xlsx, .xls)
- **Flexible Field Mapping**: Supports header variations
- **Smart Data Conversion**: Automatic type conversion and null handling
- **Validation**: Pre-upload validation with specific error messages
- **Row Tracking**: Accurate Excel row numbers in error reports

### UI/UX Features

- **Responsive Design**: Mobile-friendly layouts
- **Dark Mode Support**: System-wide theme switching
- **Searchable Tables**: Real-time client-side search
- **Sortable Columns**: Click-to-sort on any column
- **Pagination**: Server-side pagination for large datasets
- **Loading States**: Smooth loading indicators
- **Toast Notifications**: User-friendly feedback messages
- **Error Dialogs**: Comprehensive error reporting with actionable information
- **Modal Forms**: Side-sheet forms with validation
- **Color-Coded Sections**: Gradient headers for visual organization
- **Drag & Drop**: Sortable lists and data reordering

### Security Features

- **Server-Side API Keys**: Sensitive credentials stored server-side only
- **Row Level Security (RLS)**: Supabase RLS policies
- **Input Sanitization**: XSS prevention
- **Atomic Operations**: Race condition protection
- **Unique Constraints**: Data integrity enforcement
- **Foreign Key Validation**: Referential integrity checks
- **Environment Variables**: Secure configuration management
- **Transaction Logging**: Complete audit trail for all operations

### Data Validation

- **Client-Side Validation**: Immediate feedback with inline error messages
- **Server-Side Validation**: API-level validation with specific error codes
- **Foreign Key Auto-Mapping**: Automatic ID resolution from codes
- **Pre-Insert Validation**: Ensures referenced entities exist
- **Conditional Validation**: Context-aware validation rules
- **Format Validation**: Regex-based pattern matching
- **Numeric Range Validation**: Min/max constraints

## Recent Features (November-December 2025)

### Grading System (December 2025)
**Complete grading and result processing system:**
- Grade master configuration with letter grades and grade points
- Institution-specific grade systems per regulation
- Automatic grade assignment from marks using database triggers
- GPA and CGPA calculation with part-wise aggregation
- Student backlog tracking with priority levels (Critical, High, Normal, Low)
- Galley report generation with comprehensive statistics
- PDF export for result reports

**Key Database Triggers:**
- `auto_determine_pass_status` - Determines pass/fail based on marks
- `auto_assign_letter_grade` - Assigns letter grade from grade_system table
- `publish_semester_results` - Publishes semester results

### Marks Management (November 2025)
**Post-Examination Module:**
- External marks entry with single and bulk upload options
- Marks correction workflow with complete audit trail
- Answer sheet packet management
- Examiner assignment tracking

**Pre-Examination Module:**
- Internal marks bulk upload with validation
- Template-based import with error reporting

### Enhanced Exam Management (November 2025)
- Exam timetable creation and management
- Attendance tracking and correction
- Dummy number generation for anonymous grading
- Session-wise examination configuration

### Transaction Logging
- Complete audit trail for all marks-related operations
- Transaction log API for compliance and reporting
- User action tracking with timestamps

## Project Structure

```
jkkncoe/
├── app/
│   ├── (coe)/                      # Protected routes
│   │   ├── dashboard/              # Main dashboard
│   │   ├── grading/                # Grading system (NEW)
│   │   │   ├── grades/             # Grade master
│   │   │   ├── grade-system/       # Grade system config
│   │   │   ├── generate-final-marks/ # Final marks generation
│   │   │   ├── semester-results/   # Semester GPA/CGPA
│   │   │   ├── student-backlogs/   # Backlog tracking
│   │   │   └── galley-report/      # Galley report
│   │   ├── post-exam/              # Post-exam module (NEW)
│   │   │   ├── external-mark-entry/
│   │   │   ├── external-mark-bulk-upload/
│   │   │   ├── external-mark-correction/
│   │   │   └── answer-sheet-packets/
│   │   ├── pre-exam/               # Pre-exam module
│   │   │   └── bulk-internal-marks/
│   │   ├── exam-management/        # Exam management
│   │   │   ├── exam-timetable/
│   │   │   ├── examination-sessions/
│   │   │   ├── exam-types/
│   │   │   └── attendance-correction/
│   │   ├── master/                 # Master data
│   │   │   ├── academic-years/
│   │   │   ├── batches/
│   │   │   ├── boards/
│   │   │   └── ...
│   │   ├── users/                  # User management
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   ├── role-permissions/
│   │   │   └── user-roles/
│   │   ├── course-mapping/
│   │   ├── course-offering/
│   │   ├── courses/
│   │   ├── degree/
│   │   ├── department/
│   │   ├── exam-registrations/
│   │   ├── exam-rooms/
│   │   ├── institutions/
│   │   ├── myjkkn-students/
│   │   ├── program/
│   │   ├── regulations/
│   │   ├── section/
│   │   ├── semester/
│   │   └── students/
│   ├── api/                        # API routes
│   │   ├── grading/                # Grading APIs (NEW)
│   │   │   ├── grades/
│   │   │   ├── grade-system/
│   │   │   ├── final-marks/
│   │   │   ├── semester-results/
│   │   │   └── galley-report/
│   │   ├── post-exam/              # Post-exam APIs (NEW)
│   │   │   └── external-marks-bulk/
│   │   ├── pre-exam/               # Pre-exam APIs
│   │   │   └── internal-marks/
│   │   ├── transaction-logs/       # Audit trail API (NEW)
│   │   └── ...
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                         # Shadcn UI components
│   ├── post-exam/                  # Post-exam components (NEW)
│   │   ├── external-marks-scorecards.tsx
│   │   ├── external-marks-table.tsx
│   │   ├── external-marks-filters.tsx
│   │   ├── import-preview-dialog.tsx
│   │   └── upload-error-dialog.tsx
│   └── protected-route.tsx
├── hooks/
│   ├── grading/                    # Grading hooks (NEW)
│   │   ├── use-grade-calculator.ts
│   │   └── use-result-processor.ts
│   ├── post-exam/                  # Post-exam hooks (NEW)
│   │   └── use-external-marks-bulk.ts
│   └── use-transaction-log.ts
├── services/
│   ├── grading/                    # Grading services (NEW)
│   │   └── grade-system-service.ts
│   ├── post-exam/                  # Post-exam services (NEW)
│   │   ├── external-marks-bulk-service.ts
│   │   └── external-mark-entry-service.ts
│   ├── logging/                    # Logging services (NEW)
│   │   └── transaction-log-service.ts
│   └── ...
├── types/
│   ├── final-marks.ts              # Final marks types (NEW)
│   ├── grade-system.ts             # Grade system types (NEW)
│   ├── external-marks.ts           # External marks types (NEW)
│   └── semester-results.ts         # Semester results types (NEW)
├── lib/
│   ├── auth/
│   ├── utils/
│   │   └── generate-galley-report-pdf.ts  # PDF generation (NEW)
│   ├── myjkkn-api.ts
│   ├── supabase-server.ts
│   └── supabase-client.ts
├── supabase/
│   └── migrations/                 # Database migrations
├── .claude/                        # Claude Code configuration
│   └── skills/
├── CLAUDE.md
└── README.md
```

## Database Schema

### Core Tables

- **users**: User accounts with RBAC
- **roles**: System roles (admin, teacher, student, etc.)
- **permissions**: Granular permissions
- **role_permissions**: Role-permission mappings
- **user_roles**: User-role assignments
- **institutions**: Educational institutions
- **departments**: Academic departments
- **degrees**: Degree programs
- **programs**: Program offerings
- **regulations**: Academic regulations
- **semesters**: Semester configuration
- **sections**: Student sections
- **courses**: Course catalog
- **course_mapping**: Course-to-program mappings
- **course_offering**: Course offerings with enrollment
- **students**: Student records
- **exam_registrations**: Exam registrations
- **examination_sessions**: Exam sessions
- **exam_rooms**: Examination rooms
- **boards**: Examination boards

### Grading Tables (NEW - December 2025)

- **grades**: Grade master (letter grades, grade points, percentage ranges)
- **grade_systems**: Institution/regulation-specific grade configurations
- **final_marks**: Student final calculated grades with all marks
- **marks_entry**: External exam marks entry
- **internal_marks**: Internal assessment marks
- **semester_results**: Semester-wise GPA/CGPA results
- **student_backlogs**: Student backlog tracking with priority
- **answer_sheets**: Answer sheet tracking
- **answer_sheet_packets**: Answer sheet packet grouping
- **examiner_assignments**: Examiner assignment tracking
- **marks_upload_batches**: Batch upload tracking
- **marks_correction_log**: Marks modification audit trail

### Key Relationships

- Students → Institutions, Degrees, Departments, Programs, Semesters, Sections
- Programs → Institutions, Degrees, Departments
- Course Offerings → Institutions, Courses, Sessions, Programs
- Exam Registrations → Institutions, Students, Sessions, Courses
- Final Marks → Students, Courses, Sessions, Exam Attendance
- Semester Results → Programs, Sessions, Students

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Google OAuth credentials (for authentication)
- MyJKKN API key (for student data integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd jkkncoe
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your credentials:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # MyJKKN API Integration
   MYJKKN_API_KEY=your_myjkkn_api_key
   MYJKKN_API_BASE_URL=https://www.jkkn.ai/api
   ```

4. **Run database migrations**
   ```bash
   npx supabase migration up
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

### Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build production bundle
npm run start        # Start production server
npm run lint         # Run ESLint
```

## API Documentation

### Grading APIs (NEW)

```
GET/POST /api/grading/grades
  - Grade master CRUD operations

GET/POST /api/grading/grade-system
  - Grade system configuration per institution/regulation

POST /api/grading/final-marks
  - Generate final marks with automatic grade assignment

GET/POST /api/grading/semester-results
  - Semester GPA/CGPA calculation and retrieval

GET /api/grading/galley-report
  - Generate comprehensive galley report data
```

### Post-Exam APIs (NEW)

```
POST /api/post-exam/external-marks-bulk
  - Bulk upload external marks with validation

GET/POST /api/pre-exam/internal-marks
  - Internal marks management
```

### Transaction Logs API (NEW)

```
GET/POST /api/transaction-logs
  - Audit trail for all marks operations
```

### Standard CRUD Endpoints

All entity modules follow RESTful conventions:
- `GET /api/[entity]` - List all records
- `POST /api/[entity]` - Create new record
- `PUT /api/[entity]` - Update existing record
- `DELETE /api/[entity]/[id]` - Delete record

Entities: `institutions`, `departments`, `degrees`, `programs`, `regulations`, `semesters`, `sections`, `courses`, `course-mapping`, `course-offering`, `students`, `boards`, `exam-rooms`, `exam-registrations`

## Development Standards

### Code Conventions

- **PascalCase**: Components, Types, Interfaces
- **kebab-case**: Directory names, file names
- **camelCase**: Variables, functions, methods
- **UPPERCASE**: Environment variables, constants
- **Tabs**: Indentation
- **Single quotes**: Strings
- **Strict TypeScript**: Enabled

### Form Design

- **Form Width**: Default 800px, adjustable (600px/1000px)
- **Header Structure**: Gradient background with icon, title, description
- **Section Structure**: Icon + gradient title + border separator
- **Field Structure**: Label (with asterisk for required) + Input + error message
- **Validation**: Inline validation with error state styling
- **Toast Notifications**: Color-coded feedback (green/yellow/red)

### Import/Export Pattern

All entity pages must implement:
1. **Upload Summary Tracking**: Total, success, failed counts
2. **Visual Summary Cards**: 3-column grid (blue/green/red)
3. **Detailed Error List**: Row numbers with specific errors
4. **Foreign Key Validation**: Pre-insert validation with clear messages
5. **Display Codes Pattern**: Readable codes in errors, not UUIDs
6. **Template with Reference**: Combined reference sheet for all FKs
7. **Enhanced Toast Messages**: Proper pluralization and counts

See [CLAUDE.md](CLAUDE.md) for comprehensive development standards.

## Documentation

### Project Documentation Files

- **[CLAUDE.md](CLAUDE.md)** - Complete development guidelines and patterns
- **[CoE PRD.txt](CoE PRD.txt)** - Product requirements document
- **[MYJKKN_IMPLEMENTATION_SUMMARY.md](MYJKKN_IMPLEMENTATION_SUMMARY.md)** - MyJKKN API integration details
- **[EXAM_REGISTRATIONS_IMPLEMENTATION_SUMMARY.md](EXAM_REGISTRATIONS_IMPLEMENTATION_SUMMARY.md)** - Exam registrations module details
- **[COURSE_OFFERING_IMPORT_EXPORT_IMPROVEMENTS.md](COURSE_OFFERING_IMPORT_EXPORT_IMPROVEMENTS.md)** - Course offering enhancements
- **[DEPARTMENTS_TABLE_REFERENCE.md](DEPARTMENTS_TABLE_REFERENCE.md)** - Database schema reference
- **[UNIVERSAL_CRUD_PROMPT_TEMPLATE.md](UNIVERSAL_CRUD_PROMPT_TEMPLATE.md)** - CRUD template standards

### Authentication & Security Documentation

- **[GOOGLE_AUTHENTICATION_COMPLETE.md](GOOGLE_AUTHENTICATION_COMPLETE.md)** - Google OAuth setup
- **[USER_ACTIVE_STATUS_GUIDE.md](USER_ACTIVE_STATUS_GUIDE.md)** - User activation system
- **[SESSION_TIMEOUT_GUIDE.md](SESSION_TIMEOUT_GUIDE.md)** - Session management

## Troubleshooting

### Common Issues

1. **MyJKKN API Authentication Error (401)**
   - Verify API key in `.env.local`
   - Test connection with curl command
   - Contact MyJKKN administrator for valid API key

2. **Google OAuth Issues**
   - Verify OAuth credentials in Supabase dashboard
   - Check redirect URLs configuration

3. **Excel Import Errors**
   - Ensure all required fields are filled
   - Verify foreign key codes exist (use template reference sheet)
   - Check row numbers in error dialog
   - Download template for correct format

4. **Foreign Key Constraint Violations**
   - Run migrations: `npx supabase migration up`
   - Verify referenced records exist
   - Check institution ID matches across related tables

5. **Grade Assignment Issues**
   - Verify grade_system configuration for institution/regulation
   - Check if student is marked absent in exam_attendance
   - Review auto_assign_letter_grade trigger logs

## Success Metrics

- **60%** reduction in result processing time
- **70%** reduction in internal exam processing time
- **80%** reduction in paper consumption
- **99.9%** system uptime during critical periods
- Same-day digital certificate generation

## Contributing

### Development Workflow

1. Create feature branch from `main`
2. Implement changes following [CLAUDE.md](CLAUDE.md) standards
3. Test thoroughly (manual and automated)
4. Create pull request with detailed description
5. Wait for code review and approval
6. Merge to `main` after approval

### Code Review Checklist

- [ ] Follows naming conventions
- [ ] TypeScript strict mode compliant
- [ ] Implements standardized import/export pattern
- [ ] Includes inline validation with error messages
- [ ] Has proper error handling with user-friendly messages
- [ ] Uses foreign key auto-mapping where applicable
- [ ] Implements display codes pattern for error reporting
- [ ] Includes upload summary tracking
- [ ] Has comprehensive documentation

## Team

- **Full-Stack Developers**: 2
- **Backend Developer**: 1
- **UI/UX Designer**: 1
- **DevOps Engineer**: 1
- **QA Engineer**: 1
- **Project Manager**: 1

## License

Proprietary - JKKN Arts Colleges

## Support

For issues or questions:
- **Technical Issues**: Contact JKKN COE Development Team
- **API Key Issues**: Contact MyJKKN administrator
- **Bug Reports**: Create issue in project repository
- **Feature Requests**: Submit via project management system

---

**Version:** 2.0.0
**Last Updated:** December 2025
**Framework:** Next.js 15 with TypeScript
**Database:** PostgreSQL (Supabase)
**Status:** Active Development

**Powered by AI-Assisted Development:**
Built using Cursor IDE and Claude Code for accelerated development velocity.
