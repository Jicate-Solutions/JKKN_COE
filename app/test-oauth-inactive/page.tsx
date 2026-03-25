'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, User, Shield, Database } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export default function TestOAuthInactivePage() {
  const { user, loginWithGoogle, logout, isAuthenticated, error } = useAuth();
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleGoogleLogin = async () => {
    addTestResult('Starting Google OAuth login...');
    
    try {
      const result = await loginWithGoogle();
      
      if (result.success) {
        addTestResult('✅ Google OAuth initiated successfully');
      } else {
        addTestResult(`❌ Google OAuth failed: ${result.error}`);
      }
    } catch (error) {
      addTestResult(`❌ Google OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    addTestResult('Logging out...');
    await logout();
    addTestResult('✅ Logged out successfully');
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>Test OAuth with Inactive Users</h1>
        <p className='text-muted-foreground'>
          Test Google OAuth behavior with active and inactive user accounts
        </p>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              Current Status
            </CardTitle>
            <CardDescription>
              Current user authentication status
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
                <Button onClick={handleLogout} variant='outline' className='w-full'>
                  Logout
                </Button>
              </div>
            ) : (
              <div className='text-center py-4'>
                <p className='text-muted-foreground mb-4'>No user logged in</p>
                <p className='text-sm text-muted-foreground'>
                  Try Google OAuth login to test the inactive user validation
                </p>
              </div>
            )}

            {error && (
              <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm'>
                <div className='flex items-center gap-2'>
                  <AlertCircle className='h-4 w-4' />
                  Error: {error}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Test Controls
            </CardTitle>
            <CardDescription>
              Test OAuth login and monitor behavior
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Button 
              onClick={handleGoogleLogin} 
              disabled={isAuthenticated}
              className='w-full'
            >
              {isAuthenticated ? 'Already Logged In' : 'Test Google OAuth'}
            </Button>
            
            <Button 
              onClick={clearResults} 
              variant='outline'
              className='w-full'
            >
              Clear Test Results
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Database className='h-5 w-5' />
            Test Results
          </CardTitle>
          <CardDescription>
            Real-time test results and console output
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='bg-muted/50 p-4 rounded-lg max-h-96 overflow-y-auto'>
            {testResults.length === 0 ? (
              <p className='text-muted-foreground text-sm'>No test results yet. Start a test to see output.</p>
            ) : (
              <div className='space-y-1'>
                {testResults.map((result, index) => (
                  <div key={index} className='text-sm font-mono'>
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Testing Instructions */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
          <CardDescription>
            How to test OAuth with inactive users
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-3'>
            <div>
              <h4 className='font-medium mb-2'>1. Test with Active User</h4>
              <p className='text-sm text-muted-foreground'>
                Use a Google account that has an active user record in the database. Login should succeed.
              </p>
            </div>
            
            <div>
              <h4 className='font-medium mb-2'>2. Test with Inactive User</h4>
              <p className='text-sm text-muted-foreground'>
                First, deactivate a user in the database, then try OAuth login with that Google account.
              </p>
              <div className='bg-muted/50 p-3 rounded mt-2'>
                <pre className='text-xs'>
{`-- Deactivate a user for testing
UPDATE users SET is_active = false WHERE email = 'your-google-email@gmail.com';`}
                </pre>
              </div>
            </div>
            
            <div>
              <h4 className='font-medium mb-2'>3. Expected Behavior</h4>
              <ul className='text-sm text-muted-foreground space-y-1'>
                <li>• <strong>Active User:</strong> OAuth succeeds, user is logged in</li>
                <li>• <strong>Inactive User:</strong> OAuth fails with "Your account is inactive" message</li>
                <li>• <strong>No User Record:</strong> New user created as active (OAuth only)</li>
              </ul>
            </div>
            
            <div>
              <h4 className='font-medium mb-2'>4. Console Monitoring</h4>
              <p className='text-sm text-muted-foreground'>
                Open browser developer tools and check the console for detailed logging of the OAuth process and validation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
