// List All Tables from Supabase Database
// This script fetches and displays all tables in the public schema

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function listTables() {
  console.log('📋 Fetching all tables from Supabase...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  try {
    // Method 1: Query pg_catalog to get all tables
    const { data: tables, error } = await supabase.rpc('get_tables')

    if (error) {
      console.log('⚠️  RPC function not available, using alternative method...\n')

      // Method 2: Try to query known tables and check which exist
      const knownTables = [
        // Authentication & Authorization
        'users',
        'roles',
        'permissions',
        'role_permissions',
        'user_roles',
        'verification_codes',

        // Master Data
        'institutions',
        'departments',
        'programs',
        'degrees',
        'courses',
        'regulations',
        'semesters',
        'batches',
        'sections',
        'boards',
        'academic_years',

        // Exam Management
        'exam_types',
        'examination_sessions',
        'exam_timetables',
        'exam_rooms',
        'exam_registrations',
        'exam_attendance',

        // Course Management
        'course_mapping',
        'course_offering',

        // Grading
        'grade_system',
        'grades',

        // Students & Users
        'students',
        'dummy_numbers'
      ]

      console.log('🔍 Testing known tables...\n')
      const existingTables = []
      const tableDetails = []

      for (const tableName of knownTables) {
        try {
          const { count, error: countError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })

          if (!countError) {
            existingTables.push(tableName)

            // Get sample record to see columns
            const { data: sample } = await supabase
              .from(tableName)
              .select('*')
              .limit(1)

            const columns = sample && sample.length > 0 ? Object.keys(sample[0]) : []

            tableDetails.push({
              name: tableName,
              count: count || 0,
              columns: columns.length
            })
          }
        } catch (err) {
          // Table doesn't exist or not accessible
        }
      }

      if (existingTables.length === 0) {
        console.log('❌ No tables found or accessible')
        return
      }

      // Sort by table name
      tableDetails.sort((a, b) => a.name.localeCompare(b.name))

      // Display results
      console.log(`✅ Found ${existingTables.length} accessible tables:\n`)
      console.log('═'.repeat(80))
      console.log('TABLE NAME                        RECORDS    COLUMNS')
      console.log('═'.repeat(80))

      // Group by category
      const categories = {
        'Authentication & Authorization': ['users', 'roles', 'permissions', 'role_permissions', 'user_roles', 'verification_codes'],
        'Master Data': ['institutions', 'departments', 'programs', 'degrees', 'courses', 'regulations', 'semesters', 'batches', 'sections', 'boards', 'academic_years'],
        'Exam Management': ['exam_types', 'examination_sessions', 'exam_timetables', 'exam_rooms', 'exam_registrations', 'exam_attendance'],
        'Course Management': ['course_mapping', 'course_offering'],
        'Grading': ['grade_system', 'grades'],
        'Students': ['students', 'dummy_numbers']
      }

      for (const [category, categoryTables] of Object.entries(categories)) {
        const categoryItems = tableDetails.filter(t => categoryTables.includes(t.name))

        if (categoryItems.length > 0) {
          console.log(`\n📁 ${category}`)
          console.log('─'.repeat(80))

          categoryItems.forEach(table => {
            const name = table.name.padEnd(32)
            const count = String(table.count).padStart(9)
            const cols = String(table.columns).padStart(7)
            console.log(`  ${name} ${count}    ${cols}`)
          })
        }
      }

      console.log('\n' + '═'.repeat(80))
      console.log(`\n📊 Summary:`)
      console.log(`   Total Tables: ${existingTables.length}`)
      console.log(`   Total Records: ${tableDetails.reduce((sum, t) => sum + t.count, 0).toLocaleString()}`)
      console.log(`\n💡 To see detailed schema for a table:`)
      console.log(`   node scripts/describe-table.js <table_name>`)

    } else {
      // Display results from RPC
      console.log(`✅ Found ${tables.length} tables:\n`)
      tables.forEach((table, i) => {
        console.log(`${i + 1}. ${table.tablename}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

listTables()
