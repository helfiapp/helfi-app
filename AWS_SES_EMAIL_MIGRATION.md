# AWS SES Email Migration

## Current status — 25 August 2026

- `helfi.ai` and `support@helfi.ai` are verified in AWS Sydney.
- DKIM and the custom return-path DNS records are verified.
- AWS production sending access is approved and sending is enabled.
- Every current website email sender now routes through `lib/email-client.ts`.
- The automated coverage check passes for 30 send calls across 18 files.
- A real send through `lib/email-client.ts` to the internal Helfi mailbox and the external SonicWeb test mailbox was accepted by AWS SES on 25 August 2026. The external message appeared in Apple Mail and the Helfi inbox showed the new unread message.
- The AWS-hosted app will use its private AWS runtime role; permanent AWS keys must not be stored in app settings.
- Resend remains the zero-cost fallback until the AWS-hosted app passes the real internal and external tests below.

## Goal

Move all Helfi app emails from Resend to AWS SES without missing any email path. Keep Resend available as a temporary fallback until AWS is verified in production.

## How provider selection works

- `EMAIL_PROVIDER=aws-ses` selects AWS SES.
- `EMAIL_PROVIDER=resend` selects Resend.
- If `EMAIL_PROVIDER` is not set, AWS is used when all AWS email settings exist; otherwise Resend is used when its key exists.
- Do not remove the Resend setting until every live test below passes.

## AWS settings required in Amplify

- `EMAIL_PROVIDER`
- `HELFI_AWS_SES_REGION` (Amplify reserves names that start with `AWS`)
- An Amplify runtime role restricted to sending Helfi email through SES

Do not add permanent AWS access keys to the app.

## Full email inventory

The shared provider covers every current `emails.send()` call in the app:

- Account signup verification
- Resend-verification requests
- Password reset
- Welcome email
- Waitlist user acknowledgement
- Waitlist support notification
- Support ticket replies and support automation
- Admin alerts and admin test emails
- Admin bulk emails
- Billing and payment alerts
- Affiliate review alerts
- Practitioner emails and outreach
- Weekly health reports
- Missing-food requests and scheduled food updates

All current senders use `support@helfi.ai`, with different friendly display names.

## Required checks before switching off Resend

1. Verify the `helfi.ai` domain and DKIM in AWS SES.
2. Confirm AWS SES production sending remains enabled.
3. Attach the restricted AWS runtime role to Amplify.
4. Deploy the shared email provider changes.
5. Test internal delivery to `support@helfi.ai`.
6. Test external delivery to `info@sonicweb.com.au`.
7. Test signup, verification, password reset, waitlist, support, weekly report and admin test email flows.
8. Check AWS logs and SES delivery results for errors.
9. Leave Resend active briefly as a rollback option.
10. Cancel Resend only after all checks pass.

## Automated checks

- `npm run check:email-coverage`
- `npm run check:email-provider`
- `npx tsc --noEmit`

The coverage check finds any email sender that bypasses the shared provider. The provider check uses fake test values and does not send a real email or expose a real credential.
