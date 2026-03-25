const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMyPermissions() {
  // Check for super_admin users
  console.log('='.repeat(80));
  console.log('🔍 CHECKING SUPER ADMIN PERMISSIONS');
  console.log('='.repeat(80));

  const { data: superAdmins, error } = await supabase
    .from('users')
    .select('id, email, full_name, is_super_admin, permissions, role')
    .eq('is_super_admin', true);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!superAdmins || superAdmins.length === 0) {
    console.log('⚠️  No super admin users found!');
    return;
  }

  console.log(`\nFound ${superAdmins.length} super admin(s):\n`);

  for (const user of superAdmins) {
    console.log(`👑 ${user.email} (${user.full_name || 'N/A'})`);
    console.log(`   Legacy role: ${user.role}`);
    console.log(`   Is Super Admin: ${user.is_super_admin}`);

    const perms = user.permissions || {};
    const permCount = Object.keys(perms).length;

    console.log(`   Permissions in JSONB: ${permCount} permissions`);

    if (permCount === 0) {
      console.log('   ⚠️  WARNING: No permissions in JSONB field!');
      console.log('   This will cause the sidebar to show NO links!');
      console.log('   Super admins need permissions in the JSONB field.');
    } else {
      console.log('   ✅ Permissions present:');
      const permList = Object.entries(perms)
        .filter(([_, val]) => val === true)
        .map(([key, _]) => key);

      permList.slice(0, 10).forEach(perm => {
        console.log(`      - ${perm}`);
      });

      if (permList.length > 10) {
        console.log(`      ... and ${permList.length - 10} more`);
      }
    }

    // Check user_roles table too
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select(`
        roles (name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (userRoles && userRoles.length > 0) {
      const roleNames = userRoles.map(ur => ur.roles?.name).filter(Boolean);
      console.log(`   Roles in user_roles table: ${roleNames.join(', ')}`);
    } else {
      console.log('   Roles in user_roles table: None');
    }

    console.log('\n' + '-'.repeat(78) + '\n');
  }

  console.log('='.repeat(80));
  console.log('💡 SOLUTION:');
  console.log('='.repeat(80));
  console.log('If permissions JSONB is empty, super admins need permissions added.');
  console.log('Run: node scripts/setup-super-admin-permissions.js');
  console.log('='.repeat(80));
}

checkMyPermissions().catch(console.error);
