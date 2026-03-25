'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Force this page to be dynamic (not prerendered)
export const dynamic = 'force-dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ArrowLeft, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import supabaseAuthService from '@/services/auth/supabase-auth-service';
import { useToast } from '@/hooks/common/use-toast';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const { toast } = useToast();
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      router.push('/login');
      return;
    }

    // Prefetch dashboard to speed up post-verify navigation
    router.prefetch('/dashboard');

    // Start countdown timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [email, router]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (index: number, value: string) => {
    if (value.length > 1) return; // Only allow single character
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
    setCode(newCode);
    
    // Focus the last filled input
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleVerify = async () => {
    const verificationCode = code.join('');
    
    if (verificationCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          code: verificationCode,
        }),
      });

      if (!response.ok) {
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          try {
            const text = await response.text();
            data = { error: text };
          } catch {}
        }
        const message = data?.error || 'Verification failed';
        setError(message);
        toast({
          title: '❌ Operation Failed',
          description: 'Failed to save record. Please try again.',
          variant: 'destructive',
          className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
        });
        return;
      }

      // Parse JSON and set session in the background without blocking navigation
      ;(async () => {
        try {
          const data = await response.clone().json();
          if (data.accessToken && data.refreshToken) {
            const supabase = supabaseAuthService.getSupabaseClient();
            await supabase.auth.setSession({
              access_token: data.accessToken,
              refresh_token: data.refreshToken
            });
          }
        } catch {}
      })();

      toast({
        title: '✅ Email Verified',
        description: 'Your email has been successfully verified.',
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      });

      // Redirect to dashboard immediately after success (cookies already set by server)
      if (typeof window !== 'undefined') {
        window.location.replace('/dashboard');
        return;
      } else {
        router.replace('/dashboard');
        return;
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      toast({
        title: '❌ Operation Failed',
        description: 'Failed to save record. Please try again.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        try {
          const text = await response.text();
          data = { error: text };
        } catch {}
      }

      if (!response.ok) {
        const message = data?.error || 'Failed to resend code';
        throw new Error(message);
      }

      setTimeLeft(300);
      setCanResend(false);
      setCode(['', '', '', '', '', '']);
      
      // Focus first input
      inputRefs.current[0]?.focus();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
      toast({
        title: '❌ Operation Failed',
        description: 'Failed to save record. Please try again.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 dark:from-slate-900 dark:via-slate-800 dark:to-green-900/20 p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Email Verified!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Your email has been successfully verified. Redirecting to dashboard...
            </p>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-green-500 border-t-transparent mx-auto"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 dark:from-slate-900 dark:via-slate-800 dark:to-green-900/20 p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Verify your email
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400 text-base">
            We've sent a 6-digit verification code to{' '}
            <span className="font-semibold text-green-600 dark:text-green-400">
              {email}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-8 pb-8">
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Verification Code Input */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Enter verification code
            </Label>
            <div className="flex justify-center space-x-2">
              {code.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="w-12 h-12 text-center text-xl font-bold border-2 focus:border-green-500 focus:ring-green-500"
                  disabled={isLoading}
                />
              ))}
            </div>
          </div>

          {/* Timer and Resend */}
          <div className="text-center space-y-4">
            {timeLeft > 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Code expires in{' '}
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  {formatTime(timeLeft)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Code has expired
              </p>
            )}

            {canResend && (
              <Button
                type="button"
                variant="outline"
                onClick={handleResendCode}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend Code'
                )}
              </Button>
            )}
          </div>

          {/* Verify Button */}
          <Button
            type="button"
            onClick={handleVerify}
            disabled={isLoading || code.join('').length !== 6}
            className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-0 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Email'
            )}
          </Button>

          {/* Back to Login */}
          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center text-sm text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}