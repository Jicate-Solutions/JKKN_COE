# Entity CRUD Page Builder - Setup Guide

## What Was Created

A complete skill for building standardized entity CRUD pages in the JKKN COE application, following the proven patterns from the degree page implementation.

## Directory Structure

```
.claude/skills/entity-crud-page-builder/
├── SKILL.md                              # Main skill definition with metadata and workflow
├── SETUP.md                              # This file - setup and usage guide
├── references/
│   ├── validation-patterns.md            # Comprehensive validation examples
│   ├── upload-patterns.md                # Import/export implementation details
│   └── form-patterns.md                  # Form design and layout patterns
├── scripts/
│   └── README.md                         # Placeholder for future automation scripts
└── assets/
    └── README.md                         # Placeholder for template files
```

## Skill Purpose

This skill helps maintain consistency across all entity management pages by providing:

1. **Complete Workflow**: Step-by-step implementation guide for entity CRUD pages
2. **Standardized Patterns**: Proven patterns for validation, forms, uploads, and error handling
3. **Reference Documentation**: Detailed examples for common scenarios
4. **Best Practices**: Foreign key handling, error tracking, toast notifications

## When This Skill Activates

Claude will automatically use this skill when you mention:
- Creating entity pages (courses, students, departments, etc.)
- CRUD operations
- Standardizing existing pages
- Import/export functionality
- Data validation patterns

## How to Use This Skill

### Creating a New Entity Page

1. **Tell Claude what entity you want to create:**
   ```
   Create a new entity CRUD page for "Exams" following the standard pattern
   ```

2. **Claude will use the skill to:**
   - Define TypeScript interfaces
   - Implement data fetching
   - Build data table with sorting/filtering
   - Create form with validation
   - Add import/export functionality
   - Implement CRUD operations
   - Add toast notifications

### Standardizing an Existing Page

1. **Point Claude to the existing page:**
   ```
   Standardize the exam-registrations page to match the degree page pattern
   ```

2. **Claude will:**
   - Review current implementation
   - Identify gaps vs. standard pattern
   - Update validation, upload handling, error display
   - Ensure consistency with other pages

### Adding Features to Entity Pages

1. **Request specific features:**
   ```
   Add import/export functionality to the students page with detailed error tracking
   ```

2. **Claude will:**
   - Use upload-patterns.md reference
   - Implement Excel template export with reference sheets
   - Add row-by-row validation
   - Create visual error dialog with summary cards

## Key Features of Generated Pages

✅ **Data Table**: Sortable, searchable, paginated (10 items per page)
✅ **Scorecard**: Total, Active, Inactive, New This Month metrics
✅ **Form Sheet**: Gradient header, sectioned layout, comprehensive validation
✅ **Import/Export**: Excel/JSON support with detailed error tracking
✅ **Template Export**: Excel templates with mandatory field markers and reference sheets
✅ **Upload Summary**: Visual 3-column cards (Total/Success/Failed)
✅ **Error Display**: Detailed errors with Excel row numbers
✅ **Foreign Key Handling**: Automatic ID resolution from codes
✅ **Toast Notifications**: Context-aware success/error/warning messages
✅ **Mobile Responsive**: Works on all screen sizes
✅ **Dark Mode**: Full dark mode support

## Reference Files

### validation-patterns.md
Contains examples for:
- Required field validation
- Format validation (regex)
- Length constraints
- Numeric range validation
- Conditional validation
- URL/email/phone validation
- Date validation
- Foreign key validation (client & server)

### upload-patterns.md
Contains implementation for:
- Excel template export with reference sheets
- Data export (current data)
- Import handler (JSON/CSV/Excel)
- Row-by-row validation and tracking
- Visual error dialog with summary cards
- Toast notifications for upload results

### form-patterns.md
Contains patterns for:
- Form container structure
- Header with gradient design
- Section organization
- Field types (text, number, select, toggle, etc.)
- Conditional fields (enabled/disabled)
- Grid layouts (1/2/3 columns)
- Action buttons
- Form handlers (reset, open, save)

## Examples

### Create a new "Subjects" entity page:
```
Create a new CRUD page for Subjects with fields:
- subject_code (required)
- subject_name (required)
- department_code (foreign key, required)
- credits (number, required)
- description (optional)
- is_active (toggle)

Include import/export with Excel template and reference sheet for departments.
```

### Standardize an existing page:
```
Update the exam-registrations page to match the standard entity CRUD pattern:
- Add upload summary with visual cards
- Improve error handling with detailed row-level tracking
- Add Excel template export with reference sheet
- Standardize toast notifications
```

### Add specific functionality:
```
Add comprehensive validation to the courses page:
- Validate course_code format (alphanumeric with hyphens)
- Add length constraints
- Validate credits range (0-10)
- Add conditional validation for split credits
```

## Testing Your Generated Pages

After Claude generates or updates a page, verify:
- ✅ All CRUD operations work (create, read, update, delete)
- ✅ Validation prevents invalid data entry
- ✅ Sorting works on all columns
- ✅ Search filters correctly
- ✅ Status filter works (All/Active/Inactive)
- ✅ Pagination navigates correctly
- ✅ Excel template exports with reference sheets
- ✅ Import validation catches errors
- ✅ Error dialog shows detailed information
- ✅ Toast notifications appear for all operations
- ✅ Mobile layout is responsive
- ✅ Dark mode displays correctly

## Customization

Each entity can be customized while maintaining the core pattern:
- Add entity-specific fields
- Customize validation rules
- Add additional sections to forms
- Modify table columns
- Add entity-specific features
- Adjust color schemes (headers/sections)

## Benefits

1. **Consistency**: All entity pages look and behave the same
2. **Quality**: Proven patterns reduce bugs
3. **Speed**: Faster development with standardized approach
4. **Maintainability**: Easier to update and fix issues
5. **User Experience**: Predictable interface across the application
6. **Validation**: Comprehensive error handling and feedback
7. **Foreign Keys**: Automatic ID resolution prevents data integrity issues

## Next Steps

1. Review the degree page implementation ([app/coe/degree/page.tsx](app/coe/degree/page.tsx))
2. Identify entities that need CRUD pages
3. Ask Claude to create or standardize pages using this skill
4. Test generated pages thoroughly
5. Iterate based on specific requirements

## Notes

- This skill is based on the proven patterns from the degree page
- All patterns follow the JKKN COE development standards
- The skill integrates with project documentation (CLAUDE.md)
- Reference files provide detailed examples for complex scenarios
- The skill will evolve as new patterns emerge
