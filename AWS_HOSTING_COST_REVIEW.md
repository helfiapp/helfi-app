# AWS Hosting Cost Review — 5 August 2026

## Owner decision — 25 August 2026

The owner decided to move the website to AWS Amplify while keeping the Neon database active. This replaces the earlier recommendation below.

Current migration position:

- The AWS Amplify test website has built successfully.
- AWS SES is verified and approved for production sending.
- The Route 53 DNS zone is ready, but GoDaddy still controls the live domain, so the live site has not been switched.
- All 26 existing Vercel Blob files (14,524,289 bytes) have been copied to encrypted AWS S3 storage and the totals were verified.
- Database links that still pointed to Vercel Blob were moved to the copied AWS files.
- Nine replacement schedules are prepared in QStash and paused until cutover.
- The shared AWS email code passed a real internal/external send and external inbox delivery check.
- Neon remains the production database and must not be cancelled.
- Vercel must remain active until the AWS runtime role, latest deployment, live email tests, upload/download tests, background schedules, and domain cutover all pass.

## Earlier verdict (superseded by the owner's decision above)

Do **not** move the whole live app and database to AWS for cost savings right now.

AWS email is clearly cheaper and should be completed. The full app/database move is not a clear saving after the introductory AWS allowance ends, and the cheapest AWS database option would give Helfi less safety and capacity than Neon.

## Current real usage

### Vercel — July 2026

- Pro plan: **US$20.26**
- App resource use: **US$1.49**
- Total shown by Vercel: **US$21.75**
- The app used about 92 GB-hours, 86,675 function requests, 1.88 active CPU hours and 0.82 GB transfer.

### Neon — August 2026 estimate

- Usage in the first five days: 26.91 CU-hours
- Database storage: 1.11 GB
- Projected monthly compute and storage: about **US$18.07**
- Current combined Vercel + Neon estimate: about **US$39.82 per month**

The Neon amount is a projection because the current billing month is not complete.

## AWS estimates using the same workload

### Email

AWS email should cost only cents at Helfi's current traffic. This replaces the Resend AU$30 monthly plan.

### Web app on AWS Amplify

The July workload fits just inside Amplify's introductory allowances:

- 92 of 100 included GB-hours
- 86,675 of 500,000 included requests
- 0.82 of 15 included GB transfer

Likely cost during the first 12 months: **about US$0**, provided usage remains near today's level.

Likely cost after those allowances end: **about US$18.55 per month**, plus build costs. That is only around US$3 less than the current Vercel total.

### Database on AWS

The live database is 1,031 MiB across 104 tables. One food-library table uses about 941 MiB. The database is already slightly larger than the AWS free Aurora limit of 1 GiB.

Sydney prices checked from AWS's 4 August 2026 price list:

- Smallest RDS PostgreSQL server, 1 GB memory: **US$18.25/month**
- Minimum 20 GB database storage: **US$2.76/month**
- Cheapest RDS total: **about US$21.01/month**
- 2 GB RDS size: **about US$39.99/month** including storage
- Aurora Serverless: **US$0.20 per capacity-unit hour**; the current awake time would make it substantially more expensive than Neon.

The cheapest 1 GB RDS option is not a safe cost win. It would have almost no memory left after holding Helfi's 1 GB database and would lose Neon's automatic scaling. AWS also describes these small burstable database sizes as more suitable for development and testing.

## Full-stack comparison after introductory allowances

- Current Vercel + Neon: **about US$39.82/month**
- AWS Amplify + smallest 1 GB RDS: **about US$39.56/month**, plus builds and logs — effectively no saving, with less database headroom
- AWS Amplify + 2 GB RDS: **about US$58.54/month**, plus builds and logs

## AWS free-account warning

- The AWS account has US$100 credit remaining.
- The credit shows an expiry of 3 August 2027.
- The AWS free account itself ends after six months, or earlier if the credit is used. It must be upgraded to a paid account to keep production services running after that point.
- Moving the live app onto the free account without this safeguard could cause an outage when the free period ends.

## Migration work found

A hosting move is not a simple switch. Helfi currently has:

- 21 code areas using Vercel file storage
- 9 scheduled jobs run by Vercel
- long-running health report, image and AI jobs
- reminders handled through QStash
- a sizeable Next.js application that needs a separate AWS test deployment

## Recommended action

1. Finish and prove the AWS email move.
2. Keep Vercel and Neon for now.
3. Do not cancel Resend until the AWS external-email tests pass.
4. Revisit hosting after the app has more steady traffic, or first reduce the database's always-awake time and measure another full month.

## Primary pricing references

- AWS Amplify: https://aws.amazon.com/amplify/pricing/
- AWS Aurora: https://aws.amazon.com/rds/aurora/pricing/
- AWS RDS storage: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html
- Neon: https://neon.com/pricing
- Vercel: https://vercel.com/docs/cli/usage
