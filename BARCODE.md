# Barcode Scanner Handover (Dec 3, 2025)

## Current stable state
- Scanner is solid on iPhone PWA using **ZXing** (`decodeFromConstraints`) with rear camera, autofocus hint, try-harder hint, and no photo flow. UI is clear (frame + flash + status chip).
- Barcode lookup uses **FatSecret → OpenFoodFacts → USDA**. It charges **3 credits only when a product is found** (signed-in users; 402 if insufficient credits).
- Guard rail: `GUARD_RAILS.md` section 11 locks the scanner/decoder (ZXing only; no html5-qrcode/BarcodeDetector swaps) and there is an in-code note at `startBarcodeScanner`.

## Next task (user request)
- Barcode-scanned entries currently open as a **manual food entry** when edited. The user wants them to open as an **ingredient card** (like “Detected Foods” from photo/AI analysis).
- For barcode scans, save the diary entry in the same ingredient-card shape as photo analysis (single item with name, brand, serving_size, per-serving macros, portion mode, barcode metadata). Mark it so the edit UI picks the ingredient card, not the manual editor.
- Do **not** change the scanner itself; only adjust how barcode results are stored and how the edit flow decides to render them.

Implementation notes:
1) Map the barcode lookup result (`source`, `name`, `brand`, `serving_size`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `barcode`) into the same data shape used by `analyzedItems`/ingredient cards in `app/food/page.tsx`. One item per scan is fine.
2) When inserting into the diary after a barcode hit, store this item payload (and a marker) so the edit flow recognizes it as an ingredient card entry.
3) Update the edit/view logic to render the ingredient card when that marker/data shape is present (instead of the manual text editor). Keep barcode metadata intact.
4) Keep all guard rails: don’t alter the ZXing scanner or reintroduce photo flow.

Pointers:
- Scanner/handler: `app/food/page.tsx` (`lookupBarcodeAndAdd` and the insert path for barcode results).
- Ingredient cards: `app/food/page.tsx` (“Detected Foods” section and the data shape powering `analyzedItems`).
- API: `app/api/barcode/lookup/route.ts` (already locked/credit-checked; no change needed for this task).

What not to do:
- Don’t touch the scanner implementation or decoder choice.
- Don’t remove credit charging (3 credits, only when product found).
- Don’t reintroduce photo upload for scanning.
