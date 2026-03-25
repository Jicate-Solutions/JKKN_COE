#!/bin/bash

# JKKN COE - Email Function Deployment Script
echo "🚀 Deploying Email Function to Supabase..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null
then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if logged in
echo "📝 Checking Supabase login status..."
supabase projects list &> /dev/null
if [ $? -ne 0 ]; then
    echo "🔐 Please login to Supabase:"
    supabase login
fi

# Get project reference
echo ""
echo "📋 Enter your Supabase Project Reference ID:"
echo "   (Found in: Supabase Dashboard → Project Settings → General)"
read -p "Project Ref: " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project reference is required!"
    exit 1
fi

# Link project
echo ""
echo "🔗 Linking project..."
supabase link --project-ref "$PROJECT_REF"

if [ $? -ne 0 ]; then
    echo "❌ Failed to link project"
    exit 1
fi

# Deploy function
echo ""
echo "📦 Deploying send-email function..."
supabase functions deploy send-email

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy function"
    exit 1
fi

# Get Resend API key
echo ""
echo "🔑 Enter your Resend API Key:"
echo "   (Get it from: https://resend.com/api-keys)"
read -sp "API Key: " RESEND_API_KEY
echo ""

if [ -z "$RESEND_API_KEY" ]; then
    echo "❌ Resend API Key is required!"
    exit 1
fi

# Get sender email
echo ""
echo "📧 Enter sender email address:"
echo "   (e.g., noreply@yourdomain.com or use onboarding@resend.dev for testing)"
read -p "From Email: " EMAIL_FROM

if [ -z "$EMAIL_FROM" ]; then
    EMAIL_FROM="onboarding@resend.dev"
    echo "   Using default: $EMAIL_FROM"
fi

# Set secrets
echo ""
echo "🔒 Setting up secrets..."
supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"
supabase secrets set EMAIL_FROM="$EMAIL_FROM"

if [ $? -ne 0 ]; then
    echo "❌ Failed to set secrets"
    exit 1
fi

# Success!
echo ""
echo "✅ Email function deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Create a new user in your application"
echo "   2. Check the user's email inbox"
echo "   3. View logs: supabase functions logs send-email"
echo ""
echo "📚 Documentation:"
echo "   - Quick Guide: QUICK_EMAIL_SETUP.md"
echo "   - Full Guide: SUPABASE_EMAIL_SETUP.md"
echo ""
echo "🎉 Done!"