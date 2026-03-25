const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Using key type:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service Role' : 'Anon');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabase() {
  console.log('\n1. Testing Users Table:');
  console.log('------------------------');

  try {
    // Count users
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting users:', countError);
    } else {
      console.log('Total users in database:', count);
    }

    // Fetch users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name, is_active, created_at')
      .limit(5);

    if (error) {
      console.error('Error fetching users:', error);
    } else {
      console.log('Sample users:', users);
    }

    // Check if table exists and permissions
    const { data: tableInfo, error: tableError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('\nTable access error:', tableError);
      if (tableError.message.includes('permission')) {
        console.log('This might be a Row Level Security (RLS) issue.');
      }
    } else {
      console.log('\nTable is accessible');
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }

  console.log('\n2. Testing with different approach:');
  console.log('------------------------------------');

  // Test with raw query
  try {
    const { data, error } = await supabase.rpc('get_user_count');
    if (error && error.message.includes('not exist')) {
      console.log('RPC function not found, trying direct query...');

      // Just try simple select
      const { data: simpleData, error: simpleError } = await supabase
        .from('users')
        .select('*');

      if (simpleError) {
        console.error('Simple select error:', simpleError);
      } else {
        console.log('Direct query result count:', simpleData?.length || 0);
        if (simpleData && simpleData.length > 0) {
          console.log('First user:', simpleData[0]);
        }
      }
    }
  } catch (err) {
    console.error('RPC error:', err);
  }
}

testDatabase();