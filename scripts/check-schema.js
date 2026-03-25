const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function checkSchema() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  console.log('📋 Checking Roles Table Schema...\n')
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('*')
    .limit(1)
  
  if (!rolesError && roles && roles.length > 0) {
    console.log('Roles table columns:', Object.keys(roles[0]))
    console.log('Sample data:', roles[0])
  } else {
    console.log('Roles error:', rolesError?.message)
  }

  console.log('\n📋 Checking Permissions Table Schema...\n')
  const { data: permissions, error: permissionsError } = await supabase
    .from('permissions')
    .select('*')
    .limit(1)
  
  if (!permissionsError && permissions && permissions.length > 0) {
    console.log('Permissions table columns:', Object.keys(permissions[0]))
    console.log('Sample data:', permissions[0])
  } else {
    console.log('Permissions error:', permissionsError?.message)
  }
}

checkSchema()
