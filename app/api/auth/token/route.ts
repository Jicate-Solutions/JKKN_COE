import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Missing authorization code' },
        { status: 400 }
      );
    }

    // Validate required environment variables
    const parentAppUrl = process.env.NEXT_PUBLIC_PARENT_APP_URL
    const appId = process.env.NEXT_PUBLIC_APP_ID
    const apiKey = process.env.API_KEY // Server-side only key
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI

    if (!parentAppUrl || !appId || !apiKey || !redirectUri) {
      console.error('Missing environment variables:', {
        parentAppUrl: !!parentAppUrl,
        appId: !!appId,
        apiKey: !!apiKey,
        redirectUri: !!redirectUri,
      })
      return NextResponse.json(
        { error: 'Authentication configuration error' },
        { status: 500 }
      )
    }

    // Exchange code with parent app
    const tokenResponse = await fetch(
      `${parentAppUrl}/api/auth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          app_id: appId,
          api_key: apiKey, // In request body, not header
          redirect_uri: redirectUri,
        }),
      }
    )

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json()
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error,
        requestDetails: {
          url: `${parentAppUrl}/api/auth/token`,
          app_id: appId,
          redirect_uri: redirectUri,
          hasApiKey: !!apiKey,
        },
      })
      return NextResponse.json(
        { error: error.error || error.error_description || 'Token exchange failed' },
        { status: tokenResponse.status }
      )
    }

    const tokenData = await tokenResponse.json();

    console.log('Token exchange successful:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      hasUser: !!tokenData.user,
      userEmail: tokenData.user?.email
    });

    // Return tokens to frontend
    return NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      user: tokenData.user
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
