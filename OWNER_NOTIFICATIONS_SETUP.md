# 📱 Owner Push Notifications Setup Guide

This guide explains how to set up push notifications so you receive alerts on your phone whenever:
- Someone signs up on your website
- Someone purchases a paid subscription
- Someone buys credits

## 🎯 What You'll Get

You'll receive **push notifications** on your phone (the same system used for check-in reminders). These appear as native phone notifications, just like when users get their daily check-in reminders.

## 📱 Setup Steps

### Step 1: Add Your Email Address

Add this to your `.env.local` file (for development) and Vercel environment variables (for production):

```bash
OWNER_EMAIL=your-email@example.com
```

This should be the email address of your owner/admin account in the Helfi app.

### Step 2: Subscribe to Push Notifications

1. **Log in to your Helfi account** (using the email you set in `OWNER_EMAIL`)
2. **Go to Settings** → **Notifications** (or `/notifications` page)
3. **Enable Push Notifications** - Click the toggle to enable
4. **Allow browser notifications** - When prompted, click "Allow" to grant notification permission
5. **Verify subscription** - You should see a success message

**Important:** You must be logged in as the owner account (the email matching `OWNER_EMAIL`) for this to work.

### Step 3: Test It

1. Sign up a new test account on your website
2. You should receive a push notification on your phone saying "🎉 New User Signup"

## 🔧 How It Works

The notification system uses the same web-push infrastructure as check-in reminders:

1. **Your subscription is stored** in the `PushSubscriptions` table with your user ID
2. **When events occur**, the system looks up your subscription and sends a push notification
3. **Notifications appear** on your phone just like check-in reminders

## 📋 Events That Trigger Notifications

1. **New Signups** (`app/api/auth/signup/route.ts` and `lib/auth.ts`)
   - Direct email/password signups
   - Google OAuth signups
   - Notification: "🎉 New User Signup - [Name] just signed up!"

2. **Subscription Purchases** (`app/api/billing/webhook/route.ts`)
   - When Stripe webhook receives `customer.subscription.created` or `customer.subscription.updated`
   - Notification: "💰 New Subscription - [Name] purchased [Plan] ([Amount])"

3. **Credit Purchases** (`app/api/billing/webhook/route.ts` and `app/api/billing/confirm/route.ts`)
   - When users buy credits via Stripe checkout
   - Notification: "💳 Credit Purchase - [Name] bought [Credits] ([Amount])"

## 🚨 Important Notes

- **Notifications are non-blocking**: They won't slow down signups or purchases
- **Failures are logged**: If notifications fail, they're logged but don't affect the user experience
- **You must subscribe first**: Push notifications only work after you've enabled them in Settings
- **Same system as reminders**: Uses the exact same push notification system as check-in reminders
- **Works on mobile browsers**: Push notifications work on mobile browsers (iOS Safari, Chrome, etc.)

## 🔍 Troubleshooting

### Not Receiving Notifications?

1. **Check you're subscribed**: Go to Settings → Notifications and verify push notifications are enabled
2. **Check browser permissions**: Make sure you've allowed notifications in your browser settings
3. **Check OWNER_EMAIL**: Make sure the email in `OWNER_EMAIL` matches your account email exactly
4. **Check logs**: Look for `[OWNER NOTIFICATION]` messages in your server logs

### Subscription Not Found?

- Make sure you're logged in as the owner account (email matching `OWNER_EMAIL`)
- Go to Settings → Notifications and enable push notifications
- Try toggling push notifications off and on again

## 📝 Environment Variables Summary

**Required:**
```bash
OWNER_EMAIL=your-email@example.com  # Your owner/admin account email
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key  # Already configured
VAPID_PRIVATE_KEY=your_vapid_private_key  # Already configured
```

## 🎉 You're All Set!

Once you:
1. Add `OWNER_EMAIL` to your environment variables
2. Log in and enable push notifications in Settings

You'll start receiving push notifications on your phone for all signups, subscriptions, and credit purchases!

