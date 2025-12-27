# Garmin Production Submission (Checklist + Email Template)

Use this to respond to Garmin Partner Services (Production Access request).

## 1) Technical Review (screenshots)

- **Partner Verification Tool (All Tests)**: show green results for:
  - Endpoint Setup Test
  - Endpoint Coverage Test
  - Active User Test (must show **2** authorized users)
  - HTTP Test
  - Ping Test
  - Pull Test
- **Endpoint Configuration**: show these enabled:
  - `COMMON – Deregistrations`
  - `COMMON – User Permissions Change`
  - At least one additional enabled endpoint (any health summary domain)
- **Authorized users proof**: screenshot of **Partner Verification → Active User Test** showing **2** user IDs.

### Notes (payload size / 413)
- If you ever see `413 Payload Too Large` from Cloudflare, the root cause is an upstream request-size limit.
- Recommended Garmin setting to avoid oversized inbound pushes while still meeting **PING/PUSH** requirements:
  - Set **Activity Details** to **PING** (small notification + callback URL), and let Helfi pull the large payload in the background.

## 2) UX + Brand Compliance (screenshots)

Capture the full Garmin UX flow and every place Garmin branding appears:
- `https://helfi.ai/devices` (Connect/Connected state)
- `https://helfi.ai/health-tracking` (Garmin card + charts)
- Any other pages where “Garmin” is mentioned (Dashboard cards, marketing home, Privacy Policy, etc.)

Helfi includes the trademark line on relevant screens:
> Garmin and the Garmin logo are trademarks of Garmin Ltd. or its subsidiaries.

## 3) Account Setup (confirmations)

- Confirm you are subscribed to the **API Blog** emails (screenshot if possible).
- Confirm all authorized users added to the developer portal are **company-domain** emails (no freemail / shared inboxes).
- If a third-party integrator is involved, provide the NDA per Garmin’s requirement (if applicable).

## Email Template (paste into Garmin ticket)

Hi Elena,

Following your checklist, we confirm the requirements are met. All screenshots are available in this Google Drive folder:

https://drive.google.com/drive/folders/1kYH29H1UrbVqSw8x6y6RwUuUvONT917m?usp=sharing

1) Technical Review
- APIs in use/tested: Garmin Health API (Wellness) webhooks (PING/PUSH) for enabled summary domains shown in the attached Endpoint Configuration screenshot.
- Partner Verification Tool: all tests passing (see attached screenshots, including Endpoint Setup/Coverage, HTTP, Ping, Pull).
- Authorized users: 2 Garmin Connect users have authorized Helfi (see Partner Verification → Active User Test screenshot showing 2 user IDs).
- User Deregistration + User Permission endpoints: enabled and handled (see attached Endpoint Configuration screenshot).
- Webhook processing: Helfi responds HTTP 200 immediately and performs any heavier processing asynchronously.
- Training/Courses API: Not enabled / not in use in Helfi at this time.

2) UX and Brand Compliance Review
- Attached screenshots of the full Garmin connection and data experience in Helfi, including all Garmin branding/attribution placements.
- Garmin mention in Helfi Privacy Policy: https://helfi.ai/privacy (Section “1. Information We Collect” → “c. Data from Wearables & Third-Party Integrations”).

3) Account Setup
- API Blog email subscription: [confirmed / screenshot attached].
- Developer Portal authorized users (people added to the Garmin Developer Program account) are company-domain emails only (no freemail/shared inboxes).
- Note: the 2 Garmin Connect users used for “Active User Test” are end-user accounts that authorized the app for evaluation; they are not added as Developer Portal account users.
- Third-party integrator NDA: [N/A] or [attached].

Best regards,
Louie (Helfi)
