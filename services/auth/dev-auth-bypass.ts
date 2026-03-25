/**
 * Development Authentication Bypass
 * This module provides a way to bypass parent app authentication in development
 * WARNING: Only use in development environment!
 */

import { ParentAppUser, AuthSession } from './parent-auth-service';

const DEV_USER: ParentAppUser = {
  id: 'dev-user-001',
  email: 'developer@jkkn.ac.in',
  full_name: 'Development User',
  role: 'admin',
  permissions: {
    'regulations.view': true,
    'regulations.create': true,
    'regulations.edit': true,
    'regulations.delete': true,
    'courses.view': true,
    'courses.create': true,
    'courses.edit': true,
    'courses.delete': true,
    'batches.view': true,
    'batches.create': true,
    'batches.edit': true,
    'batches.delete': true,
    'users.view': true,
    'users.create': true,
    'users.edit': true,
    'users.delete': true
  }
};

const DEV_SESSION: AuthSession = {
  id: 'dev-session-001',
  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  created_at: new Date().toISOString()
};

export class DevAuthBypass {
  static isEnabled(): boolean {
    // Enable dev bypass when:
    // 1. Running on localhost
    // 2. Environment variable is set
    const isDev = process.env.NODE_ENV === 'development';
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
       window.location.hostname === '127.0.0.1');
    const bypassEnabled = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

    return isDev && isLocalhost && bypassEnabled;
  }

  static getUser(): ParentAppUser {
    return DEV_USER;
  }

  static getSession(): AuthSession {
    return DEV_SESSION;
  }

  static login(): void {
    if (!this.isEnabled()) {
      throw new Error('Dev auth bypass is not enabled');
    }

    // Store dev user and session in localStorage
    localStorage.setItem('auth_token', 'dev-access-token');
    localStorage.setItem('refresh_token', 'dev-refresh-token');
    localStorage.setItem('user_data', JSON.stringify(DEV_USER));
    localStorage.setItem('auth_session', JSON.stringify(DEV_SESSION));

    // Reload to trigger auth context
    window.location.href = '/dashboard';
  }

  static logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('auth_session');
    sessionStorage.clear();

    window.location.href = '/';
  }
}