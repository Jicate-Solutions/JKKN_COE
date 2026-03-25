'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Database, RefreshCw, User } from 'lucide-react';

interface DatabaseStatus {
  success: boolean;
  hasIsActiveField?: boolean;
  fieldInfo?: any;
  userStats?: {
    total: number;
    active: number;
    inactive: number;
    withoutField: number;
  };
  sampleUsers?: any[];
  error?: string;
  message?: string;
  migrationNeeded?: boolean;
  sqlScript?: string;
}

export default function DebugIsActivePage() {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDatabaseStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/check-is-active-field');
      const data = await response.json();
      setDbStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check database status');
    } finally {
      setIsLoading(false);
    }
  };

  const runMigration = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/check-is-active-field', {
        method: 'POST'
      });
      const data = await response.json();
      setDbStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run migration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkDatabaseStatus();
  }, []);

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>Debug is_active Field</h1>
        <p className='text-muted-foreground'>
          Check database schema and test is_active field validation
        </p>
      </div>

      <div className='grid gap-6'>
        {/* Database Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Database className='h-5 w-5' />
              Database Status
            </CardTitle>
            <CardDescription>
              Check if is_active field exists and is properly configured
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex gap-2'>
              <Button 
                onClick={checkDatabaseStatus} 
                disabled={isLoading}
                className='flex items-center gap-2'
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Check Status
              </Button>
              {dbStatus?.migrationNeeded && (
                <Button 
                  onClick={runMigration} 
                  disabled={isLoading}
                  variant='outline'
                  className='flex items-center gap-2'
                >
                  <Database className='h-4 w-4' />
                  Run Migration
                </Button>
              )}
            </div>

            {error && (
              <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm'>
                <div className='flex items-center gap-2'>
                  <AlertCircle className='h-4 w-4' />
                  Error: {error}
                </div>
              </div>
            )}

            {dbStatus && (
              <div className='space-y-4'>
                {/* Field Status */}
                <div className='flex items-center gap-2'>
                  {dbStatus.hasIsActiveField ? (
                    <Badge className='bg-green-100 text-green-800'>
                      <CheckCircle className='h-3 w-3 mr-1' />
                      Field Exists
                    </Badge>
                  ) : (
                    <Badge variant='destructive'>
                      <AlertCircle className='h-3 w-3 mr-1' />
                      Field Missing
                    </Badge>
                  )}
                  <span className='text-sm text-muted-foreground'>
                    {dbStatus.message}
                  </span>
                </div>

                {/* Field Information */}
                {dbStatus.fieldInfo && (
                  <div className='bg-muted/50 p-3 rounded-lg'>
                    <h4 className='font-medium mb-2'>Field Details</h4>
                    <div className='text-sm space-y-1'>
                      <div><strong>Type:</strong> {dbStatus.fieldInfo.data_type}</div>
                      <div><strong>Nullable:</strong> {dbStatus.fieldInfo.is_nullable}</div>
                      <div><strong>Default:</strong> {dbStatus.fieldInfo.column_default}</div>
                    </div>
                  </div>
                )}

                {/* User Statistics */}
                {dbStatus.userStats && (
                  <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                    <div className='text-center p-3 bg-blue-50 rounded-lg'>
                      <div className='text-2xl font-bold text-blue-600'>{dbStatus.userStats.total}</div>
                      <div className='text-sm text-blue-800'>Total Users</div>
                    </div>
                    <div className='text-center p-3 bg-green-50 rounded-lg'>
                      <div className='text-2xl font-bold text-green-600'>{dbStatus.userStats.active}</div>
                      <div className='text-sm text-green-800'>Active</div>
                    </div>
                    <div className='text-center p-3 bg-red-50 rounded-lg'>
                      <div className='text-2xl font-bold text-red-600'>{dbStatus.userStats.inactive}</div>
                      <div className='text-sm text-red-800'>Inactive</div>
                    </div>
                    <div className='text-center p-3 bg-yellow-50 rounded-lg'>
                      <div className='text-2xl font-bold text-yellow-600'>{dbStatus.userStats.withoutField}</div>
                      <div className='text-sm text-yellow-800'>No Field</div>
                    </div>
                  </div>
                )}

                {/* Sample Users */}
                {dbStatus.sampleUsers && dbStatus.sampleUsers.length > 0 && (
                  <div className='bg-muted/50 p-3 rounded-lg'>
                    <h4 className='font-medium mb-2'>Sample Users</h4>
                    <div className='space-y-2'>
                      {dbStatus.sampleUsers.map((user, index) => (
                        <div key={index} className='flex items-center justify-between text-sm'>
                          <div className='flex items-center gap-2'>
                            <User className='h-4 w-4' />
                            <span>{user.email}</span>
                          </div>
                          <Badge 
                            variant={user.is_active ? 'default' : 'destructive'}
                            className={user.is_active ? 'bg-green-100 text-green-800' : ''}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Migration Instructions */}
                {dbStatus.migrationNeeded && (
                  <div className='bg-yellow-50 border border-yellow-200 p-4 rounded-lg'>
                    <h4 className='font-medium text-yellow-800 mb-2'>Migration Required</h4>
                    <p className='text-sm text-yellow-700 mb-3'>
                      The is_active field doesn't exist in your database. Please run this SQL script in your Supabase dashboard:
                    </p>
                    <pre className='bg-yellow-100 p-3 rounded text-xs overflow-x-auto'>
                      {dbStatus.sqlScript || `
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
                      `}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Testing Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Testing Instructions</CardTitle>
            <CardDescription>
              How to test the is_active field validation
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-3'>
              <div>
                <h4 className='font-medium mb-2'>1. Check Database Status</h4>
                <p className='text-sm text-muted-foreground'>
                  Use the "Check Status" button above to verify the is_active field exists and see user statistics.
                </p>
              </div>
              
              <div>
                <h4 className='font-medium mb-2'>2. Test Login Validation</h4>
                <p className='text-sm text-muted-foreground'>
                  Go to <code>/test-user-status</code> to test login with different user accounts.
                </p>
              </div>
              
              <div>
                <h4 className='font-medium mb-2'>3. Check Console Logs</h4>
                <p className='text-sm text-muted-foreground'>
                  Open browser developer tools and check the console for detailed logging of user profile data and validation results.
                </p>
              </div>
              
              <div>
                <h4 className='font-medium mb-2'>4. Database Commands</h4>
                <p className='text-sm text-muted-foreground'>
                  Use these SQL commands in your Supabase dashboard to test:
                </p>
                <div className='bg-muted/50 p-3 rounded mt-2'>
                  <pre className='text-xs'>
{`-- Check all users
SELECT id, email, is_active FROM users;

-- Deactivate a user
UPDATE users SET is_active = false WHERE email = 'test@example.com';

-- Activate a user  
UPDATE users SET is_active = true WHERE email = 'test@example.com';`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
