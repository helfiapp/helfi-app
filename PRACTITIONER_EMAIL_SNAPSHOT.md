# Practitioner Email Snapshot (Current Setup)

This is a quick, plain-English snapshot of how practitioner emails work right now.

## Email sending points (what triggers emails)
- Listing submitted or approved: `lib/practitioner-emails.ts`
  - Triggered from `app/api/practitioner/listings/[id]/submit/route.ts`
  - Admin approvals from `app/api/admin/practitioners/[id]/approve/route.ts`
- Weekly activity summary (contact clicks):
  - Sender: `sendPractitionerContactSummaryEmail` in `lib/practitioner-emails.ts`
  - Triggered by cron route: `app/api/cron/practitioner-contact-summary/route.ts`
  - Uses contact events logged via `app/api/practitioners/contact-click/route.ts`

## Data sources used
- Practitioner listing details: `PractitionerListing`
- Practitioner account email: `PractitionerAccount.contactEmail`
- Contact activity: `AnalyticsEvent` table (`type = practitioner-contact`)

## Weekly summary preferences (new)
- Stored in `PractitionerNotificationPreference` table
- Default is **enabled**
- Practitioners can toggle from the practitioner dashboard (Email preferences card)

## Safety notes
- This snapshot does not change any waitlist or signup email flows.
- Weekly summary emails only send when contact activity exists.
