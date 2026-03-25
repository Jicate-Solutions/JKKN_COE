const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupSuperAdminPermissions() {
  console.log('='.repeat(80));
  console.log('🔧 SETTING UP SUPER ADMIN PERMISSIONS');
  console.log('='.repeat(80));

  // 1. Get all active permissions from the permissions table
  const { data: allPermissions, error: permError } = await supabase
    .from('permissions')
    .select('name, resource, action, description')
    .eq('is_active', true);

  if (permError) {
    console.error('❌ Error fetching permissions:', permError);
    return;
  }

  console.log(`\n📋 Found ${allPermissions.length} active permissions in the system`);

  // 2. Build permissions JSONB object (all permissions set to true)
  const allPermsObject = {};
  allPermissions.forEach(perm => {
    allPermsObject[perm.name] = true;
  });

  console.log('✅ Built permissions object with', Object.keys(allPermsObject).length, 'permissions');

  // 3. Get all super_admin users
  const { data: superAdmins, error: adminError } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('is_super_admin', true);

  if (adminError) {
    console.error('❌ Error fetching super admins:', adminError);
    return;
  }

  if (!superAdmins || superAdmins.length === 0) {
    console.log('⚠️  No super admin users found!');
    return;
  }

  console.log(`\n👑 Found ${superAdmins.length} super admin(s)`);
  console.log('='.repeat(80));

  // 4. Update each super admin with all permissions
  for (const admin of superAdmins) {
    console.log(`\n🔄 Updating: ${admin.email} (${admin.full_name || 'N/A'})`);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        permissions: allPermsObject,
        updated_at: new Date().toISOString()
      })
      .eq('id', admin.id);

    if (updateError) {
      console.error('❌ Error updating:', updateError);
    } else {
      console.log('✅ Successfully updated with', Object.keys(allPermsObject).length, 'permissions');
    }
  }

  // 5. Verify the updates
  console.log('\n' + '='.repeat(80));
  console.log('✅ VERIFICATION');
  console.log('='.repeat(80));

  const { data: updatedAdmins, error: verifyError } = await supabase
    .from('users')
    .select('email, permissions')
    .eq('is_super_admin', true);

  if (verifyError) {
    console.error('❌ Error verifying:', verifyError);
  } else {
    updatedAdmins.forEach(admin => {
      const permCount = Object.keys(admin.permissions || {}).length;
      console.log(`✅ ${admin.email}: ${permCount} permissions`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎯 EXPECTED SIDEBAR ACCESS (Super Admin):');
  console.log('='.repeat(80));
  console.log('✅ Dashboard');
  console.log('✅ Admin (Users, Roles, Permissions, Role Permission)');
  console.log('✅ Master (Institutions, Degree, Department, Program, etc.)');
  console.log('✅ Courses (Courses, Course Mapping)');
  console.log('✅ Student (Student List, Student Promotion)');
  console.log('✅ Exam Master (Grades, Grade System)');
  console.log('✅ Pre-Exam (Exam Types, Sessions, Course Offer, etc.)');
  console.log('✅ During-Exam (Exam Attendance, Attendance Correction)');
  console.log('✅ Post-Exam (Dummy Number)');
  console.log('✅ Reports');
  console.log('\n⚠️  NOTE: Users need to LOGOUT and LOGIN again for changes to take effect!');
  console.log('    OR wait 5 minutes for cache to expire.');
  console.log('='.repeat(80));
}

setupSuperAdminPermissions().catch(console.error);
