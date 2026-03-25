require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Missing Supabase environment variables')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
})

async function applyMigration() {
	console.log('🚀 Starting RBAC Migration...\n')

	try {
		console.log('📝 Step 1: Checking if user_roles table exists...')

		// Try to query the table to see if it exists
		const { data: existingData, error: checkError } = await supabase
			.from('user_roles')
			.select('id')
			.limit(1)

		if (!checkError) {
			console.log('✅ user_roles table already exists!')
			console.log('   Skipping table creation...\n')
		} else if (checkError.message.includes('Could not find the table')) {
			console.log('❌ user_roles table does NOT exist')
			console.log('\n⚠️  MANUAL MIGRATION REQUIRED')
			console.log('\nPlease execute the following SQL in your Supabase SQL Editor:')
			console.log('━'.repeat(80))
			console.log(`
-- 1. Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON public.user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON public.user_roles(expires_at);

-- 3. Create trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger
DROP TRIGGER IF EXISTS user_roles_updated_at ON public.user_roles;
CREATE TRIGGER user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
			`)
			console.log('━'.repeat(80))
			console.log('\n📍 Steps:')
			console.log('1. Go to: https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh/sql/new')
			console.log('2. Copy the SQL above')
			console.log('3. Paste into SQL Editor')
			console.log('4. Click "Run" button')
			console.log('5. Run this script again after successful execution\n')
			process.exit(0)
		} else {
			throw new Error(`Unexpected error checking table: ${checkError.message}`)
		}

		// Migrate existing data
		console.log('📝 Step 3: Migrating existing user roles...')

		// Get all users with roles
		const { data: users, error: usersError } = await supabase
			.from('users')
			.select('id, email, role')
			.not('role', 'is', null)

		if (usersError) {
			throw new Error(`Failed to fetch users: ${usersError.message}`)
		}

		console.log(`   Found ${users.length} users with roles`)

		let migratedCount = 0
		let skippedCount = 0

		for (const user of users) {
			// Get the role ID
			const { data: role, error: roleError } = await supabase
				.from('roles')
				.select('id, name')
				.eq('name', user.role)
				.single()

			if (roleError || !role) {
				console.log(`   ⚠️  Skipping user ${user.email}: role "${user.role}" not found in roles table`)
				skippedCount++
				continue
			}

			// Insert into user_roles
			const { error: insertError } = await supabase
				.from('user_roles')
				.insert({
					user_id: user.id,
					role_id: role.id,
					is_active: true
				})
				.select()

			if (insertError) {
				if (insertError.code === '23505') {
					// Duplicate - already exists
					console.log(`   ℹ️  User ${user.email} already has role ${user.role}`)
				} else {
					console.log(`   ❌ Error for user ${user.email}: ${insertError.message}`)
				}
			} else {
				console.log(`   ✅ Migrated: ${user.email} → ${user.role}`)
				migratedCount++
			}
		}

		console.log(`\n✅ Data migration complete:`)
		console.log(`   - Migrated: ${migratedCount} users`)
		console.log(`   - Skipped: ${skippedCount} users\n`)

		// Verify the migration
		console.log('📝 Step 4: Verifying migration...')

		const { count, error: countError } = await supabase
			.from('user_roles')
			.select('*', { count: 'exact', head: true })

		if (countError) {
			throw new Error(`Failed to count user_roles: ${countError.message}`)
		}

		console.log(`✅ Verification complete: ${count} role assignments in user_roles table\n`)

		// Show sample data
		console.log('📊 Sample Data:')
		const { data: sampleData, error: sampleError } = await supabase
			.from('user_roles')
			.select(`
				user_id,
				role_id,
				is_active,
				assigned_at,
				users!inner(email),
				roles!inner(name)
			`)
			.limit(5)

		if (!sampleError && sampleData) {
			console.log('\nFirst 5 user-role assignments:')
			sampleData.forEach((item, index) => {
				console.log(`${index + 1}. ${item.users.email} → ${item.roles.name} (active: ${item.is_active})`)
			})
		}

		console.log('\n🎉 RBAC Migration completed successfully!')
		console.log('\n📋 Next Steps:')
		console.log('   1. Update dashboard API to use user_roles table')
		console.log('   2. Update auth context to support multiple roles')
		console.log('   3. Test the new RBAC system')

	} catch (error) {
		console.error('\n❌ Migration failed:', error.message)
		console.error('   Stack:', error.stack)
		process.exit(1)
	}
}

applyMigration()
