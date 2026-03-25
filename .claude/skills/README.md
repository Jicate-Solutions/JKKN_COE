# JKKN COE Claude Code Skills

This directory contains specialized Claude Code skills designed to accelerate development of the JKKN College of Engineering Controller of Examination (COE) application.

## Available Skills

### 1. generate-crud-page
**File:** `generate-crud-page.yaml`

Generate complete full-stack CRUD pages with frontend and backend implementation.

**Features:**
- ✅ Complete React/TypeScript frontend with Next.js 15
- ✅ API routes with Supabase integration
- ✅ Search, filter, sort, and pagination
- ✅ Import/Export functionality (JSON, Excel, CSV)
- ✅ Template export with reference sheets
- ✅ Row-by-row validation with detailed error tracking
- ✅ Upload summary cards (Total/Success/Failed)
- ✅ Foreign key auto-mapping
- ✅ Comprehensive form validation
- ✅ Toast notifications
- ✅ Scorecard metrics section
- ✅ Responsive design with dark mode

**Usage:**
```bash
# Invoke skill in Claude Code
/generate-crud-page

# Provide required parameters:
- entity_name: "Course"
- entity_name_plural: "Courses"
- table_name: "courses"
- api_route: "courses"
- page_route: "courses"
- icon_name: "BookOpen"
- fields: [array of field definitions]
- foreign_keys: [array of FK relationships]
```

**Generates:**
- `app/coe/[page_route]/page.tsx` (~1200+ lines)
- `app/api/[api_route]/route.ts` (~220+ lines)

**Reference Implementation:** See [degree/page.tsx](../../app/coe/degree/page.tsx)

---

### 2. generate-migration
**File:** `generate-migration.yaml`

Generate Supabase PostgreSQL database migration files.

**Features:**
- ✅ CREATE TABLE with proper schema
- ✅ Foreign key constraints with CASCADE
- ✅ Indexes for performance
- ✅ Row Level Security (RLS) policies
- ✅ Audit columns (created_at, updated_at, is_active)
- ✅ Triggers for updated_at timestamp
- ✅ Table and column comments
- ✅ Proper SQL formatting and comments

**Usage:**
```bash
/generate-migration

# Parameters:
- table_name: "exam_schedules"
- description: "Create exam schedules table"
- columns: [column definitions with types and constraints]
- indexes: [index definitions]
- rls_enabled: true
- rls_policies: [policy definitions]
```

**Generates:**
- `supabase/migrations/[timestamp]_[description].sql`

**Best Practices:**
- UUID primary keys with gen_random_uuid()
- NOT NULL constraints for required fields
- Composite indexes for multi-column queries
- CHECK constraints for data validation
- Foreign key indexes for join performance

---

### 3. test-api-endpoints
**File:** `test-api-endpoints.yaml`

Generate comprehensive API endpoint tests using Jest/Vitest.

**Features:**
- ✅ GET endpoint tests (all records, filters, not found)
- ✅ POST endpoint tests (valid, invalid, duplicates, FK errors)
- ✅ PUT endpoint tests (update, validation, not found)
- ✅ DELETE endpoint tests (delete, not found, cascade)
- ✅ Error response validation (400, 404, 409, 500)
- ✅ Response structure assertions
- ✅ Test data setup and teardown

**Usage:**
```bash
/test-api-endpoints

# Parameters:
- entity_name: "Course"
- api_route: "courses"
- sample_data: {test data object}
- foreign_keys: [array of FK fields]
- test_scenarios: [custom scenarios]
```

**Generates:**
- `__tests__/api/[api_route].test.ts`

**Test Coverage:**
- Happy path scenarios
- Validation errors
- Constraint violations
- Edge cases
- Error handling

---

### 4. generate-docs
**File:** `generate-docs.yaml`

Generate comprehensive documentation for modules and features.

**Documentation Types:**

#### API Documentation
- Endpoint specifications
- Request/response schemas
- Authentication requirements
- Error codes and messages
- Example requests/responses
- OpenAPI/Swagger style

#### User Guide
- Step-by-step workflows
- Screenshots and diagrams
- Best practices
- Troubleshooting
- FAQ section

#### Developer Documentation
- Architecture overview
- Component documentation
- Props and interfaces
- State management patterns
- Testing guidelines
- Code standards

#### Architecture Documentation
- System overview
- Database schema
- Component architecture
- Data flow diagrams
- Security considerations
- Performance optimization
- Scalability planning

**Usage:**
```bash
/generate-docs

# Parameters:
- module_name: "Courses"
- doc_type: "api" | "user-guide" | "developer" | "architecture"
- endpoints: [for API docs]
- user_workflows: [for user guides]
- components: [for developer docs]
```

**Generates:**
- `docs/[module_name]/[doc_type].md`

---

### 5. fix-common-issues
**File:** `fix-common-issues.yaml`

Diagnose and fix common issues in the application.

**Issue Categories:**

#### Authentication Errors
- User logged out unexpectedly
- Infinite redirect loops
- "User not authenticated" despite valid session
- Session timeout issues

#### Database Errors
- "relation does not exist"
- Duplicate key violations (23505)
- Not-null constraint violations (23502)
- Migration issues

#### Foreign Key Errors
- FK constraint violations (23503)
- Auto-mapping not working
- Invalid code lookups
- Missing referenced records

#### Validation Errors
- Form submits with invalid data
- Validation errors not displaying
- Incorrect validation logic

#### UI Issues
- Dark mode not working
- Font sizes inconsistent
- Form sheet not responsive
- Toast notifications not showing

#### Performance Issues
- Slow page loads
- Excessive re-renders
- Large bundle size
- Memory leaks

#### Build Errors
- "Module not found"
- TypeScript type errors
- ES module configuration issues

**Usage:**
```bash
/fix-common-issues

# Parameters:
- issue_category: "auth-errors" | "database-errors" | "foreign-key-errors" | etc.
- error_message: "Specific error message"
- affected_component: "File or component name"
```

**Output:**
- Diagnostic steps
- Root cause analysis
- Code fixes with examples
- Prevention strategies
- Related documentation

---

### 6. generate-component
**File:** `generate-component.yaml`

Generate reusable React components with TypeScript.

**Component Types:**

#### Form Input Component
- Label with required indicator
- Input field with validation
- Error message display
- Helper text support
- Accessibility attributes

#### Data Table Component
- Column definitions with sorting
- Row selection
- Pagination controls
- Loading and empty states
- Action buttons
- TypeScript generics

#### Modal Dialog Component
- Backdrop overlay
- Header/body/footer sections
- Keyboard accessibility
- Focus trap
- Animations

#### Card Component
- Header with icon and title
- Body content area
- Footer for actions
- Hover effects
- Gradient support

#### Layout Component
- Page header
- Breadcrumb navigation
- Main content area
- Sidebar support
- Responsive design

**Usage:**
```bash
/generate-component

# Parameters:
- component_name: "DataTable"
- component_type: "form-input" | "data-table" | "modal-dialog" | "card" | "layout"
- props: [array of prop definitions]
- has_children: true/false
- use_client: true/false
- styling: "tailwind" | "css-modules"
```

**Generates:**
- `components/[component_name].tsx`

**Features:**
- Full TypeScript type safety
- Accessibility built-in
- Tailwind CSS styling
- Composable and reusable
- JSDoc documentation
- Usage examples

---

## Development Workflow

### Creating a New Module

1. **Database Schema**
   ```bash
   /generate-migration
   # Create table with columns, indexes, RLS
   ```

2. **CRUD Pages**
   ```bash
   /generate-crud-page
   # Generate frontend and backend
   ```

3. **API Tests**
   ```bash
   /test-api-endpoints
   # Generate comprehensive tests
   ```

4. **Documentation**
   ```bash
   /generate-docs --doc_type=api
   /generate-docs --doc_type=user-guide
   ```

### Troubleshooting Workflow

1. **Identify Issue Category**
   - Authentication, Database, Validation, UI, etc.

2. **Run Diagnostic**
   ```bash
   /fix-common-issues --issue_category=[category]
   ```

3. **Apply Fix**
   - Follow diagnostic recommendations
   - Implement code fixes

4. **Verify Solution**
   - Test the fix
   - Run tests
   - Update documentation

### Component Development

1. **Generate Component**
   ```bash
   /generate-component
   ```

2. **Customize**
   - Add business logic
   - Enhance styling
   - Add tests

3. **Document**
   - Add usage examples
   - Update component library

---

## Skill Development Guidelines

### Creating New Skills

Skills are defined in YAML files with the following structure:

```yaml
name: skill-name
description: Brief description of what the skill does
version: 1.0.0

parameters:
  - name: param_name
    type: string
    description: Parameter description
    required: true
    enum: [optional list of allowed values]
    default: optional default value

prompt: |
  Detailed prompt template using Handlebars syntax.

  {{parameter_name}} - access parameters

  {{#if condition}}...{{/if}} - conditionals

  {{#each array}}...{{/each}} - loops

execution:
  working_directory: "."
  files_to_create:
    - "path/to/file.ext"

  validation:
    - Validation check 1
    - Validation check 2

output_format: code | markdown | diagnostic_report

tags:
  - tag1
  - tag2
```

### Best Practices

1. **Comprehensive Prompts**
   - Provide detailed instructions
   - Include code examples
   - Reference existing implementations
   - Specify file locations

2. **Flexible Parameters**
   - Use enums for fixed options
   - Provide sensible defaults
   - Make parameters optional when appropriate
   - Document each parameter clearly

3. **Validation**
   - List validation checks
   - Ensure output quality
   - Verify file creation

4. **Documentation**
   - Clear descriptions
   - Usage examples
   - Expected outcomes
   - Related skills

---

## Integration with Project

### Project Context

Skills leverage the following project resources:

- **CLAUDE.md**: Project overview and guidelines
- **DEVELOPMENT_STANDARDS.md**: Code style and conventions
- **Reference Implementations**: Working code examples
  - Frontend: [degree/page.tsx](../../app/coe/degree/page.tsx)
  - Backend: [api/degrees/route.ts](../../app/api/degrees/route.ts)
- **PRD**: [CoE PRD.txt](../../CoE%20PRD.txt) - Product requirements

### Tech Stack

- **Frontend**: React, Next.js 15, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui, Radix UI
- **Backend**: Next.js API routes, Supabase
- **Database**: PostgreSQL (Supabase)
- **Testing**: Jest/Vitest
- **Validation**: Zod (recommended)

---

## Skill Metrics

### Time Savings (Estimated)

| Task | Manual Time | With Skill | Savings |
|------|-------------|------------|---------|
| CRUD Page | 4-6 hours | 15 minutes | 90%+ |
| Migration | 30-60 min | 5 minutes | 85%+ |
| API Tests | 2-3 hours | 10 minutes | 90%+ |
| Documentation | 2-4 hours | 10 minutes | 90%+ |
| Component | 1-2 hours | 10 minutes | 85%+ |
| Troubleshooting | Variable | 5-15 min | 70%+ |

### Quality Improvements

- ✅ Consistent code patterns across modules
- ✅ Comprehensive error handling
- ✅ Complete validation coverage
- ✅ Accessibility built-in
- ✅ Type-safe implementations
- ✅ Best practices enforced
- ✅ Documentation generated automatically

---

## Version History

### v1.0.0 (2025-01-27)
- Initial skill collection
- 6 core skills implemented
- Comprehensive documentation
- Reference implementations

---

## Support & Contribution

### Getting Help

1. Check skill documentation in this README
2. Review example usage in comments
3. Examine reference implementations
4. Check project CLAUDE.md for conventions

### Improving Skills

To enhance existing skills:

1. Test skill with various parameters
2. Identify gaps or improvements
3. Update YAML file
4. Test changes thoroughly
5. Update documentation
6. Commit changes

### Adding New Skills

1. Identify repetitive development task
2. Create YAML file following template
3. Write comprehensive prompt
4. Add parameter definitions
5. Include validation checks
6. Document in README
7. Test with real use cases

---

## Quick Reference

### Invoking Skills

```bash
# In Claude Code chat
/skill-name

# Or use full path
@.claude/skills/skill-name.yaml
```

### Common Parameters

- **entity_name**: Singular entity name (PascalCase)
- **entity_name_plural**: Plural entity name (PascalCase)
- **table_name**: Database table name (snake_case)
- **api_route**: API endpoint path (kebab-case)
- **page_route**: Frontend route path (kebab-case)

### File Naming Conventions

- **Skills**: `kebab-case.yaml`
- **Components**: `PascalCase.tsx`
- **Pages**: `kebab-case/page.tsx`
- **API Routes**: `kebab-case/route.ts`
- **Migrations**: `timestamp_description.sql`

---

## Future Enhancements

Planned skills and improvements:

- [ ] **generate-form-wizard**: Multi-step form generator
- [ ] **generate-dashboard**: Analytics dashboard generator
- [ ] **optimize-performance**: Performance analysis and optimization
- [ ] **generate-report**: Report generation templates
- [ ] **setup-testing**: Test environment setup
- [ ] **generate-seed-data**: Database seed data generator
- [ ] **audit-security**: Security audit and fixes
- [ ] **generate-api-client**: TypeScript API client generator

---

## License

These skills are part of the JKKN COE project and follow the same license as the main project.

---

**Last Updated:** 2025-01-27
**Maintained By:** JKKN COE Development Team
**Claude Code Version:** Latest
