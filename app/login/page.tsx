'use client';

import { useEffect, useState, Suspense } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth/auth-context-parent';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, Users as UsersIcon, Shield, Lock, ArrowRight, CheckCircle, Crown, Mail, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { AppFooter } from '@/components/layout/app-footer';

function LoginContent() {
  const { loginWithGoogle, isAuthenticated, loading: isLoading, error } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [logoOk, setLogoOk] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Check if we're processing OAuth callback (token in URL)
  const hasTokenInUrl = searchParams.get('token') !== null;

  // After Google re-auth via Supabase, auto-trigger normal parent authorize flow
  const isReauthComplete = searchParams.get('reauth') === 'complete';

  useEffect(() => {
		if (isReauthComplete && !isAuthenticated && !isLoading) {
			// Clean URL and trigger normal login flow (step 2 of re-auth)
			router.replace('/login', { scroll: false });
			loginWithGoogle();
			return;
		}
		if (isAuthenticated && !hasTokenInUrl) {
			const redirectParam = searchParams.get('redirect');
			if (typeof window !== 'undefined') {
				window.location.replace(redirectParam || '/dashboard');
			} else {
				router.replace(redirectParam || '/dashboard');
			}
		}
  }, [isAuthenticated, router, searchParams, hasTokenInUrl, isReauthComplete, isLoading, loginWithGoogle]);

	useEffect(() => {
		// Prefetch dashboard to speed up post-login navigation
		router.prefetch('/dashboard');
		setShowFeatures(true);
	}, [router]);


  useEffect(() => {
    // Check for error cookie instead of URL parameter
    const cookies = document.cookie.split('; ');
    const errorCookie = cookies.find(row => row.startsWith('auth_error='));

    if (errorCookie) {
      const errorValue = errorCookie.split('=')[1];
      if (errorValue === 'not_found') {
        setFormError('Your account wasn\'t found in our system. Check your login details, or contact support if you need help.');
        // Clear the cookie
        document.cookie = 'auth_error=; path=/; max-age=0';
      }
    }

    // Also check URL params for backward compatibility but don't show in URL
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    if (errorParam) {
      if (errorParam === 'oauth_state_invalid') {
        setFormError('Authentication session expired. Please try logging in again.');
      } else if (errorParam === 'oauth_code_expired') {
        setFormError('Authentication code expired. Please try logging in again.');
      } else if (errorParam === 'oauth_invalid_request') {
        setFormError('Invalid authentication request. Please try logging in again.');
      } else if (errorParam === 'invalid_request' && errorDescription?.includes('bad_oauth_state')) {
        setFormError('Authentication session expired. Please try logging in again.');
      } else {
        setFormError('Your account wasn\'t found in our system. Check your login details, or contact support if you need help.');
      }
      // Clean the URL
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router]);

  const handleGoogleLogin = () => {
    setFormError(null);
    const redirectParam = searchParams.get('redirect');
    loginWithGoogle(redirectParam || undefined);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setIsEmailLoading(true);

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      // Redirect to verification page
      router.push(`/verify-email?email=${encodeURIComponent(email.toLowerCase())}`);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailError(null);
  };

  // Don't show loading screen if user is already authenticated
  if (isAuthenticated) {
    return null;
  }

  // Show fast loading screen when processing OAuth callback (token in URL)
  if (hasTokenInUrl) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 dark:from-slate-900 dark:via-slate-800 dark:to-green-900/20'>
        <div className='flex flex-col items-center space-y-4'>
          <div className='animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent'></div>
          <p className='text-sm text-muted-foreground animate-pulse'>Completing authentication...</p>
        </div>
      </div>
    );
  }

  // Only show loading screen during actual login process, not during initial auth check
  if (isLoading && !isAuthenticated) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 dark:from-slate-900 dark:via-slate-800 dark:to-green-900/20'>
        <div className='flex flex-col items-center space-y-4'>
          <div className='animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent'></div>
          <p className='text-sm text-muted-foreground animate-pulse'>Signing you in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen w-full bg-gradient-to-br from-slate-50 via-green-50 to-[#16a34a]/20 dark:from-slate-900 dark:via-slate-800 dark:to-[#16a34a]/30 flex items-center justify-center p-4 relative'>
      {/* Texture Overlay */}
      <div className='absolute inset-0 opacity-30 dark:opacity-20'>
        <div className='absolute inset-0' style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23059669' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }}></div>
      </div>

      {/* Background Pattern */}
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute -top-40 -right-40 w-80 h-80 bg-[#16a34a]/20 rounded-full blur-3xl animate-pulse'></div>
        <div className='absolute -bottom-40 -left-40 w-80 h-80 bg-[#16a34a]/20 rounded-full blur-3xl animate-pulse delay-1000'></div>
        <div className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#16a34a]/10 rounded-full blur-3xl animate-pulse delay-500'></div>
        
        {/* Additional texture elements */}
        <div className='absolute top-20 left-20 w-32 h-32 bg-[#16a34a]/10 rounded-full blur-2xl animate-pulse delay-700'></div>
        <div className='absolute bottom-20 right-20 w-24 h-24 bg-[#16a34a]/15 rounded-full blur-xl animate-pulse delay-300'></div>
      </div>

      {/* Hexagonal texture overlay */}
      <div className='absolute inset-0 opacity-20 dark:opacity-30' style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='hexagons' x='0' y='0' width='50' height='43.4' patternUnits='userSpaceOnUse'%3E%3Cpolygon points='25,0 50,14.4 50,28.9 25,43.4 0,28.9 0,14.4' fill='none' stroke='%2316a34a' stroke-width='0.5' opacity='0.3'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23hexagons)'/%3E%3C/svg%3E")`,
        backgroundSize: '100px 100px'
      }}></div>

      {/* Noise texture overlay */}
      <div className='absolute inset-0 opacity-[0.02] dark:opacity-[0.05]' style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        backgroundSize: '200px 200px'
      }}></div>

      <div className='relative w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-center'>
        {/* Left Side - Branding & Features */}
        <div className='hidden lg:flex flex-col justify-center space-y-8 text-center lg:text-left relative'>
          {/* Left side texture overlay */}
          <div className='absolute inset-0 opacity-10' style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23059669' fill-opacity='0.1'%3E%3Cpath d='M40 40c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm20 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '80px 80px'
          }}></div>
          
          <div className='space-y-6 relative z-10'>
            {/* JKKN Logo with Crown */}
            <div className='flex flex-col items-center lg:items-start space-y-3 relative'>
              {/* Logo background pattern */}
              <div className='absolute inset-0 opacity-5' style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23059669' fill-opacity='0.3'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundSize: '60px 60px'
              }}></div>
              
              {/* Crown Icon */}
              <div className='flex justify-center lg:justify-start relative z-10'>
                <Crown className='h-8 w-8 text-green-600 dark:text-green-400 drop-shadow-lg' />
              </div>
              
              {/* JKKN | COE Text */}
              <div className='text-4xl lg:text-5xl font-extrabold tracking-widest text-green-600 dark:text-green-400 drop-shadow-lg relative z-10'>
                JKKN 
              </div>
              
              {/* Pink Separator Line */}
              <div className='w-24 h-1 bg-pink-500 dark:bg-pink-400 rounded-full mx-auto lg:mx-0 relative z-10'></div>
              
              {/* Tagline */}
              <div className='text-xl lg:text-2xl font-serif italic text-pink-500 dark:text-pink-400 drop-shadow-lg text-center lg:text-left relative z-10'>
                Your Success - Our Tradition
              </div>
            </div>
            
            {/* Institution Info */}
            <div className='space-y-2 text-center lg:text-left'>
              <h1 className='text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white leading-tight'>
                Educational Institution
              </h1>
              <p className='text-lg text-slate-600 dark:text-slate-300 font-medium'>
                Controller of Examination Portal
              </p>
            </div>
          </div>

          {/* Features List */}
          <div className={`space-y-4 transition-all duration-700 ${showFeatures ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className='flex items-center space-x-3 text-slate-700 dark:text-slate-300'>
              <CheckCircle className='h-5 w-5 text-green-500 flex-shrink-0' />
              <span>India's First AI Empowered College</span>
            </div>
            <div className='flex items-center space-x-3 text-slate-700 dark:text-slate-300'>
             
              <span></span>
            </div>
            <div className='flex items-center space-x-3 text-slate-700 dark:text-slate-300'>
             
              <span></span>
            </div>
            <div className='flex items-center space-x-3 text-slate-700 dark:text-slate-300'>
             
              <span></span>
            </div>
            
      </div>

        
        </div>

        {/* Right Side - Login Card */}
        <div className='w-full max-w-md mx-auto'>
          <Card className='shadow-2xl border-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02] relative overflow-hidden'>
            {/* Card texture overlay */}
            <div className='absolute inset-0 opacity-20 dark:opacity-10' style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23059669' fill-opacity='0.1'%3E%3Cpath d='M20 20c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10zm10 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z'/%3E%3C/g%3E%3C/svg%3E")`,
              backgroundSize: '40px 40px'
            }}></div>
            
            {/* Subtle gradient overlay */}
            <div className='absolute inset-0 bg-gradient-to-br from-green-50/30 to-emerald-50/20 dark:from-green-900/10 dark:to-emerald-900/5'></div>
            <CardHeader className='text-center pb-8 pt-8 relative z-10'>
            <div className='mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden'>
              {/* Button texture */}
              <div className='absolute inset-0 opacity-20' style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.2'%3E%3Ccircle cx='10' cy='10' r='0.5'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundSize: '20px 20px'
              }}></div>
              <Lock className='h-8 w-8 text-white relative z-10' />
            </div>
              <CardTitle className='text-2xl font-bold text-slate-800 dark:text-white mb-2'>
                Welcome Back
              </CardTitle>
              <CardDescription className='text-slate-600 dark:text-slate-400 text-base'>
                Sign in to your JKKN | COE Portal account
          </CardDescription>
        </CardHeader>
            
            <CardContent className='space-y-6 px-8 pb-8 relative z-10'>
          {(error || formError) && (
                <div className='rounded-xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800 animate-in slide-in-from-top-2 duration-300'>
              <div className='flex items-start gap-3'>
                    <Info className='h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5' />
                    <p className='text-sm text-red-700 dark:text-red-300 font-medium'>
                  {error || formError}
                </p>
              </div>
            </div>
          )}

          {/* Google Sign-In Button */}
          <Button
            type='button'
            onClick={handleGoogleLogin}
            disabled={isLoading}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className='w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-0 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden'
            size='lg'
          >
                {/* Button texture overlay */}
                <div className='absolute inset-0 opacity-10' style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.3'%3E%3Ccircle cx='15' cy='15' r='0.5'/%3E%3C/g%3E%3C/svg%3E")`,
                  backgroundSize: '30px 30px'
                }}></div>
                <div className='flex items-center justify-center space-x-3 relative z-10'>
                  <svg className='h-5 w-5' viewBox='0 0 24 24'>
              <path
                fill='currentColor'
                d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
              />
              <path
                fill='currentColor'
                d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
              />
              <path
                fill='currentColor'
                d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
              />
              <path
                fill='currentColor'
                d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
              />
            </svg>
                  <span>Continue with Google</span>
                  {isHovered && <ArrowRight className='h-4 w-4 transition-transform duration-200' />}
                </div>
          </Button>

          {/* Divider */}
          <div className='relative my-6'>
            <div className='absolute inset-0 flex items-center'>
              <div className='w-full border-t border-slate-200 dark:border-slate-700'></div>
            </div>
            <div className='relative flex justify-center text-sm'>
              <span className='px-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400'>or</span>
            </div>
          </div>

          {/* Email Login Section */}
          {!showEmailForm ? (
            <Button
              type='button'
              onClick={() => setShowEmailForm(true)}
              variant='outline'
              className='w-full h-12 border-2 border-slate-200 dark:border-slate-700 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl font-semibold text-base transition-all duration-300'
              size='lg'
            >
              <Mail className='mr-3 h-5 w-5' />
              Continue with Email
            </Button>
          ) : (
            <div className='space-y-4'>
              <div className='flex items-center justify-between mb-4'>
                <h3 className='text-lg font-semibold text-slate-800 dark:text-white'>Sign in with Email</h3>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    setShowEmailForm(false);
                    setEmail('');
                    setEmailError(null);
                  }}
                  className='text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                >
                  <ArrowLeft className='h-4 w-4 mr-1' />
                  Back
                </Button>
              </div>

              <form onSubmit={handleEmailSubmit} className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='email' className='text-sm font-semibold text-slate-700 dark:text-slate-300'>
                    Email Address
                  </Label>
                  <Input
                    id='email'
                    type='email'
                    value={email}
                    onChange={handleEmailChange}
                    placeholder='Enter your email address'
                    className='h-12 text-base'
                    required
                    disabled={isEmailLoading}
                  />
                  {emailError && (
                    <div className='flex items-center gap-2 text-sm text-red-600 dark:text-red-400'>
                      <Info className='h-4 w-4' />
                      {emailError}
                    </div>
                  )}
                </div>

                <Button
                  type='submit'
                  disabled={isEmailLoading || !email.trim()}
                  className='w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-300'
                >
                  {isEmailLoading ? (
                    <>
                      <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                      Sending Code...
                    </>
                  ) : (
                    <>
                      <Mail className='mr-2 h-4 w-4' />
                      Send Verification Code
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Security Note */}
          <div className='text-center space-y-2'>
            <div className='flex items-center justify-center space-x-2 text-xs text-slate-500 dark:text-slate-400'>
              <Shield className='h-3 w-3 text-green-500' />
              <span>Your data is protected with enterprise security</span>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>

      {/* Footer */}
      <div className='absolute bottom-4 left-0 right-0 flex justify-center'>
        <div className='text-slate-600 font-bold dark:text-slate-400 text-xs px-4 text-center' >
        Developed by JKKN Educational Institution © {currentYear}. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className='flex items-center justify-center min-h-screen bg-background'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}