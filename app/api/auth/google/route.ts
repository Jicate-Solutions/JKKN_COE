import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'ID token is required' },
        { status: 400 }
      );
    }

    // Verify Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token payload' },
        { status: 401 }
      );
    }

    const { email, name, sub: googleId, picture } = payload;

    // Check if user exists in the users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: 'This user cannot access the portal',
          details: 'User not found in the system'
        },
        { status: 403 }
      );
    }

    // Check if user has a valid role
    if (!user.role) {
      return NextResponse.json(
        {
          error: 'This user cannot access the portal',
          details: 'User role not assigned'
        },
        { status: 403 }
      );
    }

    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        {
          error: 'This user cannot access the portal',
          details: 'User account is inactive'
        },
        { status: 403 }
      );
    }

    // Update user's Google ID and avatar URL if needed
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Update Google ID if not already set
    if (!user.google_id) {
      updateData.google_id = googleId;
    }

    // Update avatar URL if not available or different from Google profile
    if (!user.avatar_url || (picture && picture !== user.avatar_url)) {
      updateData.avatar_url = picture;
      console.log('Updating avatar URL from Google profile:', picture);
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length > 1) { // More than just updated_at
      await supabase
        .from('users')
        .update(updateData)
        .eq('email', email);
    }

    // Create JWT token for session
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name || name,
        picture: picture
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Return success response with token and user data
    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || name,
        role: user.role,
        picture: picture,
        avatar_url: updateData.avatar_url || user.avatar_url || picture
      }
    });

  } catch (error) {
    console.error('Google authentication error:', error);
    return NextResponse.json(
      {
        error: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}