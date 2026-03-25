const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable() {
  console.log('Checking users table...\n');

  // Try to query the table
  const { data, error, count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  if (error) {
    if (error.message?.includes('relation "public.users" does not exist')) {
      console.log('❌ Users table does NOT exist');
      console.log('\nPlease create it by running the SQL in CREATE_USERS_TABLE_NOW.sql');
    } else if (error.code === '42P17') {
      console.log('⚠️  Users table EXISTS but has policy issues');
      console.log('Error:', error.message);
      console.log('\nThe table exists but RLS policies need to be fixed.');
    } else {
      console.log('❓ Unexpected error:', error);
    }
  } else {
    console.log('✅ Users table EXISTS!');
    console.log(`Found ${count || 0} users in the table`);

    if (data && data.length > 0) {
      console.log('\nSample users:');
      data.forEach(user => {
        console.log(`  - ${user.email} (${user.role})`);
      });
    }
  }
}

checkTable().catch(console.error);