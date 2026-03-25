# 🛠️ Supabase Database Scripts

Quick reference for all Supabase database utility scripts.

---

## 📋 Available Scripts

### 1. **Test Connection**
**Script**: `test-supabase-connection.js`

Tests the connection to Supabase and verifies database access.

```bash
node scripts/test-supabase-connection.js
```

**Output**:
- ✅ Environment variable check
- ✅ Database connectivity test
- ✅ Sample data from key tables
- ✅ Connection summary

---

### 2. **List All Tables**
**Script**: `list-tables.js`

Lists all accessible tables in the database with record counts.

```bash
node scripts/list-tables.js
```

**Output**:
```
📋 Fetching all tables from Supabase...

✅ Found 29 accessible tables:

════════════════════════════════════════════════════════════════════
TABLE NAME                        RECORDS    COLUMNS
════════════════════════════════════════════════════════════════════

📁 Authentication & Authorization
────────────────────────────────────────────────────────────────────
  permissions                             34          8
  role_permissions                        67          5
  roles                                   10          7
  user_roles                               9          9
  users                                    8         25

📁 Master Data
────────────────────────────────────────────────────────────────────
  institutions                             2         28
  departments                             26         12
  programs                                26         21
  courses                                304         54
  ...

📊 Summary:
   Total Tables: 29
   Total Records: 18,400
```

---

### 3. **Describe Table Schema**
**Script**: `describe-table.js`

Shows detailed schema information for a specific table.

```bash
node scripts/describe-table.js <table_name>
```

**Examples**:
```bash
# Describe institutions table
node scripts/describe-table.js institutions

# Describe students table
node scripts/describe-table.js students

# Describe courses table
node scripts/describe-table.js courses

# Describe exam registrations
node scripts/describe-table.js exam_registrations
```

**Output**:
```
📋 Describing table: institutions

════════════════════════════════════════════════════════════════════
TABLE: institutions
════════════════════════════════════════════════════════════════════
Records: 2
Columns: 28
════════════════════════════════════════════════════════════════════

📝 COLUMNS:

COLUMN NAME                       TYPE              SAMPLE VALUE
────────────────────────────────────────────────────────────────────
id                                string            5aae1d9d-f4c3-4fa9-...
institution_code                  string            JKKNCAS
name                              string            JKKN College of Arts...
email                             string            admin@jkkn.ac.in
...

📊 SAMPLE RECORD:
{
  "id": "5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4",
  "institution_code": "JKKNCAS",
  "name": "JKKN College of Arts and Science",
  ...
}
```

---

### 4. **Check Schema**
**Script**: `check-schema.js`

Checks the actual column names in roles and permissions tables.

```bash
node scripts/check-schema.js
```

**Output**:
- Roles table columns
- Permissions table columns
- Sample data from each

---

## 🎯 Common Use Cases

### View All Tables
```bash
node scripts/list-tables.js
```

### Explore a Specific Table
```bash
node scripts/describe-table.js <table_name>
```

### Verify Connection
```bash
node scripts/test-supabase-connection.js
```

### Check Table Exists
```bash
node scripts/describe-table.js <table_name>
# If table doesn't exist, you'll get an error
```

---

## 📊 All Available Tables

### Authentication & Authorization (6 tables)
- users
- roles
- permissions
- role_permissions
- user_roles
- verification_codes

### Master Data (11 tables)
- institutions
- departments
- programs
- degrees
- courses
- regulations
- semesters
- academic_years
- batches
- sections
- boards

### Exam Management (6 tables)
- exam_types
- examination_sessions
- exam_timetables
- exam_rooms
- exam_registrations
- exam_attendance

### Course Management (2 tables)
- course_mapping
- course_offering

### Grading (2 tables)
- grade_system
- grades

### Students (2 tables)
- students
- dummy_numbers

**Total**: 29 tables

---

## 🔍 Query Examples

### Using Scripts

```bash
# Check all tables
node scripts/list-tables.js

# Describe institutions
node scripts/describe-table.js institutions

# Describe students
node scripts/describe-table.js students

# Describe courses
node scripts/describe-table.js courses

# Describe exam registrations
node scripts/describe-table.js exam_registrations

# Describe roles
node scripts/describe-table.js roles

# Describe permissions
node scripts/describe-table.js permissions
```

---

## 💡 Tips

1. **List tables first** to see what's available:
   ```bash
   node scripts/list-tables.js
   ```

2. **Explore table schema** before querying:
   ```bash
   node scripts/describe-table.js <table_name>
   ```

3. **Test connection** if you have issues:
   ```bash
   node scripts/test-supabase-connection.js
   ```

4. **Use describe** to see:
   - Column names and types
   - Sample data
   - Record counts
   - Data structure

---

## 🚀 Quick Reference

| Task | Command |
|------|---------|
| Test connection | `node scripts/test-supabase-connection.js` |
| List all tables | `node scripts/list-tables.js` |
| Describe table | `node scripts/describe-table.js <table>` |
| Check schema | `node scripts/check-schema.js` |

---

## 📚 Documentation

- **Connection Guide**: [SUPABASE_CONNECTION_GUIDE.md](../SUPABASE_CONNECTION_GUIDE.md)
- **Tables List**: [SUPABASE_TABLES_LIST.md](../SUPABASE_TABLES_LIST.md)
- **Supabase Dashboard**: https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh

---

## 🔗 Related Files

- `.env.local` - Environment configuration
- `lib/supabase-server.ts` - Server-side Supabase client
- `scripts/test-supabase-connection.js` - Connection test
- `scripts/list-tables.js` - Table list
- `scripts/describe-table.js` - Table schema
- `scripts/check-schema.js` - Schema check

---

**Need help?** Check the [Supabase Connection Guide](../SUPABASE_CONNECTION_GUIDE.md) or run the test connection script.
