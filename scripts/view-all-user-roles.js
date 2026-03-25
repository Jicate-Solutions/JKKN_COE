const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function viewAllUserRoles() {
  console.log('='.repeat(80));
  console.log('👥 ALL USERS AND THEIR ROLES (from user_roles table)');
  console.log('='.repeat(80));

  // 1. Get all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_super_admin, is_active')
    .order('email', { ascending: true });

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  console.log(`\n📊 Total Users: ${users.length}`);
  console.log('='.repeat(80));

  // 2. For each user, get their roles from user_roles table
  for (const user of users) {
    const statusIcon = user.is_active ? '✅' : '❌';
    const superAdminBadge = user.is_super_admin ? ' 👑 [SUPER ADMIN]' : '';

    console.log(`\n${statusIcon} ${user.email}${superAdminBadge}`);
    console.log(`   Name: ${user.full_name || 'N/A'}`);
    console.log(`   Legacy Role: ${user.role || 'N/A'}`);
    console.log(`   Active: ${user.is_active}`);

    // Get roles from user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        id,
        role_id,
        is_active,
        assigned_at,
        assigned_by,
        expires_at,
        roles (
          name,
          description,
          is_active
        )
      `)
      .eq('user_id', user.id);

    if (rolesError) {
      console.log('   ⚠️  Error fetching roles:', rolesError.message);
    } else if (!userRoles || userRoles.length === 0) {
      console.log('   ⚠️  No roles assigned in user_roles table');
    } else {
      console.log('   Roles from user_roles table:');
      userRoles.forEach((ur, index) => {
        const activeIcon = ur.is_active && ur.roles?.is_active !== false ? '✅' : '❌';
        const expiryInfo = ur.expires_at
          ? new Date(ur.expires_at) > new Date()
            ? `(expires: ${new Date(ur.expires_at).toLocaleDateString()})`
            : '(EXPIRED)'
          : '(no expiry)';

        console.log(`     ${index + 1}. ${activeIcon} ${ur.roles?.name || 'Unknown'} ${expiryInfo}`);
        if (ur.roles?.description) {
          console.log(`        └─ ${ur.roles.description}`);
        }
      });

      // Show only active roles
      const activeRoles = userRoles
        .filter(ur => ur.is_active && ur.roles?.is_active !== false)
        .filter(ur => !ur.expires_at || new Date(ur.expires_at) > new Date())
        .map(ur => ur.roles?.name)
        .filter(Boolean);

      if (activeRoles.length > 0) {
        console.log(`   🎯 Active Roles: ${activeRoles.join(', ')}`);
      } else {
        console.log('   ⚠️  No active roles');
      }
    }

    console.log('   ' + '-'.repeat(76));
  }

  // 3. Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📈 SUMMARY STATISTICS');
  console.log('='.repeat(80));

  const activeUsers = users.filter(u => u.is_active).length;
  const inactiveUsers = users.filter(u => !u.is_active).length;
  const superAdmins = users.filter(u => u.is_super_admin).length;

  console.log(`Total Users: ${users.length}`);
  console.log(`  ✅ Active: ${activeUsers}`);
  console.log(`  ❌ Inactive: ${inactiveUsers}`);
  console.log(`  👑 Super Admins: ${superAdmins}`);

  // Get role distribution from user_roles table
  const { data: allUserRoles } = await supabase
    .from('user_roles')
    .select(`
      roles (name)
    `)
    .eq('is_active', true);

  if (allUserRoles) {
    console.log('\n📊 Role Distribution (from user_roles table):');
    const roleCount = {};
    allUserRoles.forEach(ur => {
      const roleName = ur.roles?.name;
      if (roleName) {
        roleCount[roleName] = (roleCount[roleName] || 0) + 1;
      }
    });

    Object.entries(roleCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([role, count]) => {
        console.log(`  - ${role}: ${count} user(s)`);
      });
  }

  console.log('\n' + '='.repeat(80));
}

viewAllUserRoles().catch(console.error);
