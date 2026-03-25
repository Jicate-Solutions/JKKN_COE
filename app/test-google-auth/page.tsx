'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { googleAuthService } from '@/services/auth/google-auth-service';
import GoogleSignInButton from '@/components/common/google-sign-in-button';
import { CheckCircle, XCircle, Info, LogOut, RefreshCw } from 'lucide-react';

export default function TestGoogleAuthPage() {
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    user: null as any,
    token: null as string | null,
  });
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkCurrentAuthState();
  }, []);

  const checkCurrentAuthState = () => {
    const token = googleAuthService.getToken();
    const user = googleAuthService.getUser();
    const isAuthenticated = googleAuthService.isAuthenticated();

    setAuthState({
      isAuthenticated,
      user,
      token,
    });

    addTestResult('Current Auth State', {
      isAuthenticated,
      hasToken: !!token,
      hasUser: !!user,
      user: user ? { email: user.email, role: user.role } : null,
    }, isAuthenticated);
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

  const handleSignInSuccess = () => {
    addTestResult('Google Sign-In', { status: 'Success' }, true);
    checkCurrentAuthState();
  };

  const handleSignInError = (error: string) => {
    addTestResult('Google Sign-In', { error }, false);
  };

  const testTokenVerification = async () => {
    setIsLoading(true);
    try {
      const result = await googleAuthService.verifyToken();
      addTestResult('Token Verification', result, result.valid);
    } catch (error) {
      addTestResult('Token Verification', { error: error instanceof Error ? error.message : 'Unknown error' }, false);
    } finally {
      setIsLoading(false);
    }
  };

  const testProtectedApiCall = async () => {
    setIsLoading(true);
    try {
      const headers = googleAuthService.getAuthHeaders();
      const response = await fetch('/api/auth/verify', {
        headers,
      });

      const data = await response.json();
      addTestResult('Protected API Call', { status: response.status, data }, response.ok);
    } catch (error) {
      addTestResult('Protected API Call', { error: error instanceof Error ? error.message : 'Unknown error' }, false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await googleAuthService.signOut();
    setAuthState({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    addTestResult('Sign Out', { status: 'Success' }, true);
  };

  const clearTests = () => {
    setTestResults([]);
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Google Authentication Test Page</h1>

      <div className="grid gap-6">
        {/* Current Auth State */}
        <Card>
          <CardHeader>
            <CardTitle>Current Authentication State</CardTitle>
            <CardDescription>Shows the current authentication status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {authState.isAuthenticated ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  Status: {authState.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                </span>
              </div>

              {authState.user && (
                <div className="pl-7 space-y-1">
                  <div>Email: {authState.user.email}</div>
                  <div>Role: {authState.user.role}</div>
                  <div>Name: {authState.user.name}</div>
                </div>
              )}

              <div className="pl-7">
                <span className="text-sm text-muted-foreground">
                  Token: {authState.token ? `${authState.token.substring(0, 20)}...` : 'None'}
                </span>
              </div>
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
              {!authState.isAuthenticated ? (
                <div>
                  <h3 className="text-sm font-medium mb-2">Sign In with Google</h3>
                  <GoogleSignInButton
                    onSuccess={handleSignInSuccess}
                    onError={handleSignInError}
                    className="w-full max-w-sm"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Button onClick={testTokenVerification} disabled={isLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Verify Token
                  </Button>

                  <Button onClick={testProtectedApiCall} disabled={isLoading} variant="outline">
                    <Info className="mr-2 h-4 w-4" />
                    Test Protected API
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

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
            <CardDescription>How to set up Google OAuth for this application</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" className="text-blue-500 hover:underline">Google Cloud Console</a></li>
              <li>Create a new project or select existing one</li>
              <li>Enable Google+ API</li>
              <li>Go to Credentials → Create Credentials → OAuth 2.0 Client ID</li>
              <li>Add authorized JavaScript origins: http://localhost:3000 (for development)</li>
              <li>Add authorized redirect URIs: http://localhost:3000/auth/callback</li>
              <li>Copy the Client ID and update NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local</li>
              <li>Copy the Client Secret and update GOOGLE_CLIENT_SECRET in .env.local</li>
              <li>Generate a JWT secret and update JWT_SECRET in .env.local</li>
              <li>Restart the development server</li>
            </ol>

            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Note:</strong> Make sure the users table in your database has the following fields:
                id, email, role, is_active, google_id, name, created_at, updated_at
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}