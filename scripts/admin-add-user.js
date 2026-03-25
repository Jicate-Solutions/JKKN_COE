#!/usr/bin/env node

/**
 * Admin Script: Add User to JKKN COE Portal
 *
 * This script allows admins to quickly add users to the portal database.
 * Run with: node scripts/admin-add-user.js
 *
 * Requirements:
 * 1. Install dependencies: npm install @supabase/supabase-js dotenv
 * 2. Set up environment variables in .env.local
 * 3. Run from project root directory
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role key needed for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables.');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function addUser() {
  try {
    console.log('\n🔧 JKKN COE Portal - Add User Script');
    console.log('=====================================\n');

    // Get user information
    const email = await askQuestion('Enter user email (Google email they will use to login): ');
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address');
    }

    const fullName = await askQuestion('Enter full name: ');
    if (!fullName) {
      throw new Error('Full name is required');
    }

    const phoneNumber = await askQuestion('Enter phone number (optional, press Enter to skip): ');

    console.log('\nAvailable roles:');
    console.log('  admin    - Full system access');
    console.log('  teacher  - Can manage courses and students');
    console.log('  student  - Can view courses and submit assignments');
    console.log('  user     - Basic portal access');

    const role = await askQuestion('\nEnter role (admin/teacher/student/user): ');
    const validRoles = ['admin', 'teacher', 'student', 'user'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role. Must be one of: admin, teacher, student, user');
    }

    const isSuperAdmin = await askQuestion('Is this user a super admin? (y/N): ');
    const isSuperAdminBool = isSuperAdmin.toLowerCase() === 'y' || isSuperAdmin.toLowerCase() === 'yes';

    // Set permissions based on role
    let permissions = {};
    if (role === 'admin' || isSuperAdminBool) {
      permissions = {
        "users.view": true,
        "users.create": true,
        "users.edit": true,
        "users.delete": true,
        "courses.view": true,
        "courses.create": true,
        "courses.edit": true,
        "courses.delete": true,
        "batches.view": true,
        "batches.create": true,
        "batches.edit": true,
        "batches.delete": true,
        "regulations.view": true,
        "regulations.create": true,
        "regulations.edit": true,
        "regulations.delete": true
      };
    } else if (role === 'teacher') {
      permissions = {
        "courses.view": true,
        "courses.edit": true,
        "batches.view": true,
        "students.view": true
      };
    } else if (role === 'student') {
      permissions = {
        "courses.view": true,
        "assignments.view": true,
        "assignments.submit": true
      };
    }

    console.log('\n📋 User Information Summary:');
    console.log(`Email: ${email}`);
    console.log(`Name: ${fullName}`);
    console.log(`Phone: ${phoneNumber || 'Not provided'}`);
    console.log(`Role: ${role}`);
    console.log(`Super Admin: ${isSuperAdminBool ? 'Yes' : 'No'}`);
    console.log(`Permissions: ${Object.keys(permissions).length} permission(s)`);

    const confirm = await askQuestion('\nProceed with creating this user? (y/N): ');
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ User creation cancelled.');
      return;
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log('\n⚠️  User already exists in the database!');
      const overwrite = await askQuestion('Do you want to update the existing user? (y/N): ');
      if (overwrite.toLowerCase() === 'y' || overwrite.toLowerCase() === 'yes') {
        // Update existing user
        const { data, error } = await supabase
          .from('users')
          .update({
            full_name: fullName,
            phone_number: phoneNumber || null,
            role: role,
            institution_id: 'JKKN-COE',
            is_super_admin: isSuperAdminBool,
            is_active: true,
            permissions: permissions,
            updated_at: new Date().toISOString()
          })
          .eq('email', email)
          .select()
          .single();

        if (error) {
          throw error;
        }

        console.log('\n✅ User updated successfully!');
        console.log(`User ID: ${data.id}`);
        console.log(`Email: ${data.email}`);
        console.log(`Role: ${data.role}`);
        console.log(`Active: ${data.is_active}`);
      } else {
        console.log('❌ User update cancelled.');
      }
      return;
    }

    // Create new user
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: email,
        full_name: fullName,
        phone_number: phoneNumber || null,
        role: role,
        institution_id: 'JKKN-COE',
        is_super_admin: isSuperAdminBool,
        is_active: true,
        permissions: permissions,
        profile_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('\n✅ User created successfully!');
    console.log(`User ID: ${data.id}`);
    console.log(`Email: ${data.email}`);
    console.log(`Role: ${data.role}`);
    console.log(`Active: ${data.is_active}`);
    console.log('\n🎉 The user can now login using Google OAuth with their email.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Please check the error details and try again.');
  } finally {
    rl.close();
  }
}

async function listUsers() {
  try {
    console.log('\n👥 Current Users in Database:');
    console.log('============================\n');

    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (users.length === 0) {
      console.log('No users found in database.');
      return;
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.full_name} (${user.email})`);
      console.log(`   Role: ${user.role} | Active: ${user.is_active ? '✅' : '❌'} | Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log('');
    });

    console.log(`Total users: ${users.length}`);

  } catch (error) {
    console.error('\n❌ Error fetching users:', error.message);
  }
}

async function main() {
  console.log('\n🔧 JKKN COE Portal - Admin User Management');
  console.log('==========================================');
  console.log('\nWhat would you like to do?');
  console.log('1. Add a new user');
  console.log('2. List all users');
  console.log('3. Exit');

  const choice = await askQuestion('\nEnter your choice (1-3): ');

  switch (choice) {
    case '1':
      await addUser();
      break;
    case '2':
      await listUsers();
      break;
    case '3':
      console.log('👋 Goodbye!');
      rl.close();
      return;
    default:
      console.log('❌ Invalid choice. Please enter 1, 2, or 3.');
      rl.close();
      return;
  }

  rl.close();
}

// Handle script interruption
process.on('SIGINT', () => {
  console.log('\n\n👋 Script interrupted. Goodbye!');
  rl.close();
  process.exit(0);
});

// Run the script
main().catch(console.error);