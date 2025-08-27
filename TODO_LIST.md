# TODO_LIST

Last updated: 2025-08-26

How to use
- Keep this as the single source of truth for what to fix next
- We’ll update this list as items are fixed or new ones are found

Priority 3 — Nice to have / quality improvements

8) Improve multi-food analysis (salads, soups, stews, full dinners)
   - Current: Single foods are good; mixed meals are rough
   - Goal: Detect multiple items, estimate portions per item, and show a total

9) Recognize packaged products and return per-portion nutrition
   - Scenario: Photo of a supermarket product
   - Goal: Identify product, read label when possible, output 1-portion calories, protein, carbs, fat (and fiber/sugar if seen)

10) Add PWA notifications (Android + iOS 16.4+ web push) — In progress
   - Baseline live: manifest + service worker, opt‑in toggle, VAPID endpoint, subscribe/unsubscribe APIs
   - Test push endpoint live: /api/push/test
   - Scheduler endpoint live: /api/push/scheduler (trigger via cron every 5 min; Bearer SCHEDULER_SECRET)
   - Fallback for iOS pre‑16.4 and Safari Mac: email reminders
   - Ensure opt‑in UX and settings to pause/disable per reminder type

Notes
- We’ll keep this list short and plain-English
- When we fix an item, we’ll mark it “Done” here and move on to the next
