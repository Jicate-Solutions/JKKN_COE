'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogOut, User, Shield } from 'lucide-react';

export default function TestAuthPage() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const testSupabaseConnection = async () => {
    setTestLoading(true);
    try {
      const response = await fetch('/api/test-supabase-auth');
      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({ error: 'Failed to test connection', details: error });
    } finally {
      setTestLoading(false);
    }
  };

  const testOAuthDebug = async () => {
    setTestLoading(true);
    try {
      const response = await fetch('/api/debug-oauth');
      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({ error: 'Failed to debug OAuth', details: error });
    } finally {
      setTestLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>Authentication Test Page</h1>
        <p className='text-muted-foreground'>
          This page helps test the new Supabase authentication system.
        </p>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Authentication Status */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              Authentication Status
            </CardTitle>
            <CardDescription>
              Current user authentication state
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span className='font-medium'>Status:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                isAuthenticated 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
              </span>
            </div>

            {user && (
              <div className='space-y-2'>
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
                  <span className='text-sm'>{user.role}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>Super Admin:</span>
                  <span className='text-sm'>{user.is_super_admin ? 'Yes' : 'No'}</span>
                </div>
                {user.last_login && (
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>Last Login:</span>
                    <span className='text-sm'>{new Date(user.last_login).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {isAuthenticated && (
              <Button onClick={handleLogout} variant='outline' className='w-full'>
                <LogOut className='mr-2 h-4 w-4' />
                Logout
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Supabase Connection Test */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Supabase Connection Test
            </CardTitle>
            <CardDescription>
              Test the connection to Supabase database
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Button 
                onClick={testSupabaseConnection} 
                disabled={testLoading}
                className='w-full'
              >
                {testLoading ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button 
                onClick={testOAuthDebug} 
                disabled={testLoading}
                variant='outline'
                className='w-full'
              >
                {testLoading ? 'Debugging...' : 'Debug OAuth'}
              </Button>
            </div>

            {testResult && (
              <div className='space-y-2'>
                {testResult.success ? (
                  <div className='rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900 dark:text-green-200'>
                    ✅ Connection successful! {testResult.message}
                  </div>
                ) : (
                  <div className='rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900 dark:text-red-200'>
                    ❌ Connection failed: {testResult.error}
                    {testResult.details && (
                      <div className='mt-2 text-sm'>
                        Details: {testResult.details}
                      </div>
                    )}
                  </div>
                )}

                {testResult.supabaseUrl && (
                  <div className='text-sm text-muted-foreground'>
                    <strong>Supabase URL:</strong> {testResult.supabaseUrl}
                  </div>
                )}

                {testResult.hasServiceKey !== undefined && (
                  <div className='text-sm text-muted-foreground'>
                    <strong>Service Key:</strong> {testResult.hasServiceKey ? 'Present' : 'Missing'}
                  </div>
                )}

                {testResult.userCount !== undefined && (
                  <div className='text-sm text-muted-foreground'>
                    <strong>Users in database:</strong> {testResult.userCount}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
          <CardDescription>
            How to test the new authentication system
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <h4 className='font-medium'>1. Test Supabase Connection</h4>
            <p className='text-sm text-muted-foreground'>
              Click "Test Connection" to verify that the app can connect to Supabase and create the users table if needed.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>2. Test User Registration</h4>
            <p className='text-sm text-muted-foreground'>
              Go to the <a href='/login' className='text-primary hover:underline'>login page</a> and try registering a new user account.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>3. Test User Login</h4>
            <p className='text-sm text-muted-foreground'>
              After registration, try logging in with the same credentials.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>4. Verify Authentication State</h4>
            <p className='text-sm text-muted-foreground'>
              Check that the authentication status shows as "Authenticated" and user details are displayed correctly.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
