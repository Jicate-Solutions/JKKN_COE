import { createClient } from '@supabase/supabase-js'

interface SendWelcomeEmailParams {
  to: string
  name: string
  loginUrl: string
  temporaryPassword?: string
}

interface SendVerificationEmailParams {
  to: string
  code: string
}

export async function sendWelcomeEmail({ to, name, loginUrl, temporaryPassword }: SendWelcomeEmailParams) {
  // Check if Supabase is configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Email service not configured. Supabase credentials missing.')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Send email using Supabase Edge Function or direct SMTP
    const emailHtml = generateWelcomeEmailHTML(name, loginUrl, temporaryPassword)

    // Call Supabase Edge Function for sending email
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to,
        subject: 'Welcome to JKKN College of Engineering - Your Account is Ready',
        html: emailHtml,
      },
    })

    if (error) {
      console.error('Failed to send welcome email:', error)
      return { success: false, error: error.message }
    }

    console.log('Email sent successfully via Supabase')
    return { success: true, data }
  } catch (error) {
    console.error('Error sending welcome email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function generateWelcomeEmailHTML(name: string, loginUrl: string, temporaryPassword?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to JKKN COE</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to JKKN COE</h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">Your account has been created successfully</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px;">Hello ${name},</h2>

              <p style="margin: 0 0 15px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                Your account has been created on the JKKN College of Engineering portal. You can now access the system using your credentials.
              </p>

              ${temporaryPassword ? `
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #333333; font-weight: bold;">Your Login Credentials:</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Temporary Password:</strong> ${temporaryPassword}</p>
                <p style="margin: 10px 0 0 0; color: #dc3545; font-size: 14px;">
                  <strong>Important:</strong> Please change your password after your first login.
                </p>
              </div>
              ` : ''}

              <div style="margin: 30px 0; text-align: center;">
                <a href="${loginUrl}" style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  Login to Your Account
                </a>
              </div>

              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.5;">
                If you have any questions or need assistance, please contact our support team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; color: #999999; font-size: 14px;">
                JKKN College of Engineering
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export async function sendVerificationEmail(to: string, code: string) {
  // Check if Supabase is configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Email service not configured. Supabase credentials missing.')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Send email using Supabase Edge Function or direct SMTP
    const emailHtml = generateVerificationEmailHTML(to, code)

    // Call Supabase Edge Function for sending email
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to,
        subject: `${code} - JKKN COE Sign-in Verification`,
        html: emailHtml,
      },
    })

    if (error) {
      console.error('Failed to send verification email:', error)
      return { success: false, error: error.message }
    }

    console.log('Verification email sent successfully via Supabase')
    return { success: true, data }
  } catch (error) {
    console.error('Error sending verification email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function generateVerificationEmailHTML(email: string, code: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JKKN COE Sign-in Verification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; background: linear-gradient(135deg, #16a34a 0%, #059669 100%); text-align: center;">
              <div style="width: 60px; height: 60px; background-color: #ffffff; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <div style="width: 40px; height: 40px; background-color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <div style="width: 20px; height: 20px; background-color: #ffffff; border-radius: 50%;"></div>
                </div>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Verify your email to sign in to JKKN COE</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px;">Hello <strong>${email.split('@')[0]},</strong></p>

              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                We have received a sign-in attempt from <strong>Coimbatore, India.</strong>
              </p>

              <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                To complete the sign-in process; enter the 6-digit code in the original window:
              </p>

              <!-- Verification Code Box -->
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; padding: 20px 40px; background-color: #f8f9fa; border: 2px solid #16a34a; border-radius: 8px; font-size: 32px; font-weight: bold; color: #16a34a; letter-spacing: 4px;">
                  ${code}
                </div>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-weight: bold; font-size: 14px;">Security Notice:</p>
                <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px; line-height: 1.6;">
                  <li>Ignore this email if you didn't attempt to sign in or if the location doesn't match.</li>
                  <li>Do not share or forward this 6-digit code.</li>
                  <li>Customer service will never ask for this code.</li>
                  <li>Do not read the code out loud.</li>
                  <li>Be cautious of phishing attempts and always verify the sender and domain (<strong>Jkkn.ac.in</strong>) before acting.</li>
                  <li>Visit our <a href="#" style="color: #16a34a;">Help page</a> if you're concerned about account safety.</li>
                </ul>
              </div>

              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.5;">
                This code will expire in 5 minutes for security reasons.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; color: #999999; font-size: 14px; font-weight: bold;">
                JKKN College of Engineering
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}