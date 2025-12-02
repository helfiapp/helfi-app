# Barcode Scanner Attempts (Handover)

## What I tried in this session
- **UI alignment/overlay fixes:** Removed extra corner brackets, removed blur overlays, forced the camera video to be full-screen behind a single white frame (Cronometer-style), widened the scan box to match the frame.
- **Torch support:** Added torch toggle using MediaStream track constraints; later relaxed typing to satisfy builds.
- **Backend lookup:** Kept FatSecret → OpenFoodFacts → USDA fallback flow; no changes to lookup logic beyond a small USDA fallback tweak earlier.
- **Decoders tested:**
  - **html5-qrcode live camera:** Original approach; on iOS PWA it showed video but often failed to decode. Hid its default overlay; still unreliable.
  - **Native `BarcodeDetector` live camera (iOS):** Switched to native detector as the primary path on iOS. In some cases the camera feed failed to start (black screen) or detector returned nothing even with a clear barcode.
  - **Photo decode fallback (added, then removed):** Added a “Take Photo” option that decoded a still image via html5-qrcode; user requested removal, so this flow is now gone.
- **Permissions/error handling:** Added clearer errors when camera start failed or detector unavailable. Currently, if native detector fails on iOS, it falls back to html5-qrcode; but html5-qrcode has been unreliable on the user’s device.

## Current state (after my last change)
- iOS tries **native `BarcodeDetector`** first; if unavailable or fails, it falls back to **html5-qrcode** live scanning.
- “Take Photo” button and photo-decoding flow **removed** per user request.
- Overlay is a single white rounded frame; video is forced to fill the screen; torch toggle remains.
- Despite this, user reports: camera sometimes black (no feed) or feed present but **no scans**.
- Overlay dimming: attempted full-screen dim (`bg-black/35`), but user still sees dim only over part of the view. Needs further layout fix.
- Next agent must follow `GUARD_RAILS.md` when touching any protected areas to avoid breaking locked flows.

## Likely root cause
- iOS PWA camera/decoder instability: html5-qrcode is flaky on iOS PWAs; native `BarcodeDetector` may not be available or may fail to start due to permissions/environment.
- Camera permission/workflow may need a dedicated permission prompt flow, and a hard fallback path without html5-qrcode.

## Suggested next steps for the next agent
1) **Drop html5-qrcode on iOS entirely.** Use native `BarcodeDetector` if present; otherwise present a clear “camera not supported in this mode” message and only offer manual entry (per user request, no photo flow).
2) **Camera start debug:** Add logging around `getUserMedia` errors and surface a specific prompt to the user (e.g., allow camera in Safari settings, disable Private Browsing). Confirm if the PWA is in standalone mode and whether camera is allowed.
3) **Feature-detect `BarcodeDetector`:** If absent on iOS, don’t try html5-qrcode; instead, show a concise “Camera scanning not supported here; please type the barcode” to avoid the black screen loop.
4) **Keep UI minimal:** Single frame, torch toggle (optional), manual entry. No photo upload/button.

## Files touched
- `app/food/page.tsx` (scanner UI and detector logic)
- `app/api/barcode/lookup/route.ts` (minor USDA/OpenFoodFacts fallback tweak earlier in the session)
