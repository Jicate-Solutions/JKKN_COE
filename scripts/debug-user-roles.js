const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugUserRoles() {
  const email = 'viswanathan.s@jkkn.ac.in';

  console.log('='.repeat(70));
  console.log(`🔍 Debugging roles for: ${email}`);
  console.log('='.repeat(70));

  // 1. Get user data from users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, role, is_super_admin, permissions')
    .eq('email', email)
    .single();

  if (userError) {
    console.error('❌ Error fetching user:', userError);
    return;
  }

  console.log('\n📋 User Data:');
  console.log('  - ID:', user.id);
  console.log('  - Email:', user.email);
  console.log('  - Legacy role field:', user.role || 'null');
  console.log('  - is_super_admin:', user.is_super_admin || false);
  console.log('  - Permissions (cached):', Object.keys(user.permissions || {}).length, 'permissions');

  // 2. Get user_roles data
  const { data: userRoles, error: urError } = await supabase
    .from('user_roles')
    .select(`
      id,
      user_id,
      role_id,
      is_active,
      assigned_at,
      expires_at,
      roles (
        id,
        name,
        description,
        is_active
      )
    `)
    .eq('user_id', user.id);

  if (urError) {
    console.error('❌ Error fetching user_roles:', urError);
  } else {
    console.log('\n👥 User Roles (from user_roles table):');
    if (!userRoles || userRoles.length === 0) {
      console.log('  ⚠️  No roles found in user_roles table!');
    } else {
      userRoles.forEach((ur, index) => {
        console.log(`  Role #${index + 1}: ${ur.roles?.name || 'N/A'}`);
        console.log(`     - Role ID: ${ur.role_id}`);
        console.log(`     - Role Active: ${ur.roles?.is_active}`);
        console.log(`     - Assignment Active: ${ur.is_active}`);
        console.log(`     - Assigned: ${ur.assigned_at}`);
        console.log(`     - Expires: ${ur.expires_at || 'Never'}`);
        console.log('');
      });

      // Show active roles only
      const activeRoles = userRoles
        .filter(ur => ur.is_active && ur.roles?.is_active !== false)
        .filter(ur => !ur.expires_at || new Date(ur.expires_at) > new Date())
        .map(ur => ur.roles?.name)
        .filter(Boolean);

      console.log('  ✅ Active Roles:', activeRoles.join(', ') || 'None');
    }
  }

  // 3. Get role permissions
  if (userRoles && userRoles.length > 0) {
    const activeRoleIds = userRoles
      .filter(ur => ur.is_active && ur.roles?.is_active !== false)
      .map(ur => ur.role_id);

    if (activeRoleIds.length > 0) {
      const { data: rolePerms, error: rpError } = await supabase
        .from('role_permissions')
        .select(`
          role_id,
          permission_id,
          permissions (
            id,
            name,
            resource,
            action,
            is_active
          )
        `)
        .in('role_id', activeRoleIds);

      if (!rpError && rolePerms) {
        console.log('\n🔐 Permissions (from RBAC):');
        const permissionNames = rolePerms
          .filter(rp => rp.permissions?.is_active !== false)
          .map(rp => rp.permissions?.name)
          .filter(Boolean);

        console.log(`  Total: ${permissionNames.length} permissions`);
        console.log(`  List: ${permissionNames.slice(0, 10).join(', ')}${permissionNames.length > 10 ? '...' : ''}`);
      }
    }
  }

  // 4. Show sidebar menu access
  console.log('\n📱 Expected Sidebar Access (based on coe_office + user roles):');
  console.log('  ✅ Dashboard (roles: []) - Available to ALL');
  console.log('  ✅ Student (roles: []) - Available to ALL');
  console.log('  ✅ During-Exam (roles: ["super_admin", "coe", "deputy_coe", "coe_office"])');
  console.log('       └─ ✅ Exam Attendance (roles: ["super_admin", "coe", "deputy_coe", "coe_office"])');
  console.log('       └─ ❌ Attendance Correction (roles: ["super_admin", "coe", "deputy_coe"]) - RESTRICTED');
  console.log('  ✅ Reports (roles: []) - Available to ALL');
  console.log('\n  ❌ Admin - SHOULD NOT SEE (requires admin or super_admin)');
  console.log('  ❌ Master - SHOULD NOT SEE (requires super_admin)');
  console.log('  ❌ Courses - SHOULD NOT SEE (requires super_admin, coe, or deputy_coe)');
  console.log('  ❌ Exam Master - SHOULD NOT SEE (requires super_admin, coe, or deputy_coe)');
  console.log('  ❌ Pre-Exam - SHOULD NOT SEE (requires super_admin, coe, or deputy_coe)');
  console.log('  ❌ Post-Exam - SHOULD NOT SEE (requires super_admin, coe, or deputy_coe)');

  console.log('\n' + '='.repeat(70));
}

debugUserRoles().catch(console.error);
