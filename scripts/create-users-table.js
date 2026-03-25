const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createUsersTable() {
  console.log('Creating users table...');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'lib', 'setup-users-table-fixed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    }).single();

    if (error) {
      // If exec_sql doesn't exist, try direct query approach
      console.log('Trying alternative approach...');

      // Split SQL into individual statements
      const statements = sql.split(';').filter(s => s.trim());

      for (const statement of statements) {
        if (statement.trim()) {
          const { error: stmtError } = await supabase.from('_dummy').select('*').limit(0);
          // This is a workaround - we need the Supabase dashboard or migration approach
          console.log('Statement would execute:', statement.substring(0, 50) + '...');
        }
      }

      console.log('\n⚠️  Note: Direct SQL execution requires Supabase Dashboard access.');
      console.log('Please run the SQL from lib/setup-users-table-fixed.sql in:');
      console.log('1. Supabase Dashboard > SQL Editor');
      console.log('2. Or use Supabase CLI migrations');
      console.log('\nSQL file location: lib/setup-users-table-fixed.sql');
    } else {
      console.log('✅ Users table created successfully!');
    }

    // Check if table exists
    const { data: tableCheck, error: checkError } = await supabase
      .from('users')
      .select('*')
      .limit(0);

    if (!checkError) {
      console.log('✅ Users table verified - it exists!');

      // Insert sample admin user
      const { data: adminUser, error: insertError } = await supabase
        .from('users')
        .upsert([
          {
            email: 'admin@jkkn.ac.in',
            full_name: 'System Administrator',
            role: 'admin',
            is_super_admin: true,
            is_active: true,
            is_verified: true,
            institution_id: '1'
          }
        ], { onConflict: 'email' });

      if (!insertError) {
        console.log('✅ Sample admin user created/updated!');
      } else {
        console.log('ℹ️  Admin user may already exist:', insertError.message);
      }
    } else {
      console.log('❌ Users table does not exist yet:', checkError.message);
      console.log('\nPlease create it using one of the methods mentioned above.');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

createUsersTable();