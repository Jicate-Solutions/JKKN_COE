'use client';

import { useEffect, useState } from 'react';
import { useSessionTimeout } from '@/hooks/auth/use-session-timeout';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Activity, LogOut, Settings } from 'lucide-react';

export default function TestSessionTimeoutPage() {
  const { isAuthenticated, logout } = useAuth();
  const [testConfig, setTestConfig] = useState({
    timeoutDuration: 1, // 1 minute for testing
    warningDuration: 0.5 // 30 seconds warning
  });

  const {
    isWarningVisible,
    remainingTime,
    isActive,
    extendSession,
    getRemainingTime,
    getInactivityTime,
    isAboutToExpire
  } = useSessionTimeout({
    timeoutDuration: testConfig.timeoutDuration,
    warningDuration: testConfig.warningDuration,
    showWarning: true,
    onTimeout: () => {
      console.log('Test session timeout triggered');
    }
  });

  const [displayTime, setDisplayTime] = useState('');

  useEffect(() => {
    const updateDisplayTime = () => {
      const remaining = getRemainingTime();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      if (minutes > 0) {
        setDisplayTime(`${minutes}m ${seconds}s`);
      } else {
        setDisplayTime(`${seconds}s`);
      }
    };

    updateDisplayTime();
    const interval = setInterval(updateDisplayTime, 1000);

    return () => clearInterval(interval);
  }, [getRemainingTime]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  if (!isAuthenticated) {
    return (
      <div className='container mx-auto p-6 max-w-4xl'>
        <Card>
          <CardHeader>
            <CardTitle>Session Timeout Test</CardTitle>
            <CardDescription>
              Please log in to test the session timeout functionality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>Session Timeout Test</h1>
        <p className='text-muted-foreground'>
          Test the automatic session timeout functionality with inactivity detection.
        </p>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Session Status */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Session Status
            </CardTitle>
            <CardDescription>
              Current session timeout information
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span className='font-medium'>Status:</span>
              <Badge variant={isActive ? 'default' : 'secondary'}>
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className='flex items-center justify-between'>
              <span className='font-medium'>Time Remaining:</span>
              <span className='font-mono text-lg'>{displayTime}</span>
            </div>

            <div className='flex items-center justify-between'>
              <span className='font-medium'>Inactivity Time:</span>
              <span className='font-mono'>{formatTime(getInactivityTime())}</span>
            </div>

            <div className='flex items-center justify-between'>
              <span className='font-medium'>About to Expire:</span>
              <Badge variant={isAboutToExpire() ? 'destructive' : 'secondary'}>
                {isAboutToExpire() ? 'Yes' : 'No'}
              </Badge>
            </div>

            <div className='flex items-center justify-between'>
              <span className='font-medium'>Warning Visible:</span>
              <Badge variant={isWarningVisible ? 'destructive' : 'secondary'}>
                {isWarningVisible ? 'Yes' : 'No'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Settings className='h-5 w-5' />
              Test Controls
            </CardTitle>
            <CardDescription>
              Configure and test session timeout behavior
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Timeout Duration (minutes)</label>
              <input
                type='number'
                min='0.5'
                max='60'
                step='0.5'
                value={testConfig.timeoutDuration}
                onChange={(e) => setTestConfig(prev => ({
                  ...prev,
                  timeoutDuration: parseFloat(e.target.value)
                }))}
                className='w-full p-2 border rounded-md'
              />
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>Warning Duration (minutes)</label>
              <input
                type='number'
                min='0.1'
                max='10'
                step='0.1'
                value={testConfig.warningDuration}
                onChange={(e) => setTestConfig(prev => ({
                  ...prev,
                  warningDuration: parseFloat(e.target.value)
                }))}
                className='w-full p-2 border rounded-md'
              />
            </div>

            <div className='space-y-2'>
              <Button
                onClick={extendSession}
                className='w-full'
                variant='outline'
              >
                <Activity className='mr-2 h-4 w-4' />
                Simulate Activity
              </Button>

              <Button
                onClick={logout}
                className='w-full'
                variant='destructive'
              >
                <LogOut className='mr-2 h-4 w-4' />
                Logout Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
          <CardDescription>
            How to test the session timeout functionality
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <h4 className='font-medium'>1. Configure Timeout</h4>
            <p className='text-sm text-muted-foreground'>
              Set a short timeout duration (e.g., 1 minute) and warning duration (e.g., 30 seconds) for testing.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>2. Test Inactivity Detection</h4>
            <p className='text-sm text-muted-foreground'>
              Stop interacting with the page and watch the countdown timer. The warning should appear before timeout.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>3. Test Activity Reset</h4>
            <p className='text-sm text-muted-foreground'>
              Click "Simulate Activity" or interact with the page to reset the timeout timer.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>4. Test Warning Dialog</h4>
            <p className='text-sm text-muted-foreground'>
              When the warning appears, you can either extend the session or logout immediately.
            </p>
          </div>

          <div className='space-y-2'>
            <h4 className='font-medium'>5. Test Automatic Logout</h4>
            <p className='text-sm text-muted-foreground'>
              If you don't extend the session, you'll be automatically logged out when the timeout expires.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Current Configuration */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Current Configuration</CardTitle>
          <CardDescription>
            Session timeout settings for this test
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 gap-4 text-sm'>
            <div>
              <span className='font-medium'>Timeout Duration:</span>
              <span className='ml-2'>{testConfig.timeoutDuration} minutes</span>
            </div>
            <div>
              <span className='font-medium'>Warning Duration:</span>
              <span className='ml-2'>{testConfig.warningDuration} minutes</span>
            </div>
            <div>
              <span className='font-medium'>Warning Threshold:</span>
              <span className='ml-2'>{testConfig.timeoutDuration - testConfig.warningDuration} minutes</span>
            </div>
            <div>
              <span className='font-medium'>Status:</span>
              <span className='ml-2'>{isActive ? 'Monitoring' : 'Stopped'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
