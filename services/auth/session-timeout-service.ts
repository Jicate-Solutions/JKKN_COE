interface SessionTimeoutConfig {
  timeoutDuration: number; // in milliseconds
  warningDuration: number; // in milliseconds
  onTimeout: () => void;
  onWarning?: (remainingTime: number) => void;
  onActivity?: () => void;
}

class SessionTimeoutService {
  private config: SessionTimeoutConfig;
  private timeoutId: NodeJS.Timeout | null = null;
  private warningId: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isActive: boolean = false;
  private warningShown: boolean = false;

  constructor(config: SessionTimeoutConfig) {
    this.config = config;
    this.setupActivityListeners();
  }

  /**
   * Start the session timeout monitoring
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.lastActivity = Date.now();
    this.warningShown = false;
    this.resetTimeout();
  }

  /**
   * Stop the session timeout monitoring
   */
  stop(): void {
    this.isActive = false;
    this.clearTimeouts();
  }

  /**
   * Reset the timeout when user activity is detected
   */
  resetTimeout(): void {
    if (!this.isActive) {
      return;
    }

    this.clearTimeouts();
    this.warningShown = false;

    // Set warning timeout
    this.warningId = setTimeout(() => {
      this.showWarning();
    }, this.config.timeoutDuration - this.config.warningDuration);

    // Set main timeout
    this.timeoutId = setTimeout(() => {
      this.handleTimeout();
    }, this.config.timeoutDuration);

    // Notify activity
    if (this.config.onActivity) {
      this.config.onActivity();
    }
  }

  /**
   * Update last activity time and reset timeout
   */
  updateActivity(): void {
    if (!this.isActive) {
      return;
    }

    this.lastActivity = Date.now();
    this.resetTimeout();
  }

  /**
   * Get remaining time until timeout
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.lastActivity;
    return Math.max(0, this.config.timeoutDuration - elapsed);
  }

  /**
   * Check if session is about to expire
   */
  isAboutToExpire(): boolean {
    return this.getRemainingTime() <= this.config.warningDuration;
  }

  /**
   * Get time since last activity
   */
  getInactivityTime(): number {
    return Date.now() - this.lastActivity;
  }

  private setupActivityListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // List of events that indicate user activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown',
      'wheel'
    ];

    // Throttle activity updates to prevent excessive calls
    let activityThrottle: NodeJS.Timeout | null = null;
    const throttledUpdate = () => {
      if (activityThrottle) {
        clearTimeout(activityThrottle);
      }
      activityThrottle = setTimeout(() => {
        this.updateActivity();
      }, 1000); // Update at most once per second
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, throttledUpdate, true);
    });

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateActivity();
      }
    });

    // Handle focus events
    window.addEventListener('focus', () => {
      this.updateActivity();
    });
  }

  private showWarning(): void {
    if (this.warningShown || !this.isActive) {
      return;
    }

    this.warningShown = true;
    const remainingTime = this.getRemainingTime();
    
    if (this.config.onWarning) {
      this.config.onWarning(remainingTime);
    }
  }

  private handleTimeout(): void {
    if (!this.isActive) {
      return;
    }

    this.stop();
    this.config.onTimeout();
  }

  private clearTimeouts(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.warningId) {
      clearTimeout(this.warningId);
      this.warningId = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    // Note: Event listeners are not removed as they're added to document
    // In a real app, you might want to track and remove them
  }
}

export default SessionTimeoutService;
