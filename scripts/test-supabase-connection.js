// Test Supabase Connection Script
// This script tests the connection to your Supabase instance

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase Connection...\n')

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('📋 Configuration:')
  console.log('  Supabase URL:', supabaseUrl || '❌ Missing')
  console.log('  Anon Key:', supabaseAnonKey ? '✅ Set' : '❌ Missing')
  console.log('  Service Role Key:', supabaseServiceKey ? '✅ Set' : '❌ Missing')
  console.log()

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing required environment variables!')
    process.exit(1)
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

  try {
    // Test 1: Check if we can query the database
    console.log('🧪 Test 1: Database Connection')
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (usersError) {
      console.log('  ⚠️  Users table:', usersError.message)
    } else {
      console.log('  ✅ Users table accessible')
    }

    // Test 2: Check institutions table
    console.log('\n🧪 Test 2: Institutions Table')
    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, institution_code, name')
      .limit(5)

    if (institutionsError) {
      console.log('  ❌ Error:', institutionsError.message)
    } else {
      console.log(`  ✅ Institutions table accessible (${institutions?.length || 0} records fetched)`)
      if (institutions && institutions.length > 0) {
        console.log('\n  📊 Sample Data:')
        institutions.forEach((inst, i) => {
          console.log(`    ${i + 1}. ${inst.institution_code} - ${inst.name}`)
        })
      }
    }

    // Test 3: Check roles table
    console.log('\n🧪 Test 3: Roles Table')
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, name, description')
      .limit(5)

    if (rolesError) {
      console.log('  ❌ Error:', rolesError.message)
    } else {
      console.log(`  ✅ Roles table accessible (${roles?.length || 0} records fetched)`)
      if (roles && roles.length > 0) {
        console.log('\n  📊 Sample Data:')
        roles.forEach((role, i) => {
          console.log(`    ${i + 1}. ${role.name} - ${role.description}`)
        })
      }
    }

    // Test 4: Check permissions table
    console.log('\n🧪 Test 4: Permissions Table')
    const { data: permissions, error: permissionsError } = await supabase
      .from('permissions')
      .select('id, name, resource, action')
      .limit(5)

    if (permissionsError) {
      console.log('  ❌ Error:', permissionsError.message)
    } else {
      console.log(`  ✅ Permissions table accessible (${permissions?.length || 0} records fetched)`)
      if (permissions && permissions.length > 0) {
        console.log('\n  📊 Sample Data:')
        permissions.forEach((perm, i) => {
          console.log(`    ${i + 1}. ${perm.name} (${perm.resource}:${perm.action})`)
        })
      }
    }

    // Test 5: Get all tables
    console.log('\n🧪 Test 5: Database Schema')
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name')

    if (tablesError) {
      console.log('  ⚠️  Could not fetch schema:', tablesError.message)
    } else if (tables) {
      console.log(`  ✅ Found ${tables.length} tables in public schema`)
      console.log('\n  📋 Tables:')
      const tableNames = tables.map(t => t.table_name).sort()
      const columns = 3
      for (let i = 0; i < tableNames.length; i += columns) {
        const row = tableNames.slice(i, i + columns)
        console.log('    ' + row.map(name => name.padEnd(30)).join(''))
      }
    }

    console.log('\n✅ Supabase connection test completed!')
    console.log('\n📌 Connection Details:')
    console.log('  Project URL:', supabaseUrl)
    console.log('  Project ID:', supabaseUrl.match(/https:\/\/([^.]+)/)?.[1])
    console.log('\n💡 You can now use Supabase in your application!')

  } catch (error) {
    console.error('\n❌ Connection test failed!')
    console.error('Error:', error.message)
    process.exit(1)
  }
}

// Run the test
testSupabaseConnection()
