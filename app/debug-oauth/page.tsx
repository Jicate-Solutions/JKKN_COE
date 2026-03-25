'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, Info } from 'lucide-react';

function DebugOAuthContent() {
  const searchParams = useSearchParams();
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const info = {
      url: window.location.href,
      searchParams: {
        code: searchParams.get('code'),
        state: searchParams.get('state'),
        error: searchParams.get('error'),
        error_description: searchParams.get('error_description'),
        error_code: searchParams.get('error_code'),
      },
      sessionStorage: {
        oauth_state: typeof window !== 'undefined' ? sessionStorage.getItem('oauth_state') : null,
      },
      localStorage: {
        oauth_state: typeof window !== 'undefined' ? localStorage.getItem('oauth_state') : null,
      },
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing',
      },
      timestamp: new Date().toISOString(),
    };
    
    setDebugInfo(info);
  }, [searchParams]);

  const clearOAuthState = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('oauth_state');
      localStorage.removeItem('oauth_state');
      setDebugInfo((prev: any) => ({
        ...prev,
        sessionStorage: { oauth_state: null },
        localStorage: { oauth_state: null },
      }));
    }
  };

  const testOAuthFlow = () => {
    // Clear any existing state
    clearOAuthState();
    
    // Redirect to login to test OAuth flow
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              OAuth Debug Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button onClick={clearOAuthState} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear OAuth State
              </Button>
              <Button onClick={testOAuthFlow} className="w-full">
                <CheckCircle className="h-4 w-4 mr-2" />
                Test OAuth Flow
              </Button>
            </div>
            
            {debugInfo && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Current URL Parameters
                  </h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-xs font-mono">
                    <div>URL: {debugInfo.url}</div>
                    <div>Code: {debugInfo.searchParams.code || 'Not present'}</div>
                    <div>State: {debugInfo.searchParams.state || 'Not present'}</div>
                    <div>Error: {debugInfo.searchParams.error || 'Not present'}</div>
                    <div>Error Description: {debugInfo.searchParams.error_description || 'Not present'}</div>
                    <div>Error Code: {debugInfo.searchParams.error_code || 'Not present'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Browser Storage
                  </h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-xs font-mono">
                    <div>Session Storage OAuth State: {debugInfo.sessionStorage.oauth_state || 'Not present'}</div>
                    <div>Local Storage OAuth State: {debugInfo.localStorage.oauth_state || 'Not present'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Environment Variables
                  </h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-xs font-mono">
                    <div>NEXT_PUBLIC_SUPABASE_URL: {debugInfo.environment.NEXT_PUBLIC_SUPABASE_URL}</div>
                    <div>NEXT_PUBLIC_SUPABASE_ANON_KEY: {debugInfo.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY}</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Debug Timestamp
                  </h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-xs font-mono">
                    {debugInfo.timestamp}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-semibold mb-1">Common OAuth State Issues:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>State parameter missing or expired</li>
                    <li>CSRF protection triggered</li>
                    <li>OAuth session timeout</li>
                    <li>Browser storage conflicts</li>
                    <li>Supabase configuration issues</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DebugOAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <DebugOAuthContent />
    </Suspense>
  );
}
