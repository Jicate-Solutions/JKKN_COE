# Test Scripts

This directory contains test scripts for various features of the JKKN COE application.

## Exam Attendance PDF Test Script

### Overview

The `test-exam-attendance-pdf.ts` script provides comprehensive testing for the Exam Attendance PDF Report generation feature.

### Running the Tests

#### Method 1: Browser Console (Recommended for Quick Testing)

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000/exam-attendance
   ```

3. Open the browser developer console (F12)

4. Copy and paste the test function calls:
   ```javascript
   // Run all tests
   window.testExamAttendancePDF.runAllTests()

   // Or run individual tests
   window.testExamAttendancePDF.testPDFGeneration()
   window.testExamAttendancePDF.testMinimalData()
   window.testExamAttendancePDF.testLargeDataset()
   ```

#### Method 2: Import in React Component

You can import and use the test functions in any React component:

```typescript
import { testPDFGeneration, runAllTests } from '@/scripts/test-exam-attendance-pdf'

// In your component
const handleTest = async () => {
  const results = await runAllTests()
  console.log(results)
}
```

### Test Cases

#### 1. Standard Data Test (`testPDFGeneration`)

Tests PDF generation with realistic sample data:
- Multiple exam dates (3 days)
- Multiple sessions per day (FN/AN)
- Various course types (Theory/Practical)
- Different attendance percentages
- Summary statistics calculation

**Expected Output:**
- ✅ PDF file downloaded
- 📊 13 attendance records processed
- 📄 Multi-page PDF with proper formatting

#### 2. Minimal Data Test (`testMinimalData`)

Tests PDF generation with minimal data (edge case):
- Single exam date
- Single session
- Single course
- Basic attendance data

**Expected Output:**
- ✅ PDF file downloaded
- 📊 1 attendance record processed
- 📄 Single-page PDF

#### 3. Large Dataset Test (`testLargeDataset`)

Tests PDF generation performance with 100 records:
- 10 exam dates
- Multiple sessions
- 100 different courses
- Performance timing measurement

**Expected Output:**
- ✅ PDF file downloaded
- 📊 100 attendance records processed
- ⏱️ Generation time displayed
- 📄 Multi-page PDF

### Test Results

The test suite provides detailed console output:

```
==================================================
EXAM ATTENDANCE PDF - TEST SUITE
==================================================

=== Testing Exam Attendance PDF Generation ===
✅ Logo loaded successfully
✅ PDF generated successfully: Exam_Attendance_Report_JKKNCAS-NOV-DEC-2025_2025-10-31.pdf
=== Test Complete ===

=== Testing with Minimal Data ===
✅ Minimal data test passed: Exam_Attendance_Report_TEST-2025_2025-10-31.pdf

=== Testing with Large Dataset ===
✅ Large dataset test passed: Exam_Attendance_Report_TEST-LARGE-2025_2025-10-31.pdf
⏱️ Generation time: 2345.67ms
📊 Records processed: 100

==================================================
TEST RESULTS SUMMARY
==================================================
Standard Data: ✅ PASS
Minimal Data: ✅ PASS
Large Dataset: ✅ PASS
==================================================
```

### Troubleshooting Test Failures

#### Logo Loading Issues

If you see `⚠️ Logo not found`:
- Ensure `public/jkkn_logo.png` exists
- Check file permissions
- Verify file format is PNG

**Solution:** Tests will proceed without logo - PDF will still generate

#### PDF Generation Failures

Common errors and solutions:

**Error:** `jsPDF is not defined`
```bash
# Install dependencies
npm install jspdf jspdf-autotable
```

**Error:** `Cannot find module '@/lib/utils/generate-exam-attendance-pdf'`
```bash
# Ensure file exists
ls lib/utils/generate-exam-attendance-pdf.ts

# Restart dev server
npm run dev
```

**Error:** `Performance test is slow (> 5 seconds)`
- Normal for 100+ records
- Check browser performance
- Close other tabs/applications

### Modifying Test Data

You can customize the sample data in `test-exam-attendance-pdf.ts`:

```typescript
const customData = {
  institutionName: "Your Institution",
  institutionCode: "YOUR_CODE",
  sessionCode: "YOUR_SESSION",
  records: [
    {
      exam_date: "01-12-2025",
      exam_session: "FN",
      course_code: "COURSE101",
      course_name: "Your Course Name",
      course_category: "Theory",
      total_students: 50,
      present_count: 48,
      absent_count: 2,
      attendance_percentage: 96.00
    }
    // Add more records...
  ]
}

generateExamAttendancePDF(customData)
```

### Integration Testing

To test the full integration with the API:

1. Ensure database is running:
   ```bash
   npx supabase status
   ```

2. Run the migration for the database function:
   ```bash
   npx supabase db push
   ```

3. Navigate to the Exam Attendance page in your browser

4. Select an Institution and Examination Session

5. Click "Generate PDF Report" button

6. Verify PDF downloads with correct data

### Performance Benchmarks

Expected generation times (on average hardware):

| Records | Expected Time | Status |
|---------|---------------|--------|
| 1-10 | < 500ms | ✅ Excellent |
| 11-50 | 500ms - 1s | ✅ Good |
| 51-100 | 1s - 3s | ✅ Acceptable |
| 101-200 | 3s - 6s | ⚠️ Slow |
| 200+ | 6s+ | ❌ Very Slow |

If performance is slower than expected:
- Check browser performance
- Close other applications
- Clear browser cache
- Update browser to latest version

### Automated Testing

To run tests in CI/CD pipeline:

```bash
# Install dependencies
npm install

# Run type checking
npm run type-check

# Run linting
npm run lint

# Note: PDF generation tests require browser environment
# Use Puppeteer or Playwright for headless testing
```

### Contributing

When adding new PDF features:
1. Update test data in `test-exam-attendance-pdf.ts`
2. Add new test cases for edge cases
3. Update documentation
4. Run all tests to ensure no regressions

---

**Last Updated:** October 31, 2025
**Maintained By:** Development Team
