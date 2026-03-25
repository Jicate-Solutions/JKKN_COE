# Supabase Email Setup Guide

Send welcome emails to new users using Supabase Edge Functions with Resend.

## 🚀 Quick Start (5 minutes)

### Overview

This setup uses:
- **Supabase Edge Functions** - Serverless functions to send emails
- **Resend API** - Email delivery service (free tier: 3,000 emails/month)
- **Your Supabase Account** - Already configured in your project

## Step 1: Get Resend API Key

1. **Sign up for Resend**
   - Go to https://resend.com/
   - Sign up with your email (free account)
   - Verify your email address

2. **Get API Key**
   - Go to API Keys section
   - Click "Create API Key"
   - Name it "JKKN COE Portal"
   - Copy the API key (starts with `re_`)

## Step 2: Deploy Supabase Edge Function

### Option A: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed)
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Link your project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

   *Find your project ref in Supabase Dashboard → Project Settings → General*

4. **Deploy the function**
   ```bash
   supabase functions deploy send-email
   ```

5. **Set the secrets**
   ```bash
   supabase secrets set RESEND_API_KEY=your_resend_api_key
   supabase secrets set EMAIL_FROM=noreply@yourdomain.com
   ```

### Option B: Using Supabase Dashboard

1. **Go to Edge Functions**
   - Open your Supabase Dashboard
   - Navigate to "Edge Functions"

2. **Create New Function**
   - Click "Create a new function"
   - Name: `send-email`
   - Copy the code from `supabase/functions/send-email/index.ts`
   - Paste it into the editor
   - Click "Deploy"

3. **Set Environment Variables**
   - Go to "Edge Functions" → "send-email" → "Settings"
   - Add secrets:
     - `RESEND_API_KEY`: Your Resend API key
     - `EMAIL_FROM`: Your sender email (e.g., noreply@yourdomain.com)

## Step 3: Configure Application

Your `.env.local` should already have Supabase credentials:

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**No additional configuration needed!** The app uses your existing Supabase credentials.

## Step 4: Verify Domain (Optional - For Production)

To send from your own domain (e.g., noreply@jkkncoe.edu):

1. **In Resend Dashboard**
   - Go to "Domains"
   - Click "Add Domain"
   - Enter your domain

2. **Add DNS Records**
   - Add the provided DNS records to your domain registrar:
     - SPF record
     - DKIM record
     - DMARC record (optional but recommended)

3. **Wait for Verification**
   - Usually takes 5-15 minutes
   - Check verification status in Resend dashboard

4. **Update Edge Function Secret**
   ```bash
   supabase secrets set EMAIL_FROM=noreply@yourdomain.com
   ```

## Step 5: Test Email Sending 🎉

1. Restart your development server (if running)
2. Go to Users page in your app
3. Click "Add" to create a new user
4. Enter user details with a real email address
5. Click "Create User"
6. Check the email inbox!

## ✅ Success Indicators

- ✅ User created successfully
- ✅ No errors in browser console
- ✅ No errors in Supabase Edge Function logs
- ✅ Email received in inbox
- ✅ Email contains login link and credentials

## 🔍 Monitoring & Debugging

### View Edge Function Logs

**Via Dashboard:**
1. Go to Supabase Dashboard
2. Navigate to "Edge Functions"
3. Click on "send-email"
4. View "Logs" tab

**Via CLI:**
```bash
supabase functions logs send-email
```

### Test Edge Function Directly

```bash
curl -L -X POST 'https://your-project-ref.supabase.co/functions/v1/send-email' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Test</h1>"
  }'
```

## 🐛 Troubleshooting

### Email Not Sending

1. **Check Edge Function Logs**
   ```bash
   supabase functions logs send-email --follow
   ```

2. **Verify Secrets are Set**
   ```bash
   supabase secrets list
   ```
   Should show: `RESEND_API_KEY`, `EMAIL_FROM`

3. **Check Resend Dashboard**
   - Go to https://resend.com/emails
   - View sent emails and any errors

4. **Verify Function is Deployed**
   ```bash
   supabase functions list
   ```

### Common Errors

**"Email service not configured"**
- Set RESEND_API_KEY secret in Supabase
  ```bash
  supabase secrets set RESEND_API_KEY=re_your_key
  ```

**"Failed to send email"**
- Check Resend API key is valid
- Verify you haven't exceeded free tier limits
- Check Resend dashboard for errors

**"CORS error"**
- Edge function already handles CORS
- Verify function is deployed correctly

**"Domain not verified"**
- Use `onboarding@resend.dev` for testing
- Or verify your domain in Resend dashboard

### Email in Spam

1. Verify your domain in Resend
2. Add proper DNS records (SPF, DKIM, DMARC)
3. Use professional sender name
4. Avoid spam trigger words
5. Warm up your domain gradually

## 📊 Limits & Pricing

### Resend Free Tier
- 3,000 emails/month
- 100 emails/day
- Perfect for small to medium projects

### Resend Paid Plans
- **Pro**: $20/month - 50,000 emails
- **Business**: $80/month - 200,000 emails
- See https://resend.com/pricing for details

### Supabase Edge Functions
- Free tier: 500,000 invocations/month
- More than enough for email sending

## 🔐 Security Best Practices

1. **Never commit secrets** to version control
2. **Use Edge Function secrets** for API keys
3. **Rotate API keys** periodically
4. **Monitor usage** in both Supabase and Resend dashboards
5. **Use test mode** during development
6. **Verify domain** for production use

## 📚 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Resend Documentation](https://resend.com/docs)
- [Resend API Reference](https://resend.com/docs/api-reference/emails/send-email)

## 🔄 Architecture

```
User Creation (Admin Panel)
         ↓
    API Route
         ↓
  Save to Database
         ↓
  Call Edge Function (send-email)
         ↓
  Resend API
         ↓
  User Email Inbox 📧
```

## 💡 Advanced Tips

### Custom Email Templates

Edit `lib/email-service.ts` to customize the email HTML template.

### Bulk Email Sending

For sending to multiple users, call the edge function multiple times or create a batch function.

### Email Tracking

Resend provides click and open tracking - enable in Resend dashboard.

### Webhooks

Set up webhooks in Resend to track delivery, bounces, and complaints.

---

**Need Help?**

1. Check Edge Function logs first
2. Verify all secrets are set
3. Test with Resend dashboard
4. Check this troubleshooting guide
5. Review Supabase and Resend documentation