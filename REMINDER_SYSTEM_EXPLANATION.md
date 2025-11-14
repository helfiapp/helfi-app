# Reminder System - Complete Explanation

## How the Reminder System is Supposed to Work

### 1. **The Check-In Page** (`/check-in`)
This is where users rate their daily health issues. Users can:
- Rate each health issue on a scale from "Really bad" to "Excellent"
- Add optional notes
- Mark issues as "Not applicable"
- View their check-in history

**How to Access:**
- Direct URL: `https://helfi.ai/check-in`
- From Settings → Reminder Times section (should have a link)
- From push notifications (when they work)
- From Dashboard (should have a link)

### 2. **Reminder Settings** (Settings Page)
Users can set:
- **Time 1, Time 2, Time 3**: Three reminder times per day (e.g., 12:00 PM, 6:00 PM, 9:30 PM)
- **Timezone**: Their local timezone
- **Frequency**: How many reminders per day (1-3)

### 3. **Push Notifications**
When enabled:
- Browser asks for notification permission
- Service worker registers
- Subscription is saved to database
- Notifications are sent at scheduled times

### 4. **The Scheduler** (`/api/push/scheduler`)
This endpoint:
- Runs on a cron schedule (should be every 5 minutes)
- Checks current time in each user's timezone
- Matches against their reminder times
- Sends push notifications to matching users

## Current Problems

### Problem 1: Cron Schedule is Wrong
**Current:** Runs once per day at 2:00 AM (`"0 2 * * *"`)
**Should be:** Runs every 5 minutes (`"*/5 * * * *"`)

**Why this matters:** The scheduler needs to check every 5 minutes to catch reminder times throughout the day. If it only runs once at 2am, it will miss all other times.

**Vercel Hobby Plan Limitation:**
- Vercel Hobby plan DOES support cron jobs
- Minimum interval is 1 minute (so every 5 minutes is fine)
- The previous agent was INCORRECT - Vercel Hobby plan can handle multiple reminders per day

### Problem 2: Test Buttons Don't Show Notifications
**Why "Test Notification" and "Send Reminder Now" buttons say "sent" but nothing happens:**

1. **Notifications might be blocked:**
   - Browser notification permission might be denied
   - macOS System Preferences might block notifications
   - Check: Browser settings → Notifications → helfi.ai

2. **Service worker not registered:**
   - Service worker must be registered for push notifications to work
   - Check: Browser DevTools → Application → Service Workers

3. **VAPID keys not configured:**
   - Environment variables might be missing in Vercel
   - Required: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`

4. **Subscription not saved:**
   - Push subscription might not be saved to database
   - Check: Database → `PushSubscriptions` table

5. **Browser compatibility:**
   - macOS Safari has limited push notification support
   - Best on Chrome, Firefox, Edge (desktop)
   - iOS requires PWA installation first

### Problem 3: Can't Find Check-In Page
**The check-in page exists at `/check-in` but:**
- No obvious link in navigation
- Not mentioned in Settings page
- Only accessible via direct URL or push notification

**Solution:** Add a link to the check-in page in:
- Dashboard
- Settings page (Reminder Times section)
- Main navigation

## How to Fix

### Step 1: Fix Cron Schedule
Update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/push/scheduler",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Step 2: Verify Environment Variables
In Vercel dashboard, ensure these are set:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `SCHEDULER_SECRET` (optional, for manual triggers)

### Step 3: Fix Notification Display
- Ensure service worker is registered on page load
- Check browser notification permissions
- Add better error messages when notifications fail

### Step 4: Add Check-In Page Links
- Add link in Dashboard
- Add link in Settings → Reminder Times section
- Add link in main navigation (if applicable)

### Step 5: Improve User Feedback
- Show actual notification status (permission granted/denied)
- Show subscription status (active/inactive)
- Show last notification sent time
- Better error messages when test fails

## Testing the System

1. **Enable Push Notifications:**
   - Go to Settings
   - Toggle "Push Notifications" ON
   - Grant browser permission when asked

2. **Set Reminder Times:**
   - Go to Settings → Reminder Times
   - Set Time 1, Time 2, Time 3
   - Select your timezone
   - Click "Save times"

3. **Test Notification:**
   - Click "Send test" button
   - Should see a browser notification
   - Clicking it should open `/check-in`

4. **Test Scheduler:**
   - Click "Send reminder now" button
   - Should trigger the same notification as scheduler would
   - Verify it opens `/check-in` when clicked

5. **Verify Cron:**
   - Wait for scheduled time
   - Should receive notification automatically
   - Check Vercel logs to see scheduler execution

## Database Tables Required

1. **CheckinSettings:**
   - `userId` (TEXT PRIMARY KEY)
   - `time1`, `time2`, `time3` (TEXT)
   - `timezone` (TEXT)
   - `frequency` (INTEGER, 1-3)

2. **PushSubscriptions:**
   - `userId` (TEXT PRIMARY KEY)
   - `subscription` (JSONB)

3. **CheckinIssues:**
   - `id` (TEXT PRIMARY KEY)
   - `userId` (TEXT)
   - `name` (TEXT)
   - `polarity` (TEXT)

4. **CheckinRatings:**
   - `userId`, `issueId`, `date` (PRIMARY KEY)
   - `value` (INTEGER, nullable)
   - `note` (TEXT)
   - `isNa` (BOOLEAN)

## Summary

The reminder system is **mostly built** but has these issues:
1. ✅ Check-in page exists and works
2. ✅ Reminder settings save correctly
3. ✅ Push notification code exists
4. ❌ Cron schedule is wrong (runs once/day instead of every 5 min)
5. ❌ Notifications might not show due to permissions/config
6. ❌ Check-in page is hard to find (no navigation links)

**The previous agent was WRONG** - Vercel Hobby plan CAN handle multiple reminders per day. The issue is the cron schedule, not Vercel limitations.




