const fetch = require('node-fetch');

const sampleUsers = [
  {
    full_name: 'John Doe',
    email: 'john.doe@jkkn.edu',
    phone: '+91 9876543210',
    is_active: true,
    is_verified: true,
    roles: 'admin',
    location: 'Chennai',
    bio: 'System Administrator at JKKN COE',
    institution_id: 'test-institution-id'
  },
  {
    full_name: 'Sarah Johnson',
    email: 'sarah.johnson@jkkn.edu',
    phone: '+91 9876543211',
    is_active: true,
    is_verified: true,
    roles: 'moderator',
    location: 'Coimbatore',
    bio: 'Academic Coordinator',
    institution_id: 'test-institution-id'
  },
  {
    full_name: 'Michael Chen',
    email: 'michael.chen@jkkn.edu',
    phone: '+91 9876543212',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Chennai',
    bio: 'Faculty Member - Computer Science',
    institution_id: 'test-institution-id'
  },
  {
    full_name: 'Emily Davis',
    email: 'emily.davis@jkkn.edu',
    phone: '+91 9876543213',
    is_active: false,
    is_verified: true,
    roles: 'user',
    location: 'Madurai',
    bio: 'Faculty Member - Electronics',
    institution_id: 'test-institution-id'
  },
  {
    full_name: 'Robert Wilson',
    email: 'robert.wilson@jkkn.edu',
    phone: '+91 9876543214',
    is_active: true,
    is_verified: false,
    roles: 'user',
    location: 'Chennai',
    bio: 'New Faculty Member',
    institution_id: 'test-institution-id'
  }
];

async function seedViaAPI() {
  console.log('Seeding users via API...\n');

  for (const user of sampleUsers) {
    try {
      const response = await fetch('http://localhost:3001/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Created user: ${user.full_name} (${user.email})`);
      } else {
        const error = await response.text();
        console.error(`❌ Failed to create user ${user.full_name}:`, error);
      }
    } catch (err) {
      console.error(`❌ Error creating user ${user.full_name}:`, err.message);
    }
  }

  // Check the count
  console.log('\nChecking total users...');
  try {
    const response = await fetch('http://localhost:3001/api/users');
    const users = await response.json();
    console.log(`Total users in database: ${users.length}`);

    if (users.length > 0) {
      console.log('\nFirst 3 users:');
      users.slice(0, 3).forEach(user => {
        console.log(`- ${user.full_name} (${user.email}) - Active: ${user.is_active}`);
      });
    }
  } catch (err) {
    console.error('Error fetching users:', err.message);
  }
}

seedViaAPI();