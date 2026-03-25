'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, LogOut } from 'lucide-react';

interface SessionTimeoutWarningProps {
  isVisible: boolean;
  remainingTime: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function SessionTimeoutWarning({
  isVisible,
  remainingTime,
  onExtend,
  onLogout
}: SessionTimeoutWarningProps) {
  const [displayTime, setDisplayTime] = useState('');

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const updateDisplayTime = () => {
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      
      if (minutes > 0) {
        setDisplayTime(`${minutes}m ${seconds}s`);
      } else {
        setDisplayTime(`${seconds}s`);
      }
    };

    updateDisplayTime();
    const interval = setInterval(updateDisplayTime, 1000);

    return () => clearInterval(interval);
  }, [isVisible, remainingTime]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-orange-200 dark:border-orange-800">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900">
              <AlertTriangle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <CardTitle className="text-xl text-orange-800 dark:text-orange-200">
            Session Timeout Warning
          </CardTitle>
          <CardDescription className="text-orange-600 dark:text-orange-400">
            Your session will expire due to inactivity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <span className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                {displayTime}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Time remaining before automatic logout
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={onExtend}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              <Clock className="mr-2 h-4 w-4" />
              Extend Session
            </Button>
            
            <Button
              onClick={onLogout}
              variant="outline"
              className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900"
              size="lg"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout Now
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Click "Extend Session" to continue working, or you'll be automatically logged out.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
