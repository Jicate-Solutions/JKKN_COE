'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { CheckCircle, XCircle, Info, LogOut, RefreshCw, Shield, User } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TestSupabaseGooglePage() {
  const { user, isAuthenticated, loginWithGoogle, logout, error } = useAuth();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    checkCurrentSession();
  }, [isAuthenticated]);

  const checkCurrentSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSessionData(session);

    if (session) {
      addTestResult('Current Session', {
        user: session.user?.email,
        provider: session.user?.app_metadata?.provider,
        expiresAt: new Date(session.expires_at! * 1000).toLocaleString(),
      }, true);
    }
  };

  const addTestResult = (name: string, details: any, success: boolean) => {
    setTestResults(prev => [
      ...prev,
      {
        name,
        details,
        success,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await loginWithGoogle();

      if (result.success) {
        addTestResult('Google Sign-In Initiated', {
          status: 'Redirecting to Google...',
          note: 'You will be redirected to Google for authentication'
        }, true);
      } else {
        addTestResult('Google Sign-In Failed', { error: result.error }, false);
      }
    } catch (error) {
      addTestResult('Google Sign-In Error', { error: error instanceof Error ? error.message : 'Unknown error' }, false);
    } finally {
      setIsLoading(false);
    }
  };

  const testUserValidation = async () => {
    setIsLoading(true);
    try {
      if (!user) {
        addTestResult('User Validation', { error: 'No user logged in' }, false);
        return;
      }

      // Check user in database
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .single();

      if (error) {
        addTestResult('User Validation', { error: error.message }, false);
      } else {
        addTestResult('User Validation', {
          email: userProfile.email,
          role: userProfile.role,
          is_active: userProfile.is_active,
          validation: {
            hasEmail: !!userProfile.email,
            hasRole: !!userProfile.role,
            isActive: userProfile.is_active === true,
          }
        }, userProfile.is_active && !!userProfile.role);
      }
    } catch (error) {
      addTestResult('User Validation', { error: error instanceof Error ? error.message : 'Unknown error' }, false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setSessionData(null);
    addTestResult('Sign Out', { status: 'Success' }, true);
  };

  const clearTests = () => {
    setTestResults([]);
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Supabase Google Authentication Test</h1>

      <div className="grid gap-6">
        {/* Current Auth State */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Status</CardTitle>
            <CardDescription>Current authentication and session state</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  Status: {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                </span>
              </div>

              {user && (
                <div className="pl-7 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email: {user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Role: {user.role}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Active: {user.is_active ? 'Yes' : 'No'}
                  </div>
                </div>
              )}

              {sessionData && (
                <div className="mt-3 p-3 bg-muted rounded text-xs">
                  <div>Provider: {sessionData.user?.app_metadata?.provider || 'Unknown'}</div>
                  <div>Expires: {new Date(sessionData.expires_at * 1000).toLocaleString()}</div>
                </div>
              )}

              {error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Authentication Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Actions</CardTitle>
            <CardDescription>Test different authentication flows</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!isAuthenticated ? (
                <div>
                  <Button onClick={handleGoogleLogin} disabled={isLoading} className="w-full sm:w-auto">
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Sign in with Google
                  </Button>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You will be redirected to Google for authentication
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button onClick={testUserValidation} disabled={isLoading} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Test User Validation
                  </Button>

                  <Button onClick={checkCurrentSession} disabled={isLoading} variant="outline">
                    <Info className="mr-2 h-4 w-4" />
                    Refresh Session
                  </Button>

                  <Button onClick={handleSignOut} variant="destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        {testResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>
                Results from authentication tests
                <Button onClick={clearTests} size="sm" variant="ghost" className="ml-4">
                  Clear
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {testResults.map((result, index) => (
                  <div key={index} className="border rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{result.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Setup Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Supabase Google OAuth Setup</CardTitle>
            <CardDescription>Configure Google authentication in Supabase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">1. Google Cloud Console Setup</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Go to Google Cloud Console → APIs & Services → Credentials</li>
                  <li>Create OAuth 2.0 Client ID (Web application)</li>
                  <li>Add Authorized redirect URI: <code className="bg-muted px-1">https://YOUR_PROJECT.supabase.co/auth/v1/callback</code></li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">2. Supabase Dashboard Setup</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Go to Supabase Dashboard → Authentication → Providers</li>
                  <li>Enable Google provider</li>
                  <li>Add your Google Client ID and Client Secret</li>
                  <li>Set Site URL to your application URL</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium mb-2">3. Database Requirements</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Users table must have: <code className="bg-muted px-1">email</code>, <code className="bg-muted px-1">role</code>, <code className="bg-muted px-1">is_active</code></li>
                  <li>Pre-create user records with email addresses</li>
                  <li>Set <code className="bg-muted px-1">is_active = true</code> for authorized users</li>
                  <li>Assign appropriate roles to users</li>
                </ul>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> Users must exist in the database before they can login.
                  Google authentication will be rejected if the email is not found, role is not assigned, or is_active is false.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}