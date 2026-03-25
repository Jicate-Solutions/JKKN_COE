'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Home, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 h-16 w-16 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Shield className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            You don't have permission to access this resource
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Your account doesn't have the required permissions to access this page.
              This may be because:
            </p>
            <ul className="mt-2 text-sm text-orange-700 dark:text-orange-300 list-disc list-inside space-y-1">
              <li>Your role doesn't have access to this feature</li>
              <li>Your account permissions have been changed</li>
              <li>You're trying to access an admin-only area</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full"
              variant="default"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>

            <Button
              onClick={() => router.push('/contact-admin')}
              className="w-full"
              variant="outline"
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Administrator
            </Button>
          </div>

          <div className="text-center pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              If you believe this is an error, please contact the JKKN COE administrator
              for assistance with your account permissions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}