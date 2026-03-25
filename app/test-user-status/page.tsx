'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, User, Shield, Database } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export default function TestUserStatusPage() {
  const { user, login, logout, isAuthenticated } = useAuth();
  const [testEmail, setTestEmail] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [loginResult, setLoginResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestLogin = async () => {
    if (!testEmail || !testPassword) {
      setLoginResult('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setLoginResult(null);

    try {
      const result = await login({
        email: testEmail,
        password: testPassword
      });

      if (result.success) {
        setLoginResult('✅ Login successful! User account is active.');
      } else {
        setLoginResult(`❌ Login failed: ${result.error}`);
      }
    } catch (error) {
      setLoginResult(`❌ Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLoginResult(null);
  };

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>User Status Testing</h1>
        <p className='text-muted-foreground'>
          Test the is_active field functionality for user authentication
        </p>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Current User Status */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              Current User Status
            </CardTitle>
            <CardDescription>
              Information about the currently logged-in user
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {isAuthenticated && user ? (
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Email:</span>
                  <span className='text-sm'>{user.email}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Name:</span>
                  <span className='text-sm'>{user.full_name}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Role:</span>
                  <Badge variant='outline'>{user.role}</Badge>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Status:</span>
                  <Badge 
                    variant={user.is_active ? 'default' : 'destructive'}
                    className={user.is_active ? 'bg-green-100 text-green-800' : ''}
                  >
                    {user.is_active ? (
                      <><CheckCircle className='h-3 w-3 mr-1' /> Active</>
                    ) : (
                      <><AlertCircle className='h-3 w-3 mr-1' /> Inactive</>
                    )}
                  </Badge>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Super Admin:</span>
                  <Badge variant={user.is_super_admin ? 'default' : 'secondary'}>
                    {user.is_super_admin ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <Button onClick={handleLogout} variant='outline' className='w-full'>
                  Logout
                </Button>
              </div>
            ) : (
              <div className='text-center py-4'>
                <p className='text-muted-foreground mb-4'>No user logged in</p>
                <p className='text-sm text-muted-foreground'>
                  Use the test login form to authenticate with a user account
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Login Form */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Test Login
            </CardTitle>
            <CardDescription>
              Test login with different user accounts to verify is_active functionality
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='testEmail'>Email</Label>
              <Input
                id='testEmail'
                type='email'
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder='Enter user email'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='testPassword'>Password</Label>
              <Input
                id='testPassword'
                type='password'
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                placeholder='Enter user password'
              />
            </div>
            <Button 
              onClick={handleTestLogin} 
              disabled={isLoading}
              className='w-full'
            >
              {isLoading ? 'Testing...' : 'Test Login'}
            </Button>
            
            {loginResult && (
              <div className={`p-3 rounded-lg text-sm ${
                loginResult.includes('✅') 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {loginResult}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Database Information */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Database className='h-5 w-5' />
            Database Schema Information
          </CardTitle>
          <CardDescription>
            Information about the is_active field implementation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='bg-muted/50 p-4 rounded-lg'>
              <h4 className='font-medium mb-2'>is_active Field</h4>
              <ul className='text-sm space-y-1 text-muted-foreground'>
                <li>• <strong>Type:</strong> BOOLEAN (true/false)</li>
                <li>• <strong>Default:</strong> true (new users are active by default)</li>
                <li>• <strong>Required:</strong> Yes (NOT NULL constraint)</li>
                <li>• <strong>Purpose:</strong> Controls whether user can authenticate</li>
              </ul>
            </div>
            
            <div className='bg-muted/50 p-4 rounded-lg'>
              <h4 className='font-medium mb-2'>Authentication Logic</h4>
              <ul className='text-sm space-y-1 text-muted-foreground'>
                <li>• Only users with <code>is_active = true</code> can login</li>
                <li>• Inactive users receive: "Your account is inactive. Please contact JKKN COE Admin for assistance."</li>
                <li>• Applies to both email/password and Google OAuth login</li>
                <li>• Admin can activate/deactivate users via database</li>
              </ul>
            </div>

            <div className='bg-muted/50 p-4 rounded-lg'>
              <h4 className='font-medium mb-2'>Admin Commands</h4>
              <div className='text-sm space-y-2 text-muted-foreground'>
                <div>
                  <strong>Check user status:</strong>
                  <code className='block bg-background p-2 rounded mt-1'>
                    SELECT id, email, full_name, is_active FROM users WHERE email = 'user@example.com';
                  </code>
                </div>
                <div>
                  <strong>Deactivate user:</strong>
                  <code className='block bg-background p-2 rounded mt-1'>
                    UPDATE users SET is_active = false WHERE email = 'user@example.com';
                  </code>
                </div>
                <div>
                  <strong>Activate user:</strong>
                  <code className='block bg-background p-2 rounded mt-1'>
                    UPDATE users SET is_active = true WHERE email = 'user@example.com';
                  </code>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
