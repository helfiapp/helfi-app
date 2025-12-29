# Helfi App – Pre-Launch Audit Report

## Summary
Overall risk is very high. There are multiple paths that allow account takeover, admin takeover, and public exposure of health files. The credit system can be bypassed in several places, and payments do not always control access. This should not go live until the critical items are fixed.

## Critical Issues
1. ✅ Anyone can sign in as any email without a password or verification.
   1) What the issue is: There is a sign-in path that accepts only an email address and creates a login session.
   2) Why it matters: It removes identity checks for every account.
   3) What could realistically go wrong: A stranger can log in as any customer and see or change their health data.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Remove this path or lock it to private testing only, and require normal sign-in with verified email.

2. ✅ Admin access is protected only by a public password and a shared hardcoded access key.
   1) What the issue is: The admin dashboard checks a password only in the browser and then uses the same fixed key for admin actions.
   2) Why it matters: Anyone who views the site code can get in as admin.
   3) What could realistically go wrong: A stranger can access the full admin dashboard, read user data, change plans, and send emails.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Move admin login to the server, require real admin accounts, and remove the shared hardcoded key.

3. ✅ Health files are stored with public links.
   1) What the issue is: Medical images, lab reports, and meal photos are uploaded to public file storage and return public links.
   2) Why it matters: Anyone with the link can view these files without logging in.
   3) What could realistically go wrong: A link is shared or leaked, and private health images and reports are exposed.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Store files as private, serve them only through signed links, and remove public access.

4. ✅ A public troubleshooting tool reveals part of the AI secret key.
   1) What the issue is: A debug feature returns a preview of the AI service key without any login.
   2) Why it matters: That key can be used to run up AI costs or probe the AI service.
   3) What could realistically go wrong: A stranger uses the key to create large charges and disrupt service.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Remove the debug feature from production and never expose secrets in responses.

5. ✅ Several AI features let users get results without paying credits.
   1) What the issue is: Some AI features do not charge credits at all, and several chat-style features send results before charging and ignore charge failures.
   2) Why it matters: Credits can be bypassed, and paid limits do not protect costs.
   3) What could realistically go wrong: Users or bots can make unlimited AI requests while paying nothing.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Require a successful charge before any AI result is returned and remove all free AI paths that are not meant to be free.

## High Priority Issues
1. ✅ Access is not shut off when subscription payments fail.
   1) What the issue is: The system grants paid access on subscription updates without checking if payment actually succeeded.
   2) Why it matters: Users can keep premium access without paying.
   3) What could realistically go wrong: A large number of overdue users keep using paid features, reducing revenue.
   4) How serious it is: High.
   5) What needs to be done to fix it: Only grant paid access when payment is confirmed and remove access on failed or overdue payments.

2. ✅ Refunds and chargebacks do not remove credits or access.
   1) What the issue is: There is no reversal of credits or access after a refund or chargeback.
   2) Why it matters: Revenue is lost but usage continues.
   3) What could realistically go wrong: Users request refunds and keep using credits they did not pay for.
   4) How serious it is: High.
   5) What needs to be done to fix it: Track refunds and remove credits and access tied to refunded payments.

3. ✅ Credit balances can be overspent under fast repeat requests.
   1) What the issue is: Credit checks and deductions are not locked, so two fast requests can both spend the same credits.
   2) Why it matters: Credits can drop below zero and usage can exceed what was paid for.
   3) What could realistically go wrong: A user opens two tabs or a bot sends bursts and gets extra usage for free.
   4) How serious it is: High.
   5) What needs to be done to fix it: Make credit checks and deductions atomic so only one request can spend a given balance.

4. ✅ Background job routes can be triggered by anyone.
   1) What the issue is: Several scheduled message routes accept requests without proof that they come from the scheduler.
   2) Why it matters: Anyone can trigger messages and credit spending.
   3) What could realistically go wrong: Attackers spam users with notifications or drain their credits.
   4) How serious it is: High.
   5) What needs to be done to fix it: Require a strong proof of sender and reject any request without it.

5. ✅ Credit purchases can be applied to the wrong account if a paid receipt link is reused.
   1) What the issue is: The credit confirmation step accepts a paid receipt link and applies credits to the current logged-in user without matching the buyer.
   2) Why it matters: Credits can be claimed by the wrong person.
   3) What could realistically go wrong: Someone gets a receipt link and applies the credits to their own account.
   4) How serious it is: High.
   5) What needs to be done to fix it: Tie the paid receipt to the buyer’s account and only apply credits to that same account.

6. ✅ User activity data can be read or written without login.
   1) What the issue is: The analytics feed accepts and returns data without any login checks.
   2) Why it matters: User activity data can be viewed or tampered with by anyone.
   3) What could realistically go wrong: A stranger pulls user activity data or poisons reports with fake events.
   4) How serious it is: High.
   5) What needs to be done to fix it: Require login and admin checks before reading or writing analytics data.

## Medium Priority Issues
1. ✅ Login sessions can last for years.
   1) What the issue is: Login sessions can remain valid for up to five years.
   2) Why it matters: A lost device can stay logged in for a very long time.
   3) What could realistically go wrong: A stolen phone can be used to access health data for years.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Add a way for an admin to log a user out everywhere. This is now in place.

2. ✅ Some secrets fall back to hardcoded values.
   1) What the issue is: If real secret values are not set, the app uses built-in defaults.
   2) Why it matters: Default secrets can be guessed and used to forge access.
   3) What could realistically go wrong: Attackers create fake login keys or admin keys.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Confirm all required secrets are set in production and monitor this from the admin panel. This is now in place.

3. ✅ Abuse limits are easy to bypass.
   1) What the issue is: Request limits were kept only in server memory and reset often.
   2) Why it matters: They did not stop heavy or distributed abuse.
   3) What could realistically go wrong: A botnet could send many requests and overwhelm the system.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Use durable limits that work across all servers and all instances. This is now in place.

4. ✅ Some paid actions can be blocked by overly strict cost estimates.
   1) What the issue is: Some features check for a higher credit amount than they later charge.
   2) Why it matters: Paying users can be blocked even though they have enough credits.
   3) What could realistically go wrong: Users see “not enough credits” and stop using the app.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Cap the response size to fit the user’s available credits so requests are not blocked by worst‑case estimates. This is now in place.

## Low Priority / Improvements
1. ✅ Error reporting is mostly manual.
   1) What the issue is: Most errors are only written to logs.
   2) Why it matters: Serious problems can go unnoticed until users report them.
   3) What could realistically go wrong: An outage or data issue persists for hours without detection.
   4) How serious it is: Low.
   5) What needs to be done to fix it: Send automatic error alerts for critical failures so problems are seen quickly without watching logs. This is now in place.

2. ✅ Analytics data can be lost on restarts.
   1) What the issue is: Analytics data is stored in memory only.
   2) Why it matters: Data disappears when the server restarts.
   3) What could realistically go wrong: Business reports are incomplete or misleading.
   4) How serious it is: Low.
   5) What needs to be done to fix it: Store analytics in a durable data store so restarts do not erase history. This is now in place.

3. ✅ Free credit rules are inconsistent across features.
   1) What the issue is: Some features use free-credit counters, while others use one-time flags.
   2) Why it matters: Users may see confusing or unfair limits.
   3) What could realistically go wrong: Support requests increase because “free credits” do not behave as promised.
   4) How serious it is: Low.
   5) What needs to be done to fix it: Use one consistent free-credit system across all AI features so each free use is counted the same way. This is now in place.

## Profitability Risks
1. ✅ Some AI features are free.
   1) What the issue is: Several AI features return results without any credit charge.
   2) Why it matters: Each use creates real AI costs with no revenue.
   3) What could realistically go wrong: Heavy usage drives costs above revenue.
   4) How serious it is: High.
   5) What needs to be done to fix it: Charge credits for every AI feature or remove the feature until billing is added. This is now in place with consistent credit use across all AI features and starter free uses that are still tracked.

2. ✅ Streaming chat replies can be delivered without a successful charge.
   1) What the issue is: Some chat replies are sent before charging, and failed charges are ignored.
   2) Why it matters: Users can keep getting replies even when they are out of credits.
   3) What could realistically go wrong: Cost grows while paid credits do not.
   4) How serious it is: High.
   5) What needs to be done to fix it: Require a successful charge before completing the reply. This is now enforced so replies are only sent after a successful charge or a valid free use.

3. ✅ Full insights regeneration is priced far below likely cost.
   1) What the issue is: The full refresh uses a very low fixed credit price.
   2) Why it matters: Large or complex profiles likely cost more than the credits collected.
   3) What could realistically go wrong: This feature runs at a loss for heavy users.
   4) How serious it is: High.
   5) What needs to be done to fix it: Price this feature based on actual AI usage or restrict it. This is now increased to a safer fixed price so it no longer runs at a loss in normal use.

4. ✅ Paid access continues after failed payments.
   1) What the issue is: Access is not tied to confirmed payment success.
   2) Why it matters: Revenue is lost while costs continue.
   3) What could realistically go wrong: A meaningful share of users use paid features for free.
   4) How serious it is: High.
   5) What needs to be done to fix it: Lock access when payments fail or are overdue.

5. ✅ Refunds do not claw back credits.
   1) What the issue is: Credits remain even after refunds or chargebacks.
   2) Why it matters: Refunds erase revenue but not usage.
   3) What could realistically go wrong: Users request refunds and still use paid credits.
   4) How serious it is: High.
   5) What needs to be done to fix it: Revoke credits and access after refunds.

6. ✅ Credit balance races allow extra usage.
   1) What the issue is: Two fast requests can both spend the same credits.
   2) Why it matters: Usage can exceed paid limits.
   3) What could realistically go wrong: Credits go below zero and costs exceed revenue.
   4) How serious it is: High.
   5) What needs to be done to fix it: Make credit checks and deductions atomic.

7. Profit margin targets cannot be fully confirmed.
   1) What the issue is: The live cost settings and real AI provider costs are not visible here.
   2) Why it matters: Margins can drop below targets if costs rise or settings change.
   3) What could realistically go wrong: Subscription or credit-pack margins fall below 60% or 70% without notice.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Manually verify real AI costs, pricing settings, and margins with recent usage. This could not be confirmed and should be manually checked.

## Security & Privacy Risks
1. ✅ Public links expose sensitive health files.
   1) What the issue is: Medical images, lab reports, and meal photos are stored with public links.
   2) Why it matters: Anyone with the link can view private health data.
   3) What could realistically go wrong: A leak or shared link exposes medical images and reports.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Make file storage private and serve files only through secure, time-limited links.

2. ✅ Account takeover is possible via direct sign-in.
   1) What the issue is: A sign-in path allows login with only an email.
   2) Why it matters: It bypasses all identity checks.
   3) What could realistically go wrong: Any account can be accessed by a stranger.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Remove this path and enforce verified login for all access. This direct sign-in path is now disabled in production.

3. ✅ Admin access can be guessed or copied.
   1) What the issue is: Admin access relies on a public browser-only password and a shared access key.
   2) Why it matters: Admin data includes every user’s health data.
   3) What could realistically go wrong: Full data exposure and harmful account changes.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Use server-side admin login and remove any shared key. The shared browser password gate is removed and admin login now requires the server secret.

4. ✅ A public debug tool exposes the AI secret key.
   1) What the issue is: A troubleshooting route shows part of the AI key.
   2) Why it matters: It can be used to run unauthorized AI requests.
   3) What could realistically go wrong: Costs spike and service is abused.
   4) How serious it is: Critical.
   5) What needs to be done to fix it: Remove the route or lock it behind admin access. This route is now restricted so it is not publicly accessible.

5. ✅ User activity data is exposed.
   1) What the issue is: Activity tracking data can be read without login.
   2) Why it matters: It reveals user behavior and usage patterns.
   3) What could realistically go wrong: A third party downloads user activity data.
   4) How serious it is: High.
   5) What needs to be done to fix it: Require admin login to access activity data.

6. ✅ Background job routes can be called by anyone.
   1) What the issue is: Scheduled message routes do not verify the sender.
   2) Why it matters: They read user data to build messages.
   3) What could realistically go wrong: Unauthorized calls use private health data to generate content.
   4) How serious it is: High.
   5) What needs to be done to fix it: Require verified sender proof before processing.

7. ✅ Deletion does not guarantee file removal.
   1) What the issue is: Account deletion removes database records but does not reliably remove stored files.
   2) Why it matters: Health files can remain after a user deletes their account.
   3) What could realistically go wrong: Former users’ files remain accessible long after deletion.
   4) How serious it is: High.
   5) What needs to be done to fix it: Account deletion now removes stored files first (including uploaded images and reports) and stops if file removal fails. This is now in place.

8. ✅ Storage encryption confirmed.
   1) What the issue is: There is no visible confirmation of encryption at rest for stored files and data.
   2) Why it matters: Health data should be protected even if storage is breached.
   3) What could realistically go wrong: A storage breach exposes readable health data.
   4) How serious it is: Medium.
   5) What needs to be done to fix it: Confirmed by the owner and recorded in the admin Security Status so the team can see it was verified.

9. ✅ Some uploads still use public links.
   1) What the issue is: Some uploads (such as food photos, mood journal media, and support attachments) are still stored as public links.
   2) Why it matters: Anyone who gets the link can view the file without logging in.
   3) What could realistically go wrong: A link is shared or guessed and private files are exposed.
   4) How serious it is: High.
   5) What needs to be done to fix it: These uploads are no longer shared by public links and are now only shown through short‑lived secure links.

## Final Go-Live Recommendation
NO

## Audit 2 – Follow‑Up Verification
### Verification Results
- All previously fixed items were re‑checked and are still fixed.
- Storage encryption status is confirmed in the admin Security Status.
- Food photos, mood journal media, and support attachments are no longer shared by public links and are only shown through short‑lived secure links.

### New Issues Found
None.
