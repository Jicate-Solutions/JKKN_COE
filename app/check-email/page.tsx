'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@supabase/supabase-js';
import { Copy, Mail, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CheckEmailPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.email) {
        setEmail(session.user.email);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyEmail = () => {
    if (email) {
      navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copySQLCommand = () => {
    if (email) {
      const sql = `-- Add this user to the database
INSERT INTO users (
    id, email, full_name, role, is_active, permissions, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    '${email}',
    'User Name',
    'user',
    true,
    '{"dashboard": true}',
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();`;

      navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl mt-10">
      <Card>
        <CardHeader>
          <CardTitle>Check Your Authentication Email</CardTitle>
          <CardDescription>
            This page shows the email address being used for Google authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          {email ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3 mb-2">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-blue-800 dark:text-blue-200">
                    Your Google Email:
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-lg bg-white dark:bg-gray-900 px-3 py-2 rounded border flex-1">
                    {email}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyEmail}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      Not able to login?
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      This email needs to be added to the users table in your database with:
                    </p>
                    <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300 space-y-1 ml-2">
                      <li>A valid role (admin, teacher, student, or user)</li>
                      <li>is_active set to TRUE</li>
                      <li>Appropriate permissions</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Quick Fix - Run this SQL in Supabase:</p>
                <Button
                  onClick={copySQLCommand}
                  variant="outline"
                  className="w-full"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy SQL Command to Add This User
                </Button>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  After adding yourself to the database:
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => router.push('/login')} variant="default">
                    Try Login Again
                  </Button>
                  <Button onClick={() => supabase.auth.signOut()} variant="outline">
                    Sign Out First
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <p className="text-center text-muted-foreground">
                  No active Google session found
                </p>
              </div>
              <div className="text-center">
                <Button onClick={() => router.push('/login')}>
                  Go to Login Page
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Instructions to Add Yourself</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Go to your Supabase Dashboard</li>
            <li>Navigate to SQL Editor</li>
            <li>Copy the SQL command above (or from the quick-add-user.sql file)</li>
            <li>Replace the email with your Google account email</li>
            <li>Update the name and role as needed</li>
            <li>Run the SQL query</li>
            <li>Return here and try logging in again</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}