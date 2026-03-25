import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context-parent';
import SessionTimeoutService from '@/services/auth/session-timeout-service';

interface UseSessionTimeoutOptions {
  timeoutDuration?: number; // in minutes
  warningDuration?: number; // in minutes
  showWarning?: boolean;
  onTimeout?: () => void;
}

export function useSessionTimeout(options: UseSessionTimeoutOptions = {}) {
  const {
    timeoutDuration = 15, // 15 minutes default
    warningDuration = 2, // 2 minutes warning
    showWarning = true,
    onTimeout
  } = options;

  const { logout, isAuthenticated } = useAuth();
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const timeoutServiceRef = useRef<SessionTimeoutService | null>(null);

  // Convert minutes to milliseconds
  const timeoutMs = timeoutDuration * 60 * 1000;
  const warningMs = warningDuration * 60 * 1000;

  useEffect(() => {
    if (!isAuthenticated) {
      // Stop timeout service when not authenticated
      if (timeoutServiceRef.current) {
        timeoutServiceRef.current.stop();
        timeoutServiceRef.current = null;
      }
      setIsActive(false);
      setIsWarningVisible(false);
      return;
    }

    // Create and start timeout service when authenticated
    timeoutServiceRef.current = new SessionTimeoutService({
      timeoutDuration: timeoutMs,
      warningDuration: warningMs,
      onTimeout: () => {
        console.log('Session timeout - logging out user');
        setIsWarningVisible(false);
        setIsActive(false);
        logout();
        if (onTimeout) {
          onTimeout();
        }
      },
      onWarning: (remaining: number) => {
        if (showWarning) {
          console.log(`Session warning - ${Math.ceil(remaining / 1000)} seconds remaining`);
          setIsWarningVisible(true);
          setRemainingTime(remaining);
        }
      },
      onActivity: () => {
        setIsActive(true);
      }
    });

    timeoutServiceRef.current.start();
    setIsActive(true);

    return () => {
      if (timeoutServiceRef.current) {
        timeoutServiceRef.current.destroy();
        timeoutServiceRef.current = null;
      }
    };
  }, [isAuthenticated, timeoutMs, warningMs, showWarning, logout, onTimeout]);

  // Update remaining time display only when warning is visible
  useEffect(() => {
    if (!isWarningVisible) return;

    const interval = setInterval(() => {
      if (timeoutServiceRef.current) {
        const remaining = timeoutServiceRef.current.getRemainingTime();
        setRemainingTime(remaining);

        if (remaining <= 0) {
          setIsWarningVisible(false);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isWarningVisible]);

  const extendSession = () => {
    if (timeoutServiceRef.current) {
      timeoutServiceRef.current.updateActivity();
      setIsWarningVisible(false);
    }
  };

  const getRemainingTime = () => {
    if (timeoutServiceRef.current) {
      return timeoutServiceRef.current.getRemainingTime();
    }
    return 0;
  };

  const getInactivityTime = () => {
    if (timeoutServiceRef.current) {
      return timeoutServiceRef.current.getInactivityTime();
    }
    return 0;
  };

  const isAboutToExpire = () => {
    if (timeoutServiceRef.current) {
      return timeoutServiceRef.current.isAboutToExpire();
    }
    return false;
  };

  return {
    isWarningVisible,
    remainingTime,
    isActive,
    extendSession,
    getRemainingTime,
    getInactivityTime,
    isAboutToExpire
  };
}
