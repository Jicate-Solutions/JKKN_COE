import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  role: string;
  picture?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: GoogleUser;
  error?: string;
  details?: string;
}

class GoogleAuthService {
  private tokenKey = 'auth_token';
  private userKey = 'auth_user';

  // Initialize Google Sign-In
  async initializeGoogleSignIn(): Promise<void> {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }

  // Handle Google Sign-In response
  async handleGoogleSignIn(response: any): Promise<AuthResponse> {
    try {
      const idToken = response.credential;

      // Send ID token to backend for verification
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Store token and user data
        this.saveAuthData(data.token, data.user);
        return {
          success: true,
          token: data.token,
          user: data.user,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Authentication failed',
          details: data.details,
        };
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      return {
        success: false,
        error: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Verify token validity
  async verifyToken(token?: string): Promise<{ valid: boolean; user?: GoogleUser }> {
    const authToken = token || this.getToken();

    if (!authToken) {
      return { valid: false };
    }

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          this.saveAuthData(authToken, data.user);
          return { valid: true, user: data.user };
        }
      }

      // Token invalid or expired
      this.clearAuthData();
      return { valid: false };
    } catch (error) {
      console.error('Token verification error:', error);
      this.clearAuthData();
      return { valid: false };
    }
  }

  // Save authentication data
  saveAuthData(token: string, user: GoogleUser): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.userKey, JSON.stringify(user));
    }
  }

  // Get stored token
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  // Get stored user
  getUser(): GoogleUser | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem(this.userKey);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Clear authentication data
  clearAuthData(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    this.clearAuthData();

    // Revoke Google access if available
    if (typeof window !== 'undefined' && (window as any).google) {
      try {
        (window as any).google.accounts.id.disableAutoSelect();
      } catch (error) {
        console.error('Google sign-out error:', error);
      }
    }
  }

  // Create authorization header
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}

export const googleAuthService = new GoogleAuthService();