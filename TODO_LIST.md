# TODO_LIST

Last updated: 2025-08-20

How to use
- Keep this as the single source of truth for what to fix next
- We’ll update this list as items are fixed or new ones are found

Priority 3 — Nice to have / quality improvements

7) Billing/credits: confirm limits and purchase flow
   - Pricing/limits changed over time
   - Goal: Check that daily limits and credit purchases behave as expected and show the right messages

8) Admin test email fails in Chrome (Resend setup)
   - What happens: Sending a “test email” shows an error
   - Likely cause: Missing RESEND_API_KEY or unverified From address
   - Fix next: Add RESEND_API_KEY in .env, restart; if still failing, use From: onboarding@resend.dev or verify helfi.ai in Resend

Notes
- We’ll keep this list short and plain-English
- When we fix an item, we’ll mark it “Done” here and move on to the next
