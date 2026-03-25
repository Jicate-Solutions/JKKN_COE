# Reference Data Sheet Structure

## Overview
The Reference Data sheet (Sheet 2) in the Course Master Excel template provides a clean, organized layout similar to a database reference guide. Each section contains valid values that can be used in the Course Master sheet.

## Sheet Structure

### Column Layout
| Column A | Column B | Column C |
|----------|----------|----------|
| Category | Code/Value | Name/Description |

### Sections

---

## 1. INSTITUTION CODES
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Institution Code     | Institution Name  |
                     | JKKN              | Example Institution: JKKN
                     | JKKNASC           | Example Institution: JKKNASC
                     | JKKNPC            | Example Institution: JKKNPC
```
**Source:** Fetched from `institutions` table (active records only)

---

## 2. REGULATION CODES
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Regulation Code      | Regulation Name   |
                     | R2020             | Regulation: R2020
                     | R2021             | Regulation: R2021
                     | R2022             | Regulation: R2022
```
**Source:** Fetched from `regulations` table (active records only)

---

## 3. DEPARTMENT CODES
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Department Code      | Department Name   |
                     | CSE               | Computer Science and Engineering
                     | ECE               | Electronics and Communication Engineering
                     | MECH              | Mechanical Engineering
                     | CIVIL             | Civil Engineering
                     | MBA               | Master of Business Administration
```
**Source:** Fetched from `departments` table (active records only)

---

## 4. COURSE CATEGORY
```
Category              | Code/Value            | Name/Description
---------------------|-----------------------|---------------------------
Value                | Description           |
                     | Theory                | Theory-based course
                     | Practical             | Practical/Lab-based course
                     | Project               | Project-based course
                     | Theory + Practical    | Combined theory and practical
                     | Theory + Project      | Combined theory and project
                     | Field Work            | Field work or internship
                     | Community Service     | Community service activity
                     | Group Project         | Group project work
                     | Non Academic          | Non-academic activity
```
**Source:** Database CHECK constraint `course_course_category_check`

---

## 5. COURSE TYPE
```
Category              | Code/Value                    | Name/Description
---------------------|-------------------------------|---------------------------
Value                | Description                   |
                     | Core                          | Core/Compulsory course
                     | Generic Elective              | Generic elective course
                     | Skill Enhancement             | Skill enhancement course
                     | Ability Enhancement           | Ability enhancement course
                     | Language                      | Language course
                     | English                       | English language course
                     | Advance learner course        | Advanced learner course
                     | Additional Credit course      | Additional credit course
                     | Discipline Specific elective  | Discipline specific elective
                     | Audit Course                  | Audit course (no grade)
                     | Bridge course                 | Bridge/Remedial course
                     | Non Academic                  | Non-academic activity
                     | Naanmuthalvan                 | Naanmuthalvan program
                     | Elective                      | General elective course
```
**Source:** Database CHECK constraint `course_course_type_check`

---

## 6. COURSE PART MASTER
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Value                | Description       |
                     | Part I            | First part of the course
                     | Part II           | Second part of the course
                     | Part III          | Third part of the course
                     | Part IV           | Fourth part of the course
                     | Part V            | Fifth part of the course
```
**Source:** Database CHECK constraint `course_course_part_master_check`

---

## 7. EVALUATION TYPE
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Value                | Description       |
                     | CA                | Continuous Assessment only
                     | ESE               | End Semester Examination only
                     | CA + ESE          | Combined CA and ESE
```
**Source:** Database CHECK constraint `course_evaluation_type_check`

---

## 8. RESULT TYPE
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Value                | Description       |
                     | Mark              | Numeric marks
                     | Status            | Pass/Fail status only
```
**Source:** Database CHECK constraint `course_result_type_check`

---

## 9. E CODE NAME
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Value                | Description       |
                     | None              | No language code
                     | Tamil             | Tamil language
                     | English           | English language
                     | French            | French language
                     | Malayalam         | Malayalam language
                     | Hindi             | Hindi language
                     | Computer Science  | Computer Science elective
                     | Mathematics       | Mathematics elective
```
**Source:** Database CHECK constraint `course_e_code_name_check`

---

## 10. BOOLEAN FIELDS
```
Category              | Code/Value        | Name/Description
---------------------|-------------------|---------------------------
Value                | Description       |
                     | TRUE              | Yes/Active/Enabled (case-insensitive)
                     | FALSE             | No/Inactive/Disabled (case-insensitive)
```
**Note:** Boolean fields accept TRUE or FALSE in any case (true, True, TRUE, false, False, FALSE)

---

## 11. IMPORTANT NOTES
```
• Fields marked with * are MANDATORY
• Use EXACT values from the lists above (case-sensitive)
• Institution, Regulation, and Department codes MUST exist in database
• Boolean fields: Use TRUE or FALSE only (case-insensitive)
• Course Code: Only letters, numbers, hyphens (-), and underscores (_)
• Credits: Numbers between 0 and 99
• If Split Credit = TRUE, both Theory and Practical credits required
• URLs: Must start with http:// or https://
```

---

## Design Features

### 1. Clean Section Headers
- Each section starts with a blank row
- Section title in Column A with all caps
- Consistent spacing between sections

### 2. Consistent Table Structure
- Header row: "Category | Code/Value | Name/Description"
- Sub-header row: Specific labels for each section
- Data rows: Empty Category column, values in B and C

### 3. Dynamic Data
- Institution, Regulation, and Department codes are fetched from database
- Only active records (status = true) are shown
- Fallback example data if database is empty

### 4. Comprehensive Coverage
- All database CHECK constraints included
- All boolean fields documented
- All foreign key references listed
- Important usage notes included

### 5. User-Friendly
- Clear descriptions for each value
- Organized by category
- Easy to scan and find values
- Copy-paste friendly format

---

## Usage Example

When filling out the Course Master sheet:

1. **For Institution Code:**
   - Go to "INSTITUTION CODES" section
   - Find your institution in Column B
   - Copy the exact code (e.g., "JKKN")

2. **For Course Category:**
   - Go to "COURSE CATEGORY" section
   - Review descriptions in Column C
   - Copy exact value from Column B (e.g., "Theory + Practical")

3. **For Boolean Fields:**
   - Use exactly "TRUE" or "FALSE"
   - Case doesn't matter (true, TRUE, True all work)

---

## Benefits

✅ **Easy Navigation** - Clear section headers make finding values quick

✅ **Complete Information** - All valid values in one place

✅ **Database Aligned** - Values match exact database constraints

✅ **Visual Clarity** - Table format is easy to read and understand

✅ **Copy-Paste Ready** - Values can be copied directly to Course Master sheet

✅ **Professional Look** - Clean, organized layout similar to official reference docs

✅ **Error Prevention** - Users can see all valid options before entering data

✅ **Self-Documenting** - Descriptions explain what each value means

---

## Maintenance

### Adding New Values

To add new constraint values (e.g., new Course Type):

1. Update database CHECK constraint
2. Update `lib/utils/excel-template-generator.ts`
3. Find the relevant section (e.g., "COURSE TYPE")
4. Add new value to the array:
   ```typescript
   ['New Value', 'Description of new value']
   ```

### Modifying Descriptions

To change descriptions:
1. Locate the section in `excel-template-generator.ts`
2. Update the description in the array
3. Template will auto-update on next download

### Dynamic Data

Institution, Regulation, and Department codes update automatically:
- Added when records are created in database
- Removed if status is set to false
- Always shows current active records

---

## Version History

### Version 2.0 (Current)
- Restructured as clean table format
- Added section headers
- Included all database constraints
- Dynamic data from database tables
- Clear descriptions for all values

### Version 1.0 (Previous)
- Simple list format
- Basic reference data
- Less organized structure

---

## Technical Notes

**File:** `lib/utils/excel-template-generator.ts`

**Key Functions:**
- `addSection(title)` - Adds section header with spacing
- `addTableHeaders(col1, col2, col3)` - Adds consistent table headers
- `forEach` loops - Generate data rows from arrays

**Column Widths:**
- Column A (Category): 25 characters
- Column B (Code/Value): 35 characters
- Column C (Name/Description): 50 characters

**Data Sources:**
- `referenceData.institutions` - From API fetch
- `referenceData.regulations` - From API fetch
- `referenceData.departments` - From API fetch
- Constraint values - Hardcoded arrays matching database schema

---

This structure ensures users have all the information they need in a clean, organized, and easy-to-use format!
