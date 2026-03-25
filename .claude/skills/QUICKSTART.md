# Claude Code Skills - Quick Start Guide

## 🚀 Getting Started

This guide will help you quickly start using Claude Code skills for your JKKN COE project.

## 📋 Prerequisites

- Claude Code CLI installed and configured
- JKKN COE project cloned and set up
- Basic understanding of the project structure

## 🎯 Common Use Cases

### Use Case 1: Create a New CRUD Module

**Scenario:** You need to create a new module for managing "Exam Schedules"

**Steps:**

1. **Create the database migration**
   ```
   Use the generate-migration skill with:
   - table_name: "exam_schedules"
   - columns: id, institution_code, semester_code, exam_date, start_time, end_time, etc.
   - foreign keys to institutions and semesters
   ```

2. **Generate the CRUD page**
   ```
   Use the generate-crud-page skill with:
   - entity_name: "ExamSchedule"
   - entity_name_plural: "ExamSchedules"
   - table_name: "exam_schedules"
   - api_route: "exam-schedules"
   - page_route: "exam-schedules"
   - icon_name: "Calendar"
   ```

3. **Create API tests**
   ```
   Use the test-api-endpoints skill with:
   - entity_name: "ExamSchedule"
   - api_route: "exam-schedules"
   ```

**Time:** ~30 minutes (vs. 8-10 hours manually)

---

### Use Case 2: Fix Authentication Issues

**Scenario:** Users are being logged out unexpectedly

**Steps:**

1. **Diagnose the issue**
   ```
   Use the fix-common-issues skill with:
   - issue_category: "auth-errors"
   - error_message: "User logged out unexpectedly"
   - affected_component: "middleware.ts"
   ```

2. **Apply the recommended fix**
   - Follow the diagnostic steps provided
   - Implement the code changes
   - Test the solution

**Time:** ~15-30 minutes (vs. 2-4 hours of debugging)

---

### Use Case 3: Create a Reusable Component

**Scenario:** You need a custom data table component with sorting and pagination

**Steps:**

1. **Generate the component**
   ```
   Use the generate-component skill with:
   - component_name: "CustomDataTable"
   - component_type: "data-table"
   - props: [data, columns, onSort, sortKey, sortDirection]
   - use_client: true
   ```

2. **Customize as needed**
   - Add specific styling
   - Integrate with your data source
   - Add any custom features

**Time:** ~20 minutes (vs. 2-3 hours manually)

---

### Use Case 4: Document a Module

**Scenario:** You need to create API documentation for the Courses module

**Steps:**

1. **Generate API documentation**
   ```
   Use the generate-docs skill with:
   - module_name: "Courses"
   - doc_type: "api"
   - endpoints: [GET, POST, PUT, DELETE endpoints]
   ```

2. **Generate user guide**
   ```
   Use the generate-docs skill with:
   - module_name: "Courses"
   - doc_type: "user-guide"
   - user_workflows: [Add Course, Edit Course, Import Courses]
   ```

**Time:** ~20 minutes (vs. 4-6 hours manually)

---

## 📝 Skill Quick Reference

### Generate CRUD Page
```yaml
Parameters:
  entity_name: "Course"              # PascalCase, singular
  entity_name_plural: "Courses"      # PascalCase, plural
  table_name: "courses"              # snake_case
  api_route: "courses"               # kebab-case
  page_route: "courses"              # kebab-case
  icon_name: "BookOpen"              # Lucide icon name
  fields: [...]                      # Array of field objects
  foreign_keys: [...]                # Array of FK objects

Generates:
  - app/coe/courses/page.tsx
  - app/api/courses/route.ts
```

### Generate Migration
```yaml
Parameters:
  table_name: "exam_schedules"
  description: "Create exam schedules table"
  columns: [...]
  indexes: [...]
  rls_enabled: true
  rls_policies: [...]

Generates:
  - supabase/migrations/[timestamp]_create_exam_schedules_table.sql
```

### Test API Endpoints
```yaml
Parameters:
  entity_name: "Course"
  api_route: "courses"
  sample_data: {...}
  foreign_keys: [...]

Generates:
  - __tests__/api/courses.test.ts
```

### Generate Documentation
```yaml
Parameters:
  module_name: "Courses"
  doc_type: "api" | "user-guide" | "developer" | "architecture"
  endpoints: [...]        # For API docs
  user_workflows: [...]   # For user guides
  components: [...]       # For developer docs

Generates:
  - docs/Courses/[doc_type].md
```

### Fix Common Issues
```yaml
Parameters:
  issue_category:
    - "auth-errors"
    - "database-errors"
    - "foreign-key-errors"
    - "validation-errors"
    - "ui-issues"
    - "performance-issues"
    - "build-errors"
  error_message: "Specific error message"
  affected_component: "file or component name"

Output:
  - Diagnostic report with solutions
```

### Generate Component
```yaml
Parameters:
  component_name: "DataTable"
  component_type:
    - "form-input"
    - "data-table"
    - "modal-dialog"
    - "card"
    - "layout"
    - "custom"
  props: [...]
  has_children: true/false
  use_client: true/false

Generates:
  - components/DataTable.tsx
```

---

## 🎨 Example Workflows

### Complete Feature Development

**Goal:** Add a new "Student Attendance" feature

**Workflow:**

1. **Database Schema** (5 min)
   - generate-migration: Create `student_attendance` table

2. **CRUD Interface** (15 min)
   - generate-crud-page: Create attendance management page

3. **Custom Components** (10 min)
   - generate-component: Create `AttendanceCalendar` component
   - generate-component: Create `AttendanceStats` card

4. **Testing** (10 min)
   - test-api-endpoints: Generate API tests

5. **Documentation** (10 min)
   - generate-docs: Create API documentation
   - generate-docs: Create user guide

**Total Time:** ~50 minutes (vs. 16-20 hours manually)

---

### Troubleshooting Session

**Goal:** Fix multiple issues reported by users

**Workflow:**

1. **Authentication Issue** (15 min)
   - fix-common-issues: Diagnose and fix "auth-errors"

2. **Foreign Key Validation** (10 min)
   - fix-common-issues: Fix "foreign-key-errors"

3. **UI Inconsistency** (10 min)
   - fix-common-issues: Fix "ui-issues" (font sizes)

4. **Performance Problem** (15 min)
   - fix-common-issues: Diagnose "performance-issues"

**Total Time:** ~50 minutes (vs. 6-8 hours of debugging)

---

## 💡 Pro Tips

### Tip 1: Chain Skills Together
Use multiple skills in sequence for complete feature development:
```
1. generate-migration
2. generate-crud-page
3. test-api-endpoints
4. generate-docs
```

### Tip 2: Customize Generated Code
Skills generate 80-90% of the code. You can:
- Add business-specific logic
- Customize styling
- Add additional validation
- Enhance error handling

### Tip 3: Use Reference Implementations
Generated code follows these proven patterns:
- Frontend: [app/coe/degree/page.tsx](../../app/coe/degree/page.tsx)
- Backend: [app/api/degrees/route.ts](../../app/api/degrees/route.ts)

### Tip 4: Keep Skills Updated
As the project evolves:
- Update skill templates
- Add new patterns
- Refine prompts
- Share improvements with team

### Tip 5: Leverage Type Safety
All generated code is fully typed:
- TypeScript interfaces for data
- Proper type checking
- IntelliSense support

---

## 🔧 Troubleshooting Skills

### Skill Not Found
**Problem:** Claude Code can't find the skill

**Solution:**
- Verify file is in `.claude/skills/` directory
- Check YAML syntax is valid
- Ensure skill name matches filename

### Invalid Parameters
**Problem:** Skill fails with parameter errors

**Solution:**
- Check required parameters are provided
- Verify parameter types match definition
- Review parameter validation rules

### Generated Code Has Errors
**Problem:** Generated code doesn't compile

**Solution:**
- Check if dependencies are installed
- Verify import paths are correct
- Review TypeScript configuration
- Compare with reference implementations

---

## 📚 Learning Resources

### Project Documentation
- [CLAUDE.md](../../CLAUDE.md) - Project overview
- [DEVELOPMENT_STANDARDS.md](../../.cursor/rules/DEVELOPMENT_STANDARDS.md) - Code standards
- [CoE PRD.txt](../../CoE%20PRD.txt) - Product requirements

### Reference Implementations
- [Degree Module](../../app/coe/degree/) - Complete CRUD example
- [Courses Module](../../app/coe/courses/) - With foreign keys
- [Students Module](../../app/coe/students/) - Complex relationships

### External Resources
- [Claude Code Documentation](https://docs.claude.ai/claude-code)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)

---

## 🤝 Getting Help

### In Order of Preference:

1. **Check Skill Documentation**
   - Read [README.md](README.md)
   - Review skill YAML file
   - Look at example usage

2. **Review Reference Code**
   - Check working implementations
   - Compare with generated code
   - Identify patterns

3. **Use fix-common-issues Skill**
   - Diagnose specific problems
   - Get targeted solutions

4. **Ask Claude Code**
   - Describe the issue
   - Provide error messages
   - Share relevant code

---

## 🎯 Next Steps

1. **Try Your First Skill**
   - Start with something simple (generate-component)
   - Review the generated code
   - Understand the patterns

2. **Complete a Feature**
   - Use generate-migration
   - Use generate-crud-page
   - Test the functionality

3. **Customize and Extend**
   - Modify generated code
   - Add custom features
   - Share improvements

4. **Create Your Own Skill**
   - Identify repetitive tasks
   - Write skill definition
   - Test and refine

---

## 📈 Measuring Success

### Development Velocity Metrics

Track your improvements:
- Time to create CRUD module: Target < 30 min
- Time to fix common issues: Target < 15 min
- Code consistency score: Target 95%+
- Test coverage: Target 80%+
- Documentation completeness: Target 100%

### Quality Metrics

Generated code should have:
- ✅ Zero TypeScript errors
- ✅ Complete type definitions
- ✅ Comprehensive validation
- ✅ Proper error handling
- ✅ Accessibility compliance
- ✅ Responsive design
- ✅ Dark mode support

---

**Ready to accelerate your development?**

Start with the generate-crud-page skill and create your first module in under 30 minutes!

---

**Last Updated:** 2025-01-27
**Version:** 1.0.0
