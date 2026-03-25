# Course Mapping PDF Report Generation

## Overview

The Course Mapping PDF Report feature generates a comprehensive PDF document showing all mapped courses for a specific Program, Batch, and Regulation. The report layout follows the standard institutional format with header, course details table, and proper formatting.

## Features

### ✅ Report Components

1. **Header Section**
   - College logo placeholder (left)
   - Institution name (centered, bold)
   - Institution address (centered)
   - Autonomous institution note (centered, italic)
   - Report title: "DEGREE BRANCH COURSE DETAILS"
   - Program/Degree information
   - Batch details
   - Regulation information (if applicable)

2. **Course Details Table**
   - Grouped by semester
   - Sorted by course order within each semester
   - Comprehensive columns for all course attributes

### 📊 Table Columns

| Column | Description | Width |
|--------|-------------|-------|
| SEM | Semester number | 12mm |
| PART | Course part/group (I, Elective-I, etc.) | 15mm |
| COURSE CODE | Course code | 22mm |
| COURSE TITLE | Full course name | 45mm |
| COURSE CATEG. | Course category | 18mm |
| COURSE TYPE | Course type | 18mm |
| EVALUATION PATTERN | Evaluation method | 22mm |
| CREDIT | Course credits | 14mm |
| EXAM HRS | Exam hours | 14mm |
| SORT ORDER | Display order | 14mm |
| INTERNAL MARKS | Max, Pass, Converted | 28mm |
| ESE MARKS | Max, Pass, Converted | 28mm |
| TOTAL | Max, Min | 24mm |

### 🎨 Formatting Details

**Internal Marks Format:** `Max, Pass, Converted`
- Example: `40, 14, 25`

**External (ESE) Marks Format:** `Max, Pass, Converted`
- Example: `60, 26, 75`

**Total Marks Format:** `Max, Min`
- Example: `100, 40`

**PART Column Logic:**
- "General" course group → `I`
- "Elective-I" → `Elective-I`
- "Elective-II" → `Elective-II`
- etc.

## Usage

### Step 1: Select Criteria

Navigate to the Course Mapping page and select:
1. **Institution** (required)
2. **Program** (required)
3. **Batch** (required)
4. **Regulation** (optional, but recommended)

### Step 2: Generate PDF

Click the **"Generate PDF"** button in the header.

The system will:
1. Validate that all required fields are selected
2. Fetch course mapping data from the database
3. Join with related tables (courses, programs, batches, degrees, semesters)
4. Generate a formatted PDF document
5. Automatically download the file

### Step 3: Review PDF

The downloaded PDF file will be named:
```
Course_Mapping_[ProgramName]_[BatchName].pdf
```

Example: `Course_Mapping_B.A_ENGLISH_LITERATURE_2024_-_2027.pdf`

## Technical Implementation

### File Structure

```
lib/utils/generate-course-mapping-pdf.ts                      # PDF generation logic
app/api/course-management/course-mapping/report/route.ts     # Data fetching API endpoint
app/(coe)/course-management/course-mapping/page.tsx          # UI with Generate PDF button
```

### API Endpoint

**GET** `/api/course-mapping/report`

**Query Parameters:**
- `institution_code` (required)
- `program_code` (required)
- `batch_code` (required)
- `regulation_code` (optional)

**Response Format:**
```json
{
  "institutionName": "JKKN College of Arts and Science",
  "institutionAddress": "Komarapalayam, Namakkal, Tamil Nadu, 638183",
  "programName": "ENGLISH LITERATURE",
  "degreeName": "B.A",
  "batchName": "2024 - 2027",
  "regulationName": "Regulation 2024",
  "mappings": [
    {
      "semester_number": 1,
      "semester_name": "Semester I",
      "course_code": "24UENG101",
      "course_title": "English Grammar and Composition",
      "course_category": "Theory",
      "course_type": "Core",
      "credits": 4,
      "internal_max_mark": 40,
      "internal_pass_mark": 14,
      "internal_converted_mark": 25,
      "external_max_mark": 60,
      "external_pass_mark": 26,
      "external_converted_mark": 75,
      "total_max_mark": 100,
      "total_pass_mark": 40
    }
  ]
}
```

### Database Queries

The report endpoint performs the following joins:
- `course_mapping` → `courses` (course details)
- `course_mapping` → `semesters` (semester info)
- `programs` → `degrees` (degree name)
- `institutions` (institution details)
- `batches` (batch details)
- `regulations` (regulation name)

### PDF Library

Uses `jsPDF` with `jspdf-autotable` plugin for:
- Professional table rendering
- Multi-page support with automatic page breaks
- Custom header/footer on each page
- Precise column width control
- Cell formatting and alignment

## Validation & Error Handling

### Pre-Generation Validation

✅ Institution must be selected
✅ Program must be selected
✅ Batch must be selected

### Runtime Checks

✅ Validates data exists in database
✅ Checks for at least one course mapping
✅ Handles missing optional fields gracefully
✅ Provides user-friendly error messages

### Error Messages

| Error | Message |
|-------|---------|
| Missing selection | "Please select Institution, Program, and Batch to generate the report." |
| No mappings found | "No course mappings found for the selected criteria." |
| API error | Specific error from server (e.g., "Institution not found") |
| Network error | "Failed to generate PDF report." |

## Customization Options

### Logo Addition

To add your institution logo:

1. Place logo image in `public/images/logo.png`
2. Update `generate-course-mapping-pdf.ts`:

```typescript
// Replace logo placeholder with:
const logoPath = '/images/logo.png'
doc.addImage(logoPath, 'PNG', 10, 10, 25, 25)
```

### Color Scheme

Current table header color: `#2980B9` (blue)

To change, modify in `generate-course-mapping-pdf.ts`:

```typescript
headStyles: {
  fillColor: [41, 128, 185], // RGB values
  // Change to your preferred color
}
```

### Column Widths

Adjust in `columnStyles` object:

```typescript
columnStyles: {
  0: { halign: 'center', cellWidth: 12 }, // Modify width here
  // ... other columns
}
```

### Font Sizes

Current settings:
- Institution name: 14pt bold
- Title: 12pt bold
- Program/Batch: 10pt bold
- Table headers: 7pt bold
- Table body: 7pt normal

## Best Practices

### ✅ Do's

- Always select regulation when available for accurate course filtering
- Verify course mappings are saved before generating report
- Review the generated PDF to ensure all data is correct
- Generate separate PDFs for different batches/programs

### ⚠️ Don'ts

- Don't generate PDF before saving course mappings
- Don't rely on old PDFs - regenerate when data changes
- Don't modify PDF generation code without testing with sample data
- Don't ignore validation error messages

## Troubleshooting

### Issue: "No course mappings found"

**Solution:** Ensure courses are mapped and saved for the selected criteria.

### Issue: PDF shows "-" for course names

**Solution:** Check that courses have `course_title` or `course_name` filled in the courses table.

### Issue: Wrong semester order

**Solution:** Verify `semester_number` field is correctly set in the semesters table.

### Issue: PDF doesn't download

**Solution:**
1. Check browser console for errors
2. Verify API endpoint is accessible
3. Ensure jsPDF libraries are installed

### Issue: Column alignment is off

**Solution:** Adjust `columnStyles` widths in `generate-course-mapping-pdf.ts` to ensure total width doesn't exceed page width (landscape A4 = ~277mm minus margins).

## Future Enhancements

Potential improvements:
- [ ] Add college logo upload interface
- [ ] Support for portrait orientation option
- [ ] Email PDF directly from interface
- [ ] Bulk PDF generation for multiple batches
- [ ] Watermark support for draft reports
- [ ] Custom header/footer text options
- [ ] Excel export alternative format

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Verify database tables have required data
3. Ensure all foreign key relationships are correct
4. Review API endpoint response in Network tab

---

**Last Updated:** January 2025
**Version:** 1.0.0
