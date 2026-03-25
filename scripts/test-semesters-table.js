// Test script to check if semesters table exists and create it if needed
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSemestersTable() {
  console.log('Testing semesters table...')

  // Try to query the table
  const { data, error } = await supabase
    .from('semesters')
    .select('*')
    .limit(1)

  if (error) {
    console.error('❌ Error accessing semesters table:', error.message)
    console.error('Error details:', error)

    if (error.message.includes('relation "public.semesters" does not exist')) {
      console.log('\n⚠️  The semesters table does not exist in your database.')
      console.log('\n📝 To fix this, run the migration SQL in your Supabase dashboard:')
      console.log('   1. Go to https://supabase.com/dashboard')
      console.log('   2. Select your project')
      console.log('   3. Go to SQL Editor')
      console.log('   4. Run the SQL from: supabase/migrations/20250101_create_semesters_table.sql')
    }

    return false
  }

  console.log('✅ Semesters table exists!')
  console.log('Found', data?.length || 0, 'records')
  if (data && data.length > 0) {
    console.log('Sample record:', data[0])
  }

  return true
}

testSemestersTable()