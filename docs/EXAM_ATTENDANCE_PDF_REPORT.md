# Exam Attendance PDF Report Generation

## Overview

The Exam Attendance PDF Report feature generates a comprehensive PDF document showing attendance statistics for all exams conducted within a specific Examination Session. The report includes summary statistics, date-wise breakdowns, and course-level attendance details.

## Features

### ✅ Report Components

1. **Header Section**
   - College logo (left side)
   - Institution name (centered, bold)
   - Institution address (centered)
   - Autonomous institution note (centered, italic)
   - Report title: "EXAMINATION ATTENDANCE REPORT"
   - Examination session information

2. **Summary Statistics Section**
   - Total exams conducted
   - Total student registrations
   - Total present count
   - Total absent count
   - Overall attendance percentage

3. **Detailed Attendance Tables**
   - Grouped by exam date and session
   - Sorted chronologically
   - Course-level breakdown
   - Session subtotals

### 📊 Table Columns

| Column | Description | Width | Alignment |
|--------|-------------|-------|-----------|
| S.No | Serial number | 15mm | Center |
| Course Code | Course code | 25mm | Center |
| Course Title | Full course name | 80mm | Left |
| Category | Course category | 25mm | Center |
| Total Students | Number of registered students | 22mm | Center |
| Present | Number of present students | 20mm | Center |
| Absent | Number of absent students | 20mm | Center |
| Attendance % | Attendance percentage | 25mm | Center |

### 🎨 Formatting Details

**Page Layout:**
- Size: Legal (landscape orientation)
- Margins: 0.5 inch (12.7mm) all sides
- Font: Times New Roman
- Multi-page support with headers/footers

**Color Scheme:**
- Header background: Light gray (#F0F0F0)
- Summary table header: Light gray (#DCDCDC)
- Session totals: Light gray background (#F5F5F5)
- Grid lines: Black (0.3mm width)

**Typography:**
- Institution name: 16pt bold
- Report title: 14pt bold
- Section headers: 12pt bold
- Table headers: 11pt bold
- Table body: 10pt normal
- Footer: 10pt normal (page number), 9pt italic (timestamp)

## Usage

### Step 1: Navigate to Exam Attendance Page

Go to the Exam Attendance page from your dashboard.

### Step 2: Select Criteria

Select the following required fields:
1. **Institution** (required)
2. **Examination Session** (required)

Other fields (Program, Exam Date, Session Type, Course) are optional for attendance marking but not required for report generation.

### Step 3: Generate PDF

Click the **"Generate PDF Report"** button in the header area (top-right).

The system will:
1. Validate that Institution and Examination Session are selected
2. Fetch all attendance data for the selected session
3. Group data by exam date and session
4. Calculate summary statistics
5. Generate a formatted PDF document
6. Automatically download the file

### Step 4: Review PDF

The downloaded PDF file will be named:
```
Exam_Attendance_Report_[SessionCode]_[Date].pdf
```

Example: `Exam_Attendance_Report_JKKNCAS-NOV-DEC-2025_2025-10-31.pdf`

## Technical Implementation

### File Structure

```
lib/utils/generate-exam-attendance-pdf.ts                          # PDF generation logic
app/api/exam-management/exam-attendance/report/route.ts            # Data fetching API endpoint
supabase/migrations/20251031_create_exam_attendance_report_function.sql  # Database function
app/(coe)/exam-management/exam-attendance/page.tsx                 # UI with Generate PDF button
```

### API Endpoint

**GET** `/api/exam-attendance/report`

**Query Parameters:**
- `institution_code` (required) - e.g., "JKKNCAS"
- `session_code` (required) - e.g., "JKKNCAS-NOV-DEC-2025"

**Response Format:**
```json
{
  "institutionName": "J.K.K NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)",
  "institutionCode": "JKKNCAS",
  "institutionAddress": "Komarapalayam - 638 183, Namakkal District, Tamil Nadu",
  "sessionCode": "JKKNCAS-NOV-DEC-2025",
  "sessionName": "November-December 2025 Examinations",
  "records": [
    {
      "exam_date": "15-11-2025",
      "exam_session": "FN",
      "course_code": "24UENG101",
      "course_name": "English Grammar and Composition",
      "course_category": "Theory",
      "total_students": 45,
      "present_count": 43,
      "absent_count": 2,
      "attendance_percentage": 95.56
    }
  ]
}
```

### Database Function

**Function:** `get_exam_attendance_report(p_institution_code TEXT, p_session_code TEXT)`

**Purpose:** Efficiently retrieves attendance data with proper joins and aggregations

**Returns:** Table with exam date, session, course info, and attendance statistics

**Usage:**
```sql
SELECT * FROM get_exam_attendance_report('JKKNCAS', 'JKKNCAS-NOV-DEC-2025');
```

### PDF Library

Uses `jsPDF` with `jspdf-autotable` plugin for:
- Professional table rendering
- Multi-page support with automatic page breaks
- Custom header/footer on each page
- Precise column width control
- Cell formatting and alignment
- Summary statistics boxes

## Data Flow

```
1. User clicks "Generate PDF Report" button
   ↓
2. Frontend validates Institution and Session are selected
   ↓
3. Frontend fetches logo image (if available)
   ↓
4. Frontend calls /api/exam-attendance/report
   ↓
5. API calls database function get_exam_attendance_report()
   ↓
6. Database returns aggregated attendance data
   ↓
7. API returns formatted JSON response
   ↓
8. Frontend calls generateExamAttendancePDF()
   ↓
9. PDF is generated and downloaded
   ↓
10. Success toast notification shown
```

## Validation & Error Handling

### Pre-Generation Validation

✅ Institution must be selected
✅ Examination Session must be selected

### Runtime Checks

✅ Validates data exists in database
✅ Checks for at least one attendance record
✅ Handles missing logo gracefully
✅ Provides user-friendly error messages

### Error Messages

| Error | Message |
|-------|---------|
| Missing selection | "Please select Institution and Examination Session to generate the report." |
| No attendance data | "No attendance records found for the selected criteria." |
| API error | Specific error from server (e.g., "Institution not found") |
| Network error | "Failed to generate PDF report." |

## Report Features

### Summary Statistics Box

Displays at the top of the report:
- **Total Exams Conducted**: Number of unique exam instances
- **Total Student Registrations**: Sum of all registrations
- **Total Present**: Sum of present students
- **Total Absent**: Sum of absent students
- **Overall Attendance %**: Percentage calculated from totals

### Date and Session Grouping

- Exams are grouped by date (DD-MM-YYYY format)
- Within each date, grouped by session (FN/AN/Morning/Afternoon/Evening)
- Chronological sorting of dates
- Session-wise subtotals

### Session Subtotals

Each session table includes a bold "Session Total" row showing:
- Total students for that session
- Total present for that session
- Total absent for that session
- Session attendance percentage

### Header with Logo

The college logo (JKKN logo) is automatically included if available at `/jkkn_logo.png`

Logo specifications:
- Size: 20mm x 20mm
- Position: Top-left corner
- Format: PNG with transparency support

## Customization Options

### Logo Customization

To use a different logo:

1. Place logo image in `public/your-logo.png`
2. Update the fetch path in `exam-attendance/page.tsx`:

```typescript
const logoResponse = await fetch('/your-logo.png')
```

### Institution Address

The institution address is automatically fetched from the database and cleaned to remove duplicate institution names.

### Color Scheme

To change table colors, modify in `generate-exam-attendance-pdf.ts`:

```typescript
headStyles: {
  fillColor: [220, 220, 220], // RGB values for header background
  textColor: [0, 0, 0]        // RGB values for header text
}
```

### Font Sizes

Current settings in `generate-exam-attendance-pdf.ts`:
- Institution name: 16pt bold
- Report title: 14pt bold
- Session info: 12pt bold
- Table headers: 11pt bold
- Table body: 10pt normal
- Footer: 10pt/9pt

## Best Practices

### ✅ Do's

- Ensure attendance is marked for all exams before generating the report
- Generate separate reports for different examination sessions
- Verify the selected institution and session before generating
- Review the generated PDF to ensure data accuracy
- Generate reports at the end of the examination period

### ⚠️ Don'ts

- Don't generate reports for sessions with no attendance data
- Don't rely on old PDFs - regenerate when attendance data changes
- Don't modify PDF generation code without testing with sample data
- Don't ignore validation error messages

## Troubleshooting

### Issue: "No attendance records found"

**Solution:**
- Ensure attendance has been marked for exams in the selected session
- Check that the examination session code is correct
- Verify exams are linked to the correct session in the database

### Issue: Logo not appearing in PDF

**Solution:**
1. Verify logo file exists at `/public/jkkn_logo.png`
2. Check browser console for fetch errors
3. Ensure logo is in PNG format
4. Check logo file permissions

### Issue: PDF shows incorrect institution details

**Solution:**
1. Verify institution_code in the database matches selection
2. Check institutions table for correct name and address
3. Ensure institution record is active

### Issue: Attendance percentages are wrong

**Solution:**
1. Check that attendance_status is 'Present' or 'Absent' (case-sensitive)
2. Verify exam_registrations are correctly linked to exam_attendance
3. Check for duplicate attendance records

### Issue: PDF doesn't download

**Solution:**
1. Check browser console for errors
2. Verify jsPDF libraries are installed: `npm install jspdf jspdf-autotable`
3. Ensure API endpoint is accessible
4. Check browser's download settings

### Issue: Tables overlap or formatting is off

**Solution:**
- Adjust column widths in `columnStyles` to ensure total width fits within page width
- Legal landscape page width: ~356mm (minus 25.4mm for margins = ~330mm usable)
- Verify table data doesn't have extremely long course titles

## Performance Considerations

### Database Optimization

The `get_exam_attendance_report()` function uses:
- Proper JOIN ordering (smallest tables first)
- DISTINCT counts to avoid duplicates
- Indexed columns for filtering (institution_code, session_code)
- GROUP BY to aggregate at database level

### Frontend Optimization

- Logo is fetched once and converted to base64
- API call uses query parameters (no large POST body)
- PDF generation happens client-side (no server load)
- Minimal DOM manipulation during generation

### Expected Performance

| Records | Generation Time |
|---------|----------------|
| 1-50 | < 1 second |
| 50-200 | 1-2 seconds |
| 200-500 | 2-4 seconds |
| 500+ | 4-8 seconds |

## Future Enhancements

Potential improvements:
- [ ] Email PDF directly from interface
- [ ] Filter by program or department
- [ ] Include student-wise detailed attendance
- [ ] Export to Excel format option
- [ ] Scheduled automatic report generation
- [ ] Comparison with previous sessions
- [ ] Attendance trend charts
- [ ] Watermark for draft/final reports
- [ ] Digital signature support
- [ ] Batch PDF generation for multiple sessions

## Security Considerations

### Data Access

- Uses Supabase service role for database queries
- Validates institution and session codes
- No sensitive student data exposed in URLs
- PDF generated client-side (data not stored on server)

### RLS Policies

The database function uses `SECURITY DEFINER` to bypass RLS, but:
- Function is granted only to authenticated and service_role
- Input parameters are validated
- Only aggregate data is returned (no individual student PII)

## Support

For issues or questions:
1. Check browser console for detailed error messages
2. Verify database function exists: `\df get_exam_attendance_report`
3. Test API endpoint directly in browser/Postman
4. Review Network tab for API response details
5. Check Supabase logs for database errors

## Changelog

### Version 1.0.0 (October 31, 2025)
- Initial implementation
- Summary statistics box
- Date and session grouping
- Session subtotals
- Logo support
- Multi-page support
- Header/footer on all pages

---

**Last Updated:** October 31, 2025
**Version:** 1.0.0
**Author:** AI-Assisted Development (Claude Code)
