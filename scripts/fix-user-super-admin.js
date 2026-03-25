const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixUserSuperAdmin() {
  const email = 'viswanathan.s@jkkn.ac.in';

  console.log('='.repeat(70));
  console.log(`🔧 Fixing super_admin flag for: ${email}`);
  console.log('='.repeat(70));

  // 1. Check current status
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, role, is_super_admin')
    .eq('email', email)
    .single();

  if (userError) {
    console.error('❌ Error fetching user:', userError);
    return;
  }

  console.log('\n📋 Current User Data:');
  console.log('  - Email:', user.email);
  console.log('  - Legacy role field:', user.role);
  console.log('  - is_super_admin:', user.is_super_admin);

  if (!user.is_super_admin) {
    console.log('\n✅ User is already NOT a super admin. No changes needed.');
    return;
  }

  // 2. Update user to remove super_admin status
  console.log('\n🔄 Updating user...');
  const { error: updateError } = await supabase
    .from('users')
    .update({
      is_super_admin: false,
      role: 'coe_office', // Update legacy role field to match primary role
      updated_at: new Date().toISOString()
    })
    .eq('email', email);

  if (updateError) {
    console.error('❌ Error updating user:', updateError);
    return;
  }

  console.log('✅ Successfully updated user!');

  // 3. Verify the update
  const { data: updatedUser, error: verifyError } = await supabase
    .from('users')
    .select('id, email, role, is_super_admin')
    .eq('email', email)
    .single();

  if (verifyError) {
    console.error('❌ Error verifying update:', verifyError);
    return;
  }

  console.log('\n📋 Updated User Data:');
  console.log('  - Email:', updatedUser.email);
  console.log('  - Legacy role field:', updatedUser.role);
  console.log('  - is_super_admin:', updatedUser.is_super_admin);

  console.log('\n🎯 Expected Sidebar Access (after fix):');
  console.log('  ✅ Dashboard');
  console.log('  ✅ Student');
  console.log('  ✅ During-Exam');
  console.log('       └─ ✅ Exam Attendance');
  console.log('       └─ ❌ Attendance Correction');
  console.log('  ✅ Reports');
  console.log('\n  ❌ Should NOT see: Admin, Master, Courses, Exam Master, Pre-Exam, Post-Exam');

  console.log('\n⚠️  NOTE: User needs to logout and login again for changes to take effect!');
  console.log('    OR wait 5 minutes for cache to expire.');

  console.log('\n' + '='.repeat(70));
}

fixUserSuperAdmin().catch(console.error);
