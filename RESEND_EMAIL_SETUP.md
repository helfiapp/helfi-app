# 📧 Resend Email Service Setup Guide

## ⚠️ CRITICAL: Email Verification Required

Your app currently has **email verification enforcement enabled** but the email service is not configured. Users **cannot sign in** until they verify their email addresses.

## 🔧 Quick Setup (5 minutes)

### Step 1: Get Resend API Key
1. Go to [resend.com](https://resend.com)
2. Sign up for a free account (40,000 emails/month free)
3. Verify your account
4. Go to API Keys section
5. Create a new API key
6. Copy the API key (starts with `re_`)

### Step 2: Add Domain (Production Only)
1. In Resend dashboard, go to "Domains"
2. Add your domain: `helfi.ai`
3. Follow DNS setup instructions
4. Wait for verification (can take a few minutes)

### Step 3: Update Environment Variables
Replace `your_resend_api_key_here_get_from_resend_com` in these files:
- `.env.local` (for development)
- `.env.production` (for production)

Example:
```bash
RESEND_API_KEY=re_AbCdEfGh_1234567890abcdefghijklmnop
```

### Step 4: Test Email Service
1. Restart your development server: `npm run dev`
2. Go to Admin Panel → Email Management
3. Use "Test Email" feature to verify it works
4. Deploy to production: `npx vercel --prod`

## 📧 Email Templates Configured

The following emails are automatically sent:
- ✅ **Verification Email** - When users sign up
- ✅ **Welcome Email** - After email verification
- ✅ **Resend Verification** - If users need a new link

## 🔒 Security Features Added

- ✅ **Email verification required** for all new signups
- ✅ **Google OAuth users auto-verified** (Google already verifies emails)
- ✅ **Sign-in blocked** for unverified users
- ✅ **Clear error messages** for unverified accounts

## 🚨 Current Status

**Email verification is ENFORCED but emails can't be sent until you add the RESEND_API_KEY.**

Users who try to sign up will:
1. Create an account (unverified)
2. Not receive verification email (due to missing API key)
3. Cannot sign in (due to verification requirement)
4. Be stuck until you configure Resend

**Priority: Configure Resend API key immediately!** 