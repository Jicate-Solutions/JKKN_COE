import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { sendVerificationEmail } from '@/services/shared/email-service'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        error: 'Invalid email format' 
      }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Check if user exists in users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, is_active')
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
        error: 'No account found with this email address. Please contact JKKN COE Admin to create your account.' 
      }, { status: 404 })
    }

    if (!user.is_active) {
      return NextResponse.json({ 
        error: 'Your account is inactive. Please contact support for assistance.' 
      }, { status: 403 })
    }

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now

    // Delete any existing verification codes for this email
    await supabase
      .from('verification_codes')
      .delete()
      .eq('email', email.toLowerCase())

    // Insert new verification code
    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        email: email.toLowerCase(),
        code,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Error inserting verification code:', insertError)
      return NextResponse.json({ 
        error: 'Failed to generate verification code' 
      }, { status: 500 })
    }

    // Send verification email
    try {
      await sendVerificationEmail(email, code)
    } catch (emailError) {
      console.error('Error sending verification email:', emailError)
      return NextResponse.json({ 
        error: 'Failed to send verification email' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Verification code sent successfully' 
    }, { status: 200 })

  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}
