const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addUser() {
  console.log('\n📧 Enter your Google email address to add as admin:');

  rl.question('Email: ', async (email) => {
    if (!email || !email.includes('@')) {
      console.log('❌ Invalid email address');
      rl.close();
      return;
    }

    console.log(`\nAdding ${email} as admin user...`);

    try {
      const { data, error } = await supabase
        .from('users')
        .upsert({
          email: email.trim(),
          full_name: email.split('@')[0],
          username: email.trim(),
          role: 'admin',
          is_super_admin: true,
          is_active: true,
          is_verified: true,
          institution_id: '1'
        }, {
          onConflict: 'email',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.log('❌ Error adding user:', error.message);
        if (error.message.includes('recursion')) {
          console.log('\n⚠️  Policy issue detected. Please run FIX_POLICIES_NOW.sql first');
        }
      } else {
        console.log('✅ User added successfully!');
        console.log('\nYou can now login at http://localhost:3000/login');
      }
    } catch (err) {
      console.error('Error:', err);
    }

    rl.close();
  });
}

addUser();