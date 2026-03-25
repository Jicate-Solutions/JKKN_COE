# Verification Steps - Answer Sheet Packets Fix

## ✅ Migration Applied Successfully

The database migration has been applied and the views have been recreated with the `course_title` alias.

---

## Quick Verification Steps

### 1. Verify View Structure (SQL)

Run this query in Supabase SQL Editor to confirm the view has the correct columns:

```sql
-- Check if course_title column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'answer_sheet_packets_detail_view'
  AND column_name IN ('course_name', 'course_title', 'course_code')
ORDER BY column_name;
```

**Expected Result:**
```
column_name    | data_type
---------------|------------------
course_code    | character varying
course_name    | character varying
course_title   | character varying
```

---

### 2. Test Data Retrieval (SQL)

Query the view to ensure it returns data with course_title:

```sql
-- Fetch sample data from the view
SELECT
  packet_no,
  course_code,
  course_title,
  total_sheets,
  packet_status,
  institution_code
FROM answer_sheet_packets_detail_view
LIMIT 5;
```

**Expected**: Returns rows with all columns populated, including `course_title`

---

### 3. Test API Endpoint

Open your browser's DevTools (F12) and run this in the Console:

```javascript
// Test the API endpoint
fetch('/api/post-exam/answer-sheet-packets')
  .then(res => res.json())
  .then(data => {
    console.log('Total packets:', data.length);
    console.log('Sample packet:', data[0]);
    console.log('Has course_title?', data[0]?.course_title ? 'YES ✅' : 'NO ❌');
  })
  .catch(err => console.error('Error:', err));
```

**Expected Output:**
```
Total packets: X
Sample packet: { id: "...", packet_no: "1/5", course_title: "Tamil Literature", ... }
Has course_title? YES ✅
```

---

### 4. Test Frontend Display

#### Step 4.1: Navigate to the Page
1. Open: http://localhost:3000/post-exam/answer-sheet-packets
2. Wait for the page to load

#### Step 4.2: Check Existing Packets
- Look at the packets table
- Course column should show:
  - **Course Code** (e.g., "24UGTA01") - Bold text
  - **Course Title** (e.g., "Tamil Literature") - Gray text below

**Expected**: Both course code and course title are visible

#### Step 4.3: Generate New Packets
1. Select an **Institution**
2. Select an **Exam Session**
3. (Optional) Select a **Theory Course**
4. Click **"Generate Packets"**

**Expected**:
- ✅ Green success toast appears
- ✅ Shows packet count and student count per course
- ✅ Packets table automatically refreshes
- ✅ New packets appear with course titles

#### Step 4.4: Refresh the Page (Critical Test!)
1. Press **F5** or **Ctrl+R** to refresh
2. Wait for page to reload

**Expected**:
- ✅ All packets remain visible
- ✅ Course titles still display correctly
- ✅ No "undefined" or blank course titles

---

## 5. Automated Test Checklist

Run through these scenarios:

### Scenario A: Generate Packets for Single UG Course
- [ ] Institution: JKKN01
- [ ] Session: NOV2024
- [ ] Course: Select a UG Theory course
- [ ] Expected: 25 sheets per packet
- [ ] Verify packet_no format: "1/X", "2/X", etc.

### Scenario B: Generate Packets for All Theory Courses
- [ ] Institution: JKKN01
- [ ] Session: NOV2024
- [ ] Course: "All Theory Courses"
- [ ] Expected: Multiple courses processed
- [ ] Success toast shows per-course breakdown

### Scenario C: Page Refresh Persistence
- [ ] Generate packets
- [ ] Note total packet count
- [ ] Refresh browser (F5)
- [ ] Verify same packet count
- [ ] Verify course titles still visible

### Scenario D: Filter Functionality
- [ ] Use institution filter dropdown
- [ ] Table updates with filtered results
- [ ] Course titles remain visible
- [ ] Switch to different institution
- [ ] Verify filters work correctly

---

## 6. Troubleshooting

### If course_title is still undefined:

**Check 1: Clear Browser Cache**
```javascript
// Run in browser console
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

**Check 2: Verify Migration Was Applied**
```sql
-- Check view definition
SELECT pg_get_viewdef('answer_sheet_packets_detail_view', true);
-- Should include: c.course_name AS course_title
```

**Check 3: Check API Response**
```javascript
// In browser DevTools -> Network tab
// 1. Find the request to /api/post-exam/answer-sheet-packets
// 2. Click on it
// 3. Go to "Response" tab
// 4. Check if course_title exists in the response
```

**Check 4: Restart Development Server**
```bash
# Stop server (Ctrl+C in terminal)
# Restart
npm run dev
```

---

## 7. Success Criteria

The fix is confirmed successful when ALL of the following are true:

- ✅ SQL query returns `course_title` column
- ✅ API endpoint returns packets with `course_title` field
- ✅ Frontend displays course titles correctly
- ✅ Packets persist after page refresh
- ✅ Course titles remain visible after refresh
- ✅ New packet generation works correctly
- ✅ No console errors about undefined properties

---

## 8. Next Steps After Verification

Once verified, you can:

1. **Test with Real Data**: Generate packets for actual examination sessions
2. **Review Test Cases**: Go through [answer-sheet-packets-test-cases.md](./answer-sheet-packets-test-cases.md)
3. **Document Any Issues**: If you encounter problems, check the troubleshooting section
4. **Close the Task**: Mark the issue as resolved in your tracking system

---

## Summary

**Issue**: Packets disappeared after page refresh due to column name mismatch
**Root Cause**: View returned `course_name`, TypeScript expected `course_title`
**Solution**: Added `c.course_name AS course_title` alias in database views
**Status**: ✅ Fixed - Migration applied successfully

The packets are now properly persisted and will remain visible after page refresh!
