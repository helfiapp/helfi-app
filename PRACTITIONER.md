# Practitioner Directory Handover (Helfi)

Legend: ✅ = completed and working, ❌ = still needs work.

## ✅ Completed in this session
- ✅ Practitioner search page layout updated to the new design with hero, search bar, map view, radius selector, telehealth-only toggle, “Use my current location,” and “List your practice” button.
- ✅ Subcategory dropdown only activates after a category is chosen (and focuses after category select).
- ✅ Search results section added with heading; clicking “Search now” scrolls to results.
- ✅ Search state persists when you leave the page and return (results and filters stay).
- ✅ Map pins added for search results; hover tooltip + click-to-zoom behavior.
- ✅ A–Z page now lists categories with subcategories underneath, linking back to the search page with prefilled filters.
- ✅ Contact click tracking for view profile / call / website / email, plus profile view tracking.
- ✅ Weekly practitioner contact summary email logic and cron endpoint added (emails only send if there were clicks).
- ✅ Gallery photos on public profile open in a lightbox.
- ✅ Email links only show when a valid public email exists.
- ✅ Practitioner sign‑out returns to the Find a Practitioner page.
- ✅ Map tooltip formatting updated (name on one line, address underneath).
- ✅ A–Z page: removed “View category” buttons.
- ✅ A–Z back-to-search: prefill filters without auto-scrolling to results.
- ✅ Email crossover bug fixed for Mountain View Chiropractic (public email now correct).
- ✅ One-off weekly summary email triggered.
- ✅ Practitioner dashboard now shows stats + weekly summary email toggle + test email button.

## ❌ Still needs to be addressed (latest explicit requests)
- ❌ Map tooltip formatting: on hover, show the practitioner name on one line and the address underneath. <span style="color: #16a34a;">DONE</span>
- ❌ A–Z page: remove the “View category” buttons. <span style="color: #16a34a;">DONE</span>
- ❌ A–Z back-to-search: prefill filters but DO NOT auto-scroll to results until “Search now” is clicked. <span style="color: #16a34a;">DONE</span>
- ❌ Email crossover bug (URGENT): public listing shows a normal user email (info@sonicweb.com.au) instead of the practitioner’s public email. This is a serious breach and must be fixed and cleaned. <span style="color: #16a34a;">DONE</span>
- ❌ One-off weekly summary email: trigger once so the format can be reviewed (send to practitioner account email). <span style="color: #16a34a;">DONE</span>
- ❌ Practitioner stats dashboard + notifications: add a stats view for practitioners and a toggle for weekly summary emails. <span style="color: #16a34a;">DONE</span>

## Important notes from the user
- `PRACTITIONER_TRACKING_SECRET` has been added, saved, and redeployed.

## Notes for the next agent
- All changes must be deployed to the live site. Do not deploy unrelated changes from other agents.
- The user is not a developer. Respond in plain, simple English (no technical jargon).
- Do NOT look for `AGENTS.md` (it does not exist).
- Read `GUARD_RAILS.md` before touching protected areas.
- Any email changes require reading `WAITLIST_EMAIL_PROTECTION.md` and re‑testing sign‑up/waitlist flows.
- A weekly summary email can be triggered via `POST /api/cron/practitioner-contact-summary` with the correct scheduler secret header.
- `PRACTITIONER_TRACKING_SECRET` was added and deployed by the user.

## Screenshots
- The screenshots are only in this chat and not saved to the repo. If needed, ask the user to provide the image files so they can be added to the project.
