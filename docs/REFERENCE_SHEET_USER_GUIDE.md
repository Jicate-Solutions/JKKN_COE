# Master Data Reference Sheet - User Guide

**Quick Reference for Course & Course Mapping Data Entry**

---

## 🎯 What is the Reference Sheet?

The **Master Data Reference Sheet** is a dynamic Excel file that contains:
- ✅ All valid dropdown values for course creation
- ✅ Upload templates for bulk data import
- ✅ Complete validation rules
- ✅ Step-by-step instructions
- ✅ Common error solutions

---

## 📥 How to Download

### Option 1: From Courses Page
1. Navigate to **Courses** page
2. Click the blue **"Reference"** button in the action bar
3. Excel file downloads automatically

### Option 2: From Course Mapping Page
1. Navigate to **Course Mapping** page
2. Click the blue **"Reference"** button in the action bar
3. Excel file downloads automatically

**File Name:** `Course_Master_Data_Reference_YYYY-MM-DD.xlsx`

---

## 📊 What's Inside the File?

### Sheet 1: Master Data Reference ⭐

**This is your main reference sheet!**

Contains 11 columns with all valid values:

| Column | What It Shows | Example |
|--------|--------------|---------|
| Institution Code* | All institution codes in database | JKKN, ABC, XYZ |
| Regulation Code* | All regulation codes in database | REG2023, REG2024 |
| Offering Department Code | All department codes with names | CSE - Computer Science |
| Course Category* | Valid course categories | Theory, Practical, Project |
| Course Type | Valid course types | Core, Elective, etc. |
| Part | Course parts | Part I, Part II, Part III |
| E-Code Name | Language options | Tamil, English, French |
| Evaluation Type* | Evaluation methods | CA, ESE, CA + ESE |
| Result Type* | Result formats | Mark, Status |
| Batch Code* | All batch codes with names | 2024 - Batch 2024 |
| Semester Code | All semester codes with names | S1 - Semester 1 |

**Fields marked with * are required**

### Sheet 2: Course Upload Template

- Pre-formatted template for bulk course uploads
- 31 columns (all course fields)
- 100 empty rows ready for data entry
- Use values from Master Data Reference sheet

### Sheet 3: Mapping Upload Template

- Pre-formatted template for bulk mapping uploads
- 11 columns (all mapping fields)
- Sample row with example data
- 99 empty rows ready for data entry

### Sheet 4: Instructions

- Complete usage guide
- Validation rules explained
- Common errors and solutions
- Tips for successful uploads

### Sheet 5: Validation Summary

- Field-by-field reference table
- Shows which fields are required
- Data types and validation rules
- Example values for each field

---

## ✅ How to Use for Data Entry

### Scenario 1: Creating a Single Course

1. Open the Reference Sheet
2. Go to **Master Data Reference** sheet
3. Look up valid values for each dropdown field:
   - Institution Code from Column A
   - Regulation Code from Column B
   - Course Category from Column D
   - Evaluation Type from Column H
   - Result Type from Column I
4. Use these values when filling the course form in the application

### Scenario 2: Bulk Course Upload

1. Open the Reference Sheet
2. Go to **Course Upload Template** sheet
3. Fill in data for multiple courses:
   - Copy Institution Code from Master Data Reference (Column A)
   - Copy Regulation Code from Master Data Reference (Column B)
   - Copy other dropdown values from respective columns
4. Fill in other fields (Course Code, Course Name, etc.)
5. Save the file
6. Go to Courses page → Click **Import** → Select saved file

### Scenario 3: Bulk Course Mapping Upload

1. Open the Reference Sheet
2. Go to **Mapping Upload Template** sheet
3. Fill in data for multiple mappings:
   - Get Course ID from courses table (UUID)
   - Copy Batch Code from Master Data Reference (Column J)
   - Copy Semester Code from Master Data Reference (Column K)
4. Fill in marks configuration
5. Save the file
6. Go to Course Mapping page → Click **Upload** → Select saved file

---

## 💡 Pro Tips

### ✨ Copy-Paste Made Easy
1. Open Reference Sheet in one window
2. Open Upload Template in another window
3. Copy values directly from Master Data Reference columns
4. Paste into template rows
5. No typing errors!

### ✨ Find Your Values Quickly
- Use **Ctrl+F** (Find) to search for values
- Sort columns A-Z for easier browsing
- Filter columns to see specific values only

### ✨ Boolean Fields
- Use **TRUE** or **FALSE** (uppercase)
- For Yes/No questions in forms
- Examples: Split Credit, Online Course, Status

### ✨ Required Fields
- Look for asterisk (*) in column headers
- These must be filled in
- Templates will fail if left empty

---

## ⚠️ Common Mistakes to Avoid

### ❌ Using Invalid Values
**Wrong:** Institution Code = "My College"  
**Right:** Institution Code = "JKKN" (from Reference Sheet)

### ❌ Typos in Codes
**Wrong:** Regulation Code = "Reg2023" (lowercase 'g')  
**Right:** Regulation Code = "REG2023" (from Reference Sheet)

### ❌ Wrong Boolean Format
**Wrong:** Split Credit = "Yes"  
**Right:** Split Credit = "TRUE"

### ❌ Missing Required Fields
**Wrong:** Leaving Course Category empty  
**Right:** Course Category = "Theory" (from Reference Sheet)

### ❌ Invalid Numbers
**Wrong:** Credit = "Four"  
**Right:** Credit = 4

---

## 🔍 Quick Validation Check

Before uploading, verify:
- [ ] All required fields (*) are filled
- [ ] Institution Code exists in Column A of Reference
- [ ] Regulation Code exists in Column B of Reference
- [ ] Course Category is from Column D dropdown list
- [ ] Evaluation Type is from Column H dropdown list
- [ ] Result Type is from Column I dropdown list
- [ ] Boolean fields use TRUE/FALSE (uppercase)
- [ ] Numeric fields contain numbers only

---

## 🆘 Troubleshooting

### Error: "Institution with code XXX not found"
**Solution:** 
1. Open Reference Sheet
2. Check Column A (Institution Code*)
3. Use exact code from list (case-sensitive)

### Error: "Invalid course code format"
**Solution:**
- Use only letters, numbers, hyphens, underscores
- Example: CS101, MAT-201, PHY_301

### Error: "Course category required"
**Solution:**
1. Open Reference Sheet
2. Check Column D (Course Category*)
3. Select from: Theory, Practical, Project, etc.

### Error: "Pass mark cannot exceed max mark"
**Solution:**
- Ensure Internal Pass Mark ≤ Internal Max Mark
- Ensure External Pass Mark ≤ External Max Mark
- Ensure Total Pass Mark ≤ Total Max Mark

---

## 📞 Need Help?

If you encounter issues not covered in this guide:
1. Check the **Instructions** sheet in the Reference file
2. Review the **Validation Summary** sheet for field requirements
3. Contact your system administrator
4. Refer to the main documentation: `COURSE_MASTER_DATA_REFERENCE.md`

---

## 🔄 Keeping Your Reference Updated

**Important:** Always download a fresh copy before bulk uploads!

The Reference Sheet is generated **dynamically** from the database, so:
- ✅ New institution codes appear automatically
- ✅ New regulation codes appear automatically
- ✅ New departments appear automatically
- ✅ New batches appear automatically
- ✅ New semesters appear automatically

**Recommendation:** Download weekly if doing regular data entry.

---

## 📋 Checklist for Successful Upload

### Before Starting:
- [ ] Downloaded latest Reference Sheet (today's date)
- [ ] Opened Reference Sheet in Excel/Google Sheets
- [ ] Identified which template to use (Course or Mapping)

### During Data Entry:
- [ ] Copying values from Master Data Reference columns
- [ ] Not typing values manually (reduces errors)
- [ ] Using TRUE/FALSE for boolean fields
- [ ] Using numbers for numeric fields
- [ ] Filling all required fields (marked with *)

### Before Upload:
- [ ] Saved template file as .xlsx format
- [ ] Verified no empty required fields
- [ ] Verified all dropdown values are from reference
- [ ] Double-checked foreign key values (codes)

### After Upload:
- [ ] Checked success message count
- [ ] Reviewed any error messages
- [ ] Fixed errors and re-uploaded failed rows

---

## 🎓 Example Walkthrough

**Task:** Add 10 new courses for CSE department, REG2023 regulation

### Step 1: Download Reference
1. Go to Courses page
2. Click "Reference" button
3. File downloads: `Course_Master_Data_Reference_2025-10-08.xlsx`

### Step 2: Open Reference
1. Open downloaded file
2. Go to **Master Data Reference** sheet
3. Note values:
   - Institution Code: "JKKN" (Column A, Row 2)
   - Regulation Code: "REG2023" (Column B, Row 3)
   - Department Code: "CSE - Computer Science" (Column C, Row 4)

### Step 3: Fill Template
1. Go to **Course Upload Template** sheet
2. Fill Row 2 (first course):
   - Institution Code*: JKKN
   - Regulation Code*: REG2023
   - Offering Department Code: CSE
   - Course Code*: CS101
   - Course Name*: Data Structures
   - Display Code*: CS101
   - Course Category*: Theory
   - Course Type: Core
   - Credit: 4
   - QP Code*: CS101
   - Evaluation Type*: CA + ESE
   - Result Type*: Mark
   - Status: TRUE
3. Repeat for 9 more courses (Rows 3-11)

### Step 4: Save & Upload
1. Save file as `my_courses.xlsx`
2. Go to Courses page
3. Click "Import" button
4. Select `my_courses.xlsx`
5. Wait for upload to complete

### Step 5: Verify
1. Check toast notification: "✅ 10 courses uploaded successfully"
2. If errors: review error dialog, fix in Excel, re-upload failed rows

---

**Happy Data Entry! 🎉**

---

**Document Version:** 1.0  
**Last Updated:** October 8, 2025

