# TODO_LIST

Last updated: 2025-08-20

How to use
- Keep this as the single source of truth for what to fix next
- We’ll update this list as items are fixed or new ones are found

Priority 1 — Fix now (most serious)
1) Page 8 on iPhone: wrong section opens
   - After “Update analysis,” tapping the first item opens a different one; “Show history” can jump to the next page
   - Goal: Taps open the exact section touched and stop the page jump

2) New supplement sometimes isn’t saved
   - You add a supplement, press Next quickly, and it disappears later
   - Goal: Save the new item first, then move to the next step so nothing is lost

Priority 2 — Important
3) Food photo analysis: confirm truly working now
   - In the past it showed errors or filler text
   - Goal: Run a real photo test on live to confirm real results (no placeholder text, no errors)

4) Login/session: stay signed in reliably
   - Past reports of getting signed out or flaky sessions during updates
   - Goal: Remain logged in while browsing and after a new version is deployed

5) “Show history” on Page 8: no freezes, no accidental page change
   - On some runs it jumps ahead and then the page can freeze
   - Goal: “Show history” should only open/close the history list without moving pages

Priority 3 — Nice to have / quality improvements
6) Mobile checks across main pages (tap targets and layout)
   - Mobile Safari can behave differently from desktop
   - Goal: Confirm all buttons and sections respond correctly on iPhone on these pages: Onboarding steps 6–8, Dashboard, Profile, Food

7) Profile image: confirm it stays everywhere after refresh
   - Previously fixed, but needs a quick live check
   - Goal: Your photo should show on Profile, Dashboard, Reports, etc., and stay after refresh

8) Billing/credits: confirm limits and purchase flow
   - Pricing/limits changed over time
   - Goal: Check that daily limits and credit purchases behave as expected and show the right messages

9) Interaction history list: loads fast and expands cleanly
   - History is fine most of the time, but confirm it on mobile after new analyses
   - Goal: History should load quickly and each item should expand only when tapped

10) General speed: onboarding feels slow at times
   - Pages can feel sluggish due to repeated background requests
   - Goal: Reduce unnecessary reloads so steps 6–8 feel snappy

Notes
- We’ll keep this list short and plain-English
- When we fix an item, we’ll mark it “Done” here and move on to the next
