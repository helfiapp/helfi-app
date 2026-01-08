# Homepage Redesign Tracker

Legend: ✅ completed, ⬜ pending.

## TODO (Numbered)
1. ✅ Audit current website (homepage + public pages) for navigation, copy, CTAs, imagery, and SEO gaps.
2. ✅ Inventory app features and routes to align marketing content with real workflows.
3. ✅ Define new information architecture: feature pages + hover mega menu for "Features".
4. ✅ Separate features into dedicated pages and add a feature index.
5. ⬜ Implement mega menu for "Features" once all feature pages are finalized.
6. ⬜ Rebuild homepage hero and mockups with updated PWA-style device frames/screens.
7. ✅ Rewrite homepage + feature copy to match current product behavior (7-day insights, pricing, data flow).
7. ⬜ Expand FAQ into a comprehensive dedicated page and remove/shorten homepage FAQ.
8. ⬜ SEO overhaul: per-page metadata, OG tags, sitemap/robots, schema, internal linking, and non-generic copy.
9. ⬜ Add a health imagery library and place images strategically across the site.
10. ⬜ Increase and place CTAs across sections with clear primary/secondary actions.
11. ⬜ Implement analytics for page views, time on page, and click tracking (choose tool and opt-in policy).
12. ⬜ QA pass: accuracy, accessibility, mobile, and performance.
13. ⬜ Fix food diary banner carousel (desktop smooth auto-scroll + lightbox close button).
14. ⬜ Normalize public header styling to match homepage header across all pages.

## Website Audit (Current State)
- Homepage lives in `app/page.tsx` and is entirely client-rendered, with sections for hero video, screenshot carousel, feature grid, "Why Helfi", benefits, voice AI, pricing, and FAQ.
- Navigation on the homepage uses in-page scroll anchors only (Features, Pricing, Why Helfi, FAQ). No feature pages exist yet.
- Homepage copy contains claims that likely need verification or updating: "instant insights", "HIPAA-compliant", "85% accuracy", and plan/credit quantities that differ from `STRIPE_PRODUCTS_DOCUMENTATION.md`.
- The FAQ is duplicated: a short section in `app/page.tsx` and a separate page in `app/faq/page.tsx` with overlapping but different answers.
- Public pages include `/` (homepage), `/faq`, `/privacy`, `/terms`, `/help`, `/affiliate/terms`, and auth pages. `/support` is not in the public allowlist but is linked from `/help`.
- SEO coverage is minimal: only global metadata in `app/layout.tsx`, no per-page metadata, no Open Graph tags, and no sitemap/robots.
- Visual assets are limited to the hero video, the screenshot carousel in `public/screenshots/hero`, and a single stock-style image. No broader health imagery library exists.
- CTA density is low outside the pricing cards and header buttons; the hero section only offers "Watch Demo".

## App Feature Inventory (Current State)
- Onboarding and health setup: `/onboarding` (core health profile gating for Insights).
- Dashboard: `/dashboard`.
- Health tracking and device sync: `/health-tracking`, `/devices` (Fitbit + Garmin integrations shown in UI).
- AI Insights suite: `/insights`, `/insights/weekly-report`, `/insights/safety`, `/insights/supplements`, `/insights/supplements/[name]`, `/insights/issues/[issueSlug]` with tabs for nutrition, supplements, medications, exercise, labs, lifestyle, and interactions.
- Food analysis and diary: `/food`, `/food/analysis`, `/food/build-meal`, `/food/add-ingredient`, `/food/recommended`, `/food/recommended/explain`.
- Symptom tracking: `/symptoms`, `/symptoms/history`.
- Medical image analysis: `/medical-images`, `/medical-images/history`.
- Lab report upload and analysis: `/lab-reports`.
- Mood tracking: `/mood`, `/mood/quick`, `/mood/journal`, `/mood/insights`, `/mood/activity`, `/mood/history`, `/mood/preferences`.
- Daily check-ins: `/check-in`, `/check-in/history`.
- Health tips: `/health-tips`, `/health-tips/history`.
- Notifications: `/notifications` with subpages for inbox, quiet hours, health reminders, mood reminders, AI insights, delivery, and account security.
- Voice AI chat: `/chat` (voice interface), plus `/chat-log`.
- Account, profile, and billing: `/profile`, `/account`, `/settings`, `/settings/food-diary`, `/billing`.
- Support: `/help`, `/support`.
- Affiliate portal: `/affiliate`, `/affiliate/apply`, `/affiliate/terms`.
- Admin and analytics: `/admin-panel`, `/main-admin` (internal analytics dashboard + support tooling).
- PWA entry and service worker: `/pwa-entry`, `/public/sw.js`.

## Information Architecture - Feature Pages (Draft)
Primary goal: each core module gets its own public feature page with segmented sections and a phone mockup per segment.

Proposed feature page map:
1. `/features/health-tracking` - Health Tracking and Wearables
2. `/features/ai-insights` - AI Insights and Weekly Reports
3. `/features/nutrition-food` - Food Analysis and Nutrition Logging
4. `/features/supplement-safety` - Supplements and Medication Safety
5. `/features/lab-reports` - Lab Report Analysis
6. `/features/medical-imaging` - Medical Image Analysis
7. `/features/symptom-tracking` - Symptom Tracking
8. `/features/mood-tracking` - Mood Tracking
9. `/features/daily-check-ins` - Daily Check-ins and Health Tips
10. `/features/voice-ai` - Voice AI Assistant

Mega menu grouping (future state, after pages exist):
- Track: Health Tracking, Daily Check-ins, Mood Tracking
- Analyze: Food Analysis, Lab Reports, Medical Imaging, Symptom Tracking
- Understand: AI Insights, Supplement Safety
- Assist: Voice AI
- Programs: Affiliate Program (link), FAQ, Help

## Completed Updates (Recent)
- Feature pages and the `/features` index are live, using a shared PublicHeader.
- Mega menu UI exists in the PublicHeader (icons + grouping), pending final layout polish.
- Homepage copy updated for weekly insights, device support, and affiliate program CTA.
- Feature page layout upgraded with a richer structure (overview, capabilities, walkthrough, use cases, outcomes).
- Food diary feature page now uses curated imagery, banner background, and a carousel region on top of the banner (fixes still needed; see handover).

## Active Issues (Handover)
- Food diary banner carousel: desktop smooth auto-scroll not visible; lightbox close button not clickable.
- Public header has a light green gradient near the logo; must match homepage header exactly on every page.

## Feature Page Layout Rules (Apply to Future Pages)
- Use an expanded overview layout when imagery is strong: hero image + overview text, followed by two horizontal cards ("At a glance" and "Best for") to avoid empty space.
- Do not mix lifestyle photos with phone mockups inside the same step. If a step uses photos, make it a full-width photo gallery. If it uses phones, keep them in a phone-only grid.
- Use fewer, higher-impact images rather than every available asset. Each image must clearly match the step content.
- Lifestyle photos should feel large and premium (full-width cards with object-cover). Phone mockups should be contained (object-contain) and never oversized.
- Keep step layouts balanced: text left, imagery right; maintain consistent spacing and align CTA rows.
- Avoid visual clutter and unused whitespace; every block should feel intentional and content-dense.
