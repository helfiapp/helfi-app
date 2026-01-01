# Helfi App - Module Audit Tracker

## Purpose
This file tracks a full, module-by-module review of the app. Each module stays in the list until it is fully checked and any issues are fixed. Food Diary is on hold for now, as requested.

## Status meanings
- Not checked
- In progress
- Code review done (needs live test)
- Checked and fixed

## Issue format (use this for any findings)
1) What the issue is
2) Why it matters
3) What could realistically go wrong
4) How serious it is
5) What needs to be done to fix it

## Completed modules
- 1, 2, 3, 27 (code fixes applied where needed; live testing still required)

## Modules to audit
1. Home and public pages (Home, Health app redirect, FAQ, Privacy policy, Terms)
   Status: Checked and fixed
   What to check:
   - Home page loads and main buttons work.
   - Public pages open and show the full text.
   - Links and buttons take people to the right places.
   Issues found:
   1) What the issue is: The Health app landing page immediately sends everyone to the sign‑in page, even if they are already signed in.
      Why it matters: It can feel like the page is broken or flickers, and it is not a real landing page for new visitors.
      What could realistically go wrong: People who open that link might think the site is down or stuck in a loop.
      How serious it is: Medium.
      What needs to be done to fix it: Fix applied in code so this page goes to the home page instead of sign‑in. Needs a live test.
   2) What the issue is: The Back button on the Privacy and Terms pages sends people to the dashboard when there is no previous page.
      Why it matters: Public visitors who are not signed in will be sent to a screen they cannot use.
      What could realistically go wrong: A new visitor clicks Back and ends up at a sign‑in screen instead of the home page.
      How serious it is: Low.
      What needs to be done to fix it: Fix applied in code so the fallback goes to the home page. Needs a live test.
   3) What the issue is: If a payment link cannot be created from the home page pricing buttons, the page does not show any clear message.
      Why it matters: People might click a plan and think nothing happened.
      What could realistically go wrong: Lost sign‑ups because users assume the button is broken.
      How serious it is: Low.
      What needs to be done to fix it: Fix applied in code to show a simple error message. Needs a live test.

2. Sign in and account access
   Status: Checked and fixed
   What to check:
   - Sign in works with correct details.
   - Wrong details show a clear error.
   - Email verification works.
   - Sign out fully logs the user out.
   Issues found:
   - No issues reported. User confirmed this is working in live testing.

3. Intake / Health setup (first-time setup)
   Status: Checked and fixed
   What to check:
   - All steps load and can be completed.
   - Answers save and re-open correctly.
   - Moving forward/back keeps the right data.
   Issues found:
   - No issues reported. User confirmed this is working in live testing.

4. Dashboard (main overview)
   Status: Code review done (needs live test)
   What to check:
   - Main cards and summaries load.
   - Links to other sections work.
   - Refresh or reload keeps the right data.
   Issues found:
   - No clear issues found in code review. Live testing still required.

5. Insights (health insights and detail pages)
   Status: Code review done (needs live test)
   What to check:
   - Insights list loads.
   - Each insight opens and shows details.
   - Back and navigation links work.
   Issues found:
   - No clear issues found in code review. Live testing still required.

6. Health tracking (daily tracking)
   Status: Code review done (needs live test)
   What to check:
   - Tracking items load.
   - New entries save correctly.
   - Past entries can be viewed.
   Issues found:
   - No clear issues found in code review. Live testing still required.

7. Devices and connections (Fitbit, Garmin, etc.)
   Status: Code review done (needs live test)
   What to check:
   - Connect and disconnect work.
   - The right status is shown after connecting.
   - Errors are clear if a connection fails.
   Issues found:
   - No clear issues found in code review. Live testing still required.

8. Check-in (daily check-ins)
   Status: Code review done (needs live test)
   What to check:
   - Check-in questions load.
   - Answers save correctly.
   - Past check-ins can be reviewed.
   Issues found:
   - No clear issues found in code review. Live testing still required.

9. Mood tracking and journal
   Status: Code review done (needs live test)
   What to check:
   - Mood entry saves correctly.
   - Journal entry saves and re-opens.
   - Media uploads work if included.
   Issues found:
   - No clear issues found in code review. Live testing still required.

10. Symptoms tracking and history
   Status: Code review done (needs live test)
   What to check:
   - New symptoms can be added.
   - History view loads and filters correctly.
   - Editing or removing entries works.
   Issues found:
   - No clear issues found in code review. Live testing still required.

11. Lab reports (PDF upload and results)
   Status: Code review done (needs live test)
   What to check:
   - Upload accepts a PDF.
   - Progress and success messages are correct.
   - Results display after processing.
   Issues found:
   - No clear issues found in code review. Live testing still required.

12. Medical images (upload and history)
   Status: Code review done (needs live test)
   What to check:
   - Upload works for supported files.
   - Images open correctly from history.
   - Deleting an image removes it from the list.
   Issues found:
   - No clear issues found in code review. Live testing still required.

13. Reports (weekly or summary reports)
   Status: Code review done (needs live test)
   What to check:
   - Reports list loads.
   - A report opens with full details.
   - Download or share (if available) works.
   Issues found:
   - No clear issues found in code review. Live testing still required.

14. Chat / AI assistant
   Status: Code review done (needs live test)
   What to check:
   - Chat opens and sends messages.
   - Replies appear and stay in the chat.
   - Usage limits and errors show clearly.
   Issues found:
   - No clear issues found in code review. Live testing still required.

15. Food diary (on hold per request)
   Status: On hold
   What to check:
   - Not checked yet. Will audit after fixes are done.
   Issues found:
   - None recorded yet (not checked).

16. Profile (view and edit)
   Status: Code review done (needs live test)
   What to check:
   - Profile details load.
   - Editing saves correctly.
   - Changes show after refresh.
   Issues found:
   - No clear issues found in code review. Live testing still required.

17. Profile photo
   Status: Code review done (needs live test)
   What to check:
   - Upload or capture works.
   - Photo displays correctly after saving.
   - Removing or replacing works.
   Issues found:
   - No clear issues found in code review. Live testing still required.

18. Account settings
   Status: Code review done (needs live test)
   What to check:
   - Account details load.
   - Changes save correctly.
   - Any security options work.
   Issues found:
   - No clear issues found in code review. Live testing still required.

19. Notifications (inbox and delivery settings)
   Status: Code review done (needs live test)
   What to check:
   - Notifications list loads.
   - Opening a notification works.
   - Delivery settings save and take effect.
   Issues found:
   - No clear issues found in code review. Live testing still required.

20. Settings (app preferences)
   Status: Code review done (needs live test)
   What to check:
   - Preferences load and save.
   - Any app install prompts work.
   - Changes remain after refresh.
   Issues found:
   - No clear issues found in code review. Live testing still required.

21. Billing and subscriptions
   Status: Code review done (needs live test)
   What to check:
   - Plans and pricing show correctly.
   - Purchase or upgrade flow works.
   - Current plan status updates.
   Issues found:
   - No clear issues found in code review. Live testing still required.

22. Support and help desk
   Status: Code review done (needs live test)
   What to check:
   - Support page loads.
   - Messages or tickets can be sent.
   - Confirmation of receipt appears.
   Issues found:
   - No clear issues found in code review. Live testing still required.

23. Affiliate / partner program
   Status: Code review done (needs live test)
   What to check:
   - Program page loads.
   - Any signup or referral actions work.
   - Status or earnings show correctly (if available).
   Issues found:
   - No clear issues found in code review. Live testing still required.

24. Admin area (admin panel and main admin)
   Status: Code review done (needs live test)
   What to check:
   - Admin login works.
   - Admin pages load and show data.
   - Admin actions complete and show success.
   Issues found:
   - No clear issues found in code review. Live testing still required.

25. Mobile app install entry (add to home screen)
   Status: Code review done (needs live test)
   What to check:
   - Install page loads.
   - Instructions match the device.
   - Install flow completes without errors.
   Issues found:
   - No clear issues found in code review. Live testing still required.

26. Redirects and short links
   Status: Code review done (needs live test)
   What to check:
   - Short links open the correct page.
   - Invalid links show a clear message.
   Issues found:
   - No clear issues found in code review. Live testing still required.

27. Private testing pages (staging sign-in, test interactions, chat log)
   Status: Checked and fixed
   What to check:
   - These pages are not available to normal users.
   - If access is allowed, it is clearly labeled and safe.
   Issues found:
   1) What the issue is: The test interactions page and the chat log page are publicly accessible.
      Why it matters: These pages are meant for internal testing and contain non‑public information.
      What could realistically go wrong: A normal user can view internal notes or test content.
      How serious it is: Medium.
      What needs to be done to fix it: Fix applied in code to block these pages in production. Needs a live test.
