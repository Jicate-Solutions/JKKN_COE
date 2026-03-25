'use client';

import { ReactNode, useCallback } from 'react';
import { useSessionTimeout } from '@/hooks/auth/use-session-timeout';
import { SessionTimeoutWarning } from '@/components/common/session-timeout-warning';
import { useAuth } from '@/lib/auth/auth-context-parent';

interface SessionTimeoutProviderProps {
  children: ReactNode;
  timeoutDuration?: number; // in minutes
  warningDuration?: number; // in minutes
}

export function SessionTimeoutProvider({
  children,
  timeoutDuration = 15,
  warningDuration = 2
}: SessionTimeoutProviderProps) {
  const { logout } = useAuth();
  
  const {
    isWarningVisible,
    remainingTime,
    extendSession
  } = useSessionTimeout({
    timeoutDuration,
    warningDuration,
    showWarning: true,
    onTimeout: () => {
      console.log('Session timeout - user will be logged out');
    }
  });

  const handleExtendSession = useCallback(() => {
    extendSession();
  }, [extendSession]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  return (
    <>
      {children}
      <SessionTimeoutWarning
        isVisible={isWarningVisible}
        remainingTime={remainingTime}
        onExtend={handleExtendSession}
        onLogout={handleLogout}
      />
    </>
  );
}
