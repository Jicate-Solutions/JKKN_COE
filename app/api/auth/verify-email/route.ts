import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json()

    if (!email || !code) {
      return NextResponse.json({ 
        error: 'Email and code are required' 
      }, { status: 400 })
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ 
        error: 'Invalid verification code format' 
      }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Find the verification code
    const { data: verificationCode, error: codeError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('code', code)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (codeError || !verificationCode) {
      return NextResponse.json({ 
        error: 'Invalid or expired verification code' 
      }, { status: 400 })
    }

    // Mark code as used - atomic update to prevent race conditions
    const { data: updateResult, error: updateError } = await supabase
      .from('verification_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', verificationCode.id)
      .is('used_at', null) // Only update if not already used
      .select()

    // Verify the update succeeded (code wasn't already used by concurrent request)
    if (updateError || !updateResult || updateResult.length === 0) {
      return NextResponse.json({
        error: 'Verification code has already been used'
      }, { status: 400 })
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle() // Use maybeSingle() instead of single() to avoid error when no user found

    if (userError) {
      console.error('Error checking user:', userError)
      return NextResponse.json({ 
        error: 'Database error occurred. Please try again.' 
      }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found. Please contact JKKN COE Admin to create your account.' 
      }, { status: 404 })
    }

    if (!user.is_active) {
      return NextResponse.json({ 
        error: 'Account is inactive' 
      }, { status: 403 })
    }

    // Create session using Supabase Auth
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create a magic link and use the email_otp to mint a session
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      }
    })

    if (sessionError || !sessionData) {
      console.error('Error creating session link:', sessionError)
      return NextResponse.json({ 
        error: 'Failed to create session' 
      }, { status: 500 })
    }

    const emailOtp = sessionData?.properties?.email_otp
    if (!emailOtp) {
      console.error('email_otp not returned from generateLink')
      return NextResponse.json({ 
        error: 'Failed to generate authentication tokens' 
      }, { status: 500 })
    }

    // Verify the OTP to create a session and obtain tokens
    const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
      email: user.email,
      token: emailOtp,
      type: 'email'
    })

    if (verifyError || !verifyData?.session) {
      console.error('Error verifying OTP to create session:', verifyError)
      return NextResponse.json({ 
        error: 'Failed to generate authentication tokens' 
      }, { status: 500 })
    }

    const accessToken = verifyData.session.access_token
    const refreshToken = verifyData.session.refresh_token

    // Set cookies for the session
    const response = NextResponse.json({ 
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name
      },
      // Return tokens so the client can initialize its Supabase session
      accessToken,
      refreshToken
    }, { status: 200 })

    // Set secure HTTP-only cookies
    response.cookies.set('sb-access-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    response.cookies.set('sb-refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    })

    // Also set a lightweight user profile cache so middleware can skip DB on first hit
    response.cookies.set('user_profile', JSON.stringify({
      id: user.id,
      email: user.email,
      is_active: true,
      role: 'user',
      cached_at: Date.now()
    }), {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/'
    })

    return response

  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}