import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { googleAuthService, GoogleUser } from '@/services/auth/google-auth-service';

interface UseAuthGuardOptions {
  requiredRole?: string;
  requiredRoles?: string[];
  redirectTo?: string;
  allowedIfAnyRole?: boolean;
}

interface AuthGuardState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: GoogleUser | null;
  hasAccess: boolean;
}

export function useAuthGuard(options: UseAuthGuardOptions = {}): AuthGuardState {
  const {
    requiredRole,
    requiredRoles = [],
    redirectTo = '/login',
    allowedIfAnyRole = true,
  } = options;

  const router = useRouter();
  const [state, setState] = useState<AuthGuardState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    hasAccess: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if token exists
        const token = googleAuthService.getToken();

        if (!token) {
          // No token, redirect to login
          router.push(redirectTo);
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            hasAccess: false,
          });
          return;
        }

        // Verify token with backend
        const { valid, user } = await googleAuthService.verifyToken(token);

        if (!valid || !user) {
          // Invalid token, redirect to login
          googleAuthService.clearAuthData();
          router.push(redirectTo);
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            hasAccess: false,
          });
          return;
        }

        // Check role-based access if specified
        let hasAccess = true;

        if (requiredRole) {
          hasAccess = user.role === requiredRole;
        } else if (requiredRoles.length > 0) {
          if (allowedIfAnyRole) {
            hasAccess = requiredRoles.includes(user.role);
          } else {
            // Would need to support multiple roles per user for this
            hasAccess = requiredRoles.includes(user.role);
          }
        }

        if (!hasAccess) {
          // User authenticated but doesn't have required role
          router.push('/unauthorized');
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          user,
          hasAccess,
        });
      } catch (error) {
        console.error('Auth guard error:', error);

        // On error, redirect to login
        googleAuthService.clearAuthData();
        router.push(redirectTo);
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          hasAccess: false,
        });
      }
    };

    checkAuth();
  }, [requiredRole, requiredRoles, redirectTo, allowedIfAnyRole, router]);

  return state;
}

// Higher-order component for protecting pages
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: UseAuthGuardOptions
): React.FC<P> {
  return function ProtectedComponent(props: P) {
    const { isLoading, hasAccess } = useAuthGuard(options);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (!hasAccess) {
      return null; // Router will handle redirect
    }

    return <Component {...props} />;
  };
}