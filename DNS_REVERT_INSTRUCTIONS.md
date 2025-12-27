# DNS Revert Instructions

## Problem
We changed DNS from `216.198.79.193` (working for 4-5 months) to `76.76.21.21`, causing Wi-Fi router cache issues.

## Solution: Revert to Original IP

Go back to GoDaddy DNS management and change the A record back:

1. Go to: https://dcc.godaddy.com/manage/helfi.ai/dns
2. Edit the A record for `@`
3. Change IP from: `76.76.21.21`
4. Change IP back to: `216.198.79.193`
5. Save

This will restore the original working configuration that was stable for months.

## Why This Makes Sense
- The old IP (`216.198.79.193`) was working perfectly for 4-5 months
- Vercel's "recommended" IP might just be their preferred IP, but the old one still works
- No user DNS configuration changes needed
- No router restarts needed
- Works immediately for all users

## After Reverting
- Wi-Fi will work immediately (routers already have old IP cached)
- Mobile carrier will work (they'll re-resolve to old IP)
- Desktop will continue working
- No user action required













