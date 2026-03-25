/**
 * Session Validator
 * Handles session validation without relying on parent app's Supabase
 */

export interface SessionValidationResult {
  isValid: boolean;
  error?: string;
  shouldRefresh?: boolean;
}

export class SessionValidator {
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

  /**
   * Validates a session locally without hitting parent app's Supabase
   */
  static validateSession(sessionData: {
    lastActivityAt?: string | Date;
    expiresAt?: string | Date;
  }): SessionValidationResult {
    try {
      const now = Date.now();

      // Check if session has activity timeout
      if (sessionData.lastActivityAt) {
        const lastActivity = new Date(sessionData.lastActivityAt).getTime();
        const timeSinceActivity = now - lastActivity;

        if (timeSinceActivity > this.SESSION_TIMEOUT) {
          return {
            isValid: false,
            error: 'Session expired due to inactivity'
          };
        }
      }

      // Check if session has absolute expiry
      if (sessionData.expiresAt) {
        const expiryTime = new Date(sessionData.expiresAt).getTime();
        const timeToExpiry = expiryTime - now;

        if (timeToExpiry <= 0) {
          return {
            isValid: false,
            error: 'Session has expired'
          };
        }

        // Check if session needs refresh soon
        if (timeToExpiry <= this.REFRESH_THRESHOLD) {
          return {
            isValid: true,
            shouldRefresh: true
          };
        }
      }

      return {
        isValid: true,
        shouldRefresh: false
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        isValid: false,
        error: 'Failed to validate session'
      };
    }
  }

  /**
   * Updates local session activity timestamp
   */
  static updateSessionActivity(): void {
    const sessionKey = 'coe_session_activity';
    const now = new Date().toISOString();

    try {
      localStorage.setItem(sessionKey, now);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  /**
   * Gets the last session activity timestamp
   */
  static getLastActivity(): Date | null {
    const sessionKey = 'coe_session_activity';

    try {
      const lastActivity = localStorage.getItem(sessionKey);
      return lastActivity ? new Date(lastActivity) : null;
    } catch (error) {
      console.error('Failed to get session activity:', error);
      return null;
    }
  }

  /**
   * Clears session data
   */
  static clearSession(): void {
    try {
      localStorage.removeItem('coe_session_activity');
      localStorage.removeItem('coe_session_data');
      sessionStorage.clear();
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }
}