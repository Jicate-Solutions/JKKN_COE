require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error('Missing Supabase environment variables')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function queryUser() {
	try {
		// Query users table
		const { data: users, error } = await supabase
			.from('users')
			.select('id, email, role, is_super_admin, institution_id')
			.eq('email', 'viswanathan.s@jkkn.ac.in')
			.single()

		if (error) {
			console.error('Error querying users:', error)
			return
		}

		console.log('\n=== USER DATA ===')
		console.log(JSON.stringify(users, null, 2))

		// Check if user_roles table exists
		console.log('\n=== CHECKING USER_ROLES TABLE ===')
		const { data: userRoles, error: userRolesError } = await supabase
			.from('user_roles')
			.select('*')
			.eq('user_id', users.id)

		if (userRolesError) {
			console.log('user_roles table does NOT exist or error:', userRolesError.message)
		} else {
			console.log('user_roles data:')
			console.log(JSON.stringify(userRoles, null, 2))
		}

		// Check roles table
		console.log('\n=== CHECKING ROLES TABLE ===')
		const { data: roles, error: rolesError } = await supabase
			.from('roles')
			.select('*')
			.limit(5)

		if (rolesError) {
			console.log('roles table error:', rolesError.message)
		} else {
			console.log('roles table data (first 5):')
			console.log(JSON.stringify(roles, null, 2))
		}

	} catch (err) {
		console.error('Error:', err)
	}
}

queryUser()
