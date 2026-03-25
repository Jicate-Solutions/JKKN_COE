'use client';

import { useEffect, useRef, useState } from 'react';
import { googleAuthService } from '@/services/auth/google-auth-service';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  theme?: 'outline' | 'filled' | 'filled_blue' | 'filled_black';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  className = '',
  size = 'large',
  theme = 'filled_blue',
  text = 'continue_with',
  shape = 'rectangular',
  width
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initializeGoogle = async () => {
      try {
        // Load Google Sign-In script
        if (!window.google) {
          await googleAuthService.initializeGoogleSignIn();
        }

        // Initialize Google Sign-In
        if (window.google && buttonRef.current) {
          window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            callback: async (response: any) => {
              setIsLoading(true);
              setError(null);

              const result = await googleAuthService.handleGoogleSignIn(response);

              if (result.success) {
                onSuccess?.();
                // Redirect to dashboard
                router.push('/dashboard');
              } else {
                const errorMsg = result.error || 'Authentication failed';
                setError(errorMsg);
                onError?.(errorMsg);
              }

              setIsLoading(false);
            },
          });

          // Render the button
          window.google.accounts.id.renderButton(buttonRef.current, {
            type: 'standard',
            size,
            theme,
            text,
            shape,
            width,
          });
        }
      } catch (err) {
        console.error('Error initializing Google Sign-In:', err);
        setError('Failed to initialize Google Sign-In');
      }
    };

    initializeGoogle();
  }, [size, theme, text, shape, width, onSuccess, onError, router]);

  // Fallback button in case Google button doesn't render
  const handleFallbackClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Initialize if needed
      if (!window.google) {
        await googleAuthService.initializeGoogleSignIn();
      }

      // Trigger sign-in prompt
      if (window.google) {
        window.google.accounts.id.prompt();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {/* Google Sign-In Button Container */}
      <div ref={buttonRef} className="flex justify-center">
        {/* Fallback button (hidden when Google button renders) */}
        <Button
          onClick={handleFallbackClick}
          disabled={isLoading}
          variant="outline"
          className="w-full google-signin-fallback"
          style={{ display: 'none' }}
        >
          {isLoading ? (
            <span className="animate-spin">Loading...</span>
          ) : (
            <>
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </>
          )}
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Add styles to show fallback when Google button doesn't render */}
      <style jsx>{`
        :global(.google-signin-fallback) {
          display: flex !important;
        }
        :global(#g_id_onload ~ .google-signin-fallback) {
          display: none !important;
        }
      `}</style>
    </div>
  );
}