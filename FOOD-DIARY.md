## Food Diary – Handover and Fix Plan

**Last updated:** November 16, 2025  
**Baseline code version:** commit `557b732` (current live baseline after rollback)

This document is the **single source of truth** for the Food Diary / Food Analyzer area.  
Every future agent must read this fully before changing anything under `/app/food` or the related APIs.

---

## 1. What the user originally asked for (this round)

1. Add reliable **Units** controls on ingredient cards:
   - Whole eggs / crackers / pieces.
   - 1 oz increments for liquids (e.g. orange juice), no strange fractions.
2. Keep `servings` fractional under the hood for precision, but hide that complexity in normal use.
3. Add safe toggles:
   - **Energy**: calories ↔ kilojoules.
   - **Volume**: ounces ↔ milliliters (for drinks and other volume-based items).
4. Absolutely **do not break** the existing ingredient card UI/UX, which has taken many hours of work.

During implementation we discovered deeper issues that must be fixed **before** units/toggles are added.

---

## 2. What went wrong & why we rolled back

1. An agent implemented early versions of:
   - New Units behaviour.
   - kcal ↔ kJ and oz ↔ ml toggles.
2. A function-order bug briefly broke the Food page; this was fixed but exposed more serious issues:
   - **Date bug** in `/api/food-log`:
     - Meals created on the **15th (Melbourne time)** appeared when viewing **14/11/2025**.
   - **Ingredient cards disappearing**:
     - Recent entries like **crackers** and **San Remo** had full cards at creation and in Edit mode.
     - Later, after date navigation, those entries lost their cards, while an older **scrambled eggs** entry still showed cards.
3. Because this area is extremely sensitive and has a long history of regressions, the user requested a **hard rollback** to commit `557b732`.  
   That commit is now the working baseline.

Your job as the next agent:
- Start from **exactly** this baseline.
- Fix the underlying **date** and **card persistence** issues.
- Only then reintroduce units/toggles using the plan in section 5.

---

## 3. Current behaviour & confirmed bugs

### 3.1 Date bug – entries show up on the wrong day

**Relevant files**
- `app/api/food-log/route.ts`
- `app/food/page.tsx`

**How it works now**

- The client (Food Diary page) calls history like:

```ts
const tz = new Date().getTimezoneOffset()
fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`)
```

- On the server (`GET /api/food-log`):

```ts
const dateStr = searchParams.get('date')            // YYYY-MM-DD
const tzOffsetMinRaw = searchParams.get('tz')       // from getTimezoneOffset()

const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
const tzMin = Number.isFinite(parseInt(tzOffsetMinRaw || ''))
  ? parseInt(tzOffsetMinRaw || '0', 10)
  : 0

// CURRENT (BUGGY) LOGIC
const startUtcMs = Date.UTC(y, m - 1, d,   0, 0, 0, 0) - tzMin * 60 * 1000
const endUtcMs   = Date.UTC(y, m - 1, d,  23,59,59,999) - tzMin * 60 * 1000
```

- `getTimezoneOffset()` returns the **difference between local time and UTC in minutes**.  
  - For Melbourne (UTC+10/11), this value is **negative** (e.g. `-600`, `-660`).
- Subtracting `tzMin` therefore **shifts the window in the wrong direction** for negative offsets.

**Practical effect**

- The server’s “day window” does not match the local date the user selected.
- Result: entries created on the **15th (local)** appear when the app asks for logs for the **14th**, which is exactly what the user is seeing.
- Today’s view (which uses `todaysFoods` from `/api/user-data`) can still appear correct, but history view based on `/api/food-log` is wrong.

### 3.2 Ingredient cards disappearing

**Relevant files**
- `app/food/page.tsx`
- `app/api/user-data/route.ts`
- `app/api/food-log/route.ts`
- `prisma/schema.prisma` (`model FoodLog`)

**How cards are supposed to work**

1. Each analyzed meal builds a structured `analyzedItems` array with:
   - `name`, `brand`, `serving_size`, `servings`,
   - `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`.
2. When saving via `addFoodEntry`:

```ts
const newEntry = {
  id: Date.now(),
  localDate: selectedDate,
  description: finalDescription,
  time: new Date().toLocaleTimeString(...),
  method,
  photo: method === 'photo' ? photoPreview : null,
  nutrition: nutrition || analyzedNutrition,
  items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : null,
  total: analyzedTotal || null,
}
```

3. This entry is persisted in two places:
   - In the user’s `todaysFoods` (via `/api/user-data` and the hidden `__TODAYS_FOODS_DATA__` health goal).
   - In a separate `FoodLog` row via `/api/food-log`:
     - Currently stores `description`, `imageUrl`, `nutrients`, `createdAt` – **no `items` field**.

**How Edit mode restores cards**

- Function `editFood(food)` in `app/food/page.tsx` does:

```ts
if (food.items && Array.isArray(food.items) && food.items.length > 0) {
  // Use saved items directly (ideal)
} else if (food.description) {
  // Try to rebuild items from description text:
  // 1) extractStructuredItemsFromAnalysis(food.description)
  // 2) extractItemsFromTextEstimates(food.description)
}
```

**What the user has observed**

- The **scrambled eggs** entry (created earlier) still shows cards fine.
- Very recent entries like **crackers** and **San Remo**:
  - Showed full cards at creation and in early edits (so they originally had valid `items`).  
  - Later, after being shifted to the previous date by the date bug and/or edited in history mode, some of those entries **lost their cards**.

**Likely root cause**

- History view uses `/api/food-log` where `FoodLog` does **not** store the `items` array.
- When editing from history, `editFood(food)` often has only the description and totals:
  - Text parsers sometimes recreate reasonable `items` (scrambled eggs).  
  - For certain descriptions (crackers/San Remo), parsers fail → `analyzedItems` empty.
- If an entry is ever saved while `analyzedItems` is empty, `updateFoodEntry` can persist `items: []`, permanently losing card data for that entry.
- The date bug exposes this more often by pushing entries into the history path earlier than expected.

---

## 4. Phase 1 – Fix date logic (must be done first)

### 4.1 Correct `/api/food-log` time-zone math

In `app/api/food-log/route.ts`, change the UTC window to **add** the offset, not subtract it:

```ts
const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
const tzMin = Number.isFinite(parseInt(tzOffsetMinRaw || ''))
  ? parseInt(tzOffsetMinRaw || '0', 10)
  : 0

// FIXED WINDOW
const startUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) + tzMin * 60 * 1000
const endUtcMs   = Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999) + tzMin * 60 * 1000
```

### 4.2 Manual verification (especially in Melbourne time)

On production, with the user’s account:

1. Pick a date (e.g. 15th of a month) and add a new test meal.
2. Confirm it appears:
   - In Today’s view (using `todaysFoods`), and  
   - When viewing that exact date via the date selector in history mode.
3. Use **Previous/Next**:
   - Confirm the test entry **does not** appear on the previous or next day.
4. Try again near midnight or at edge cases if possible (optional but recommended).

### 4.3 Historical repair (planning only)

- Some `FoodLog` rows may have “incorrect” apparent dates because of the old window.  
- Document a one-off script or SQL plan to repair them if the user ever wants it, but **do not run it** without explicit permission.

---

## 5. Phase 2 – Make ingredient cards robust

### 5.1 Persist `items` into history logs going forward

1. **Schema:** update `prisma/schema.prisma` `model FoodLog` to also store `items`:

```prisma
model FoodLog {
  id          String   @id @default(cuid())
  userId      String
  name        String
  imageUrl    String?
  description String?
  nutrients   Json?
  items       Json?      // NEW: structured ingredient list
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  images      File[]   @relation("FoodLogImages")
}
```

2. **Saving:** in `saveFoodEntries` (`app/food/page.tsx`), when calling `/api/food-log`, include `items`:

```ts
const last = updatedFoods[0]
if (last) {
  fetch('/api/food-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: last.description,
      nutrition: last.nutrition,
      imageUrl: last.photo || null,
      items: last.items || null,
    }),
  }).catch(() => {})
}
```

3. **Loading:** in `GET /api/food-log`, include `items` when building `historyFoods`:

```ts
const mapped = logs.map((l: any) => ({
  id: new Date(l.createdAt).getTime(),
  dbId: l.id,
  description: l.description || l.name,
  time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  method: l.imageUrl ? 'photo' : 'text',
  photo: l.imageUrl || null,
  nutrition: l.nutrients || null,
  items: (l as any).items || (l.nutrients as any)?.items || null,
  localDate: dateStr,
}))
```

### 5.2 Prefer stored items in `editFood`

In `editFood(food)` (`app/food/page.tsx`):

1. If `food.items` exists and is non‑empty:
   - Use `enrichItemsFromStarter(food.items)` and **do not** attempt to parse description text.
2. Only when `food.items` is missing or empty:
   - Try `extractStructuredItemsFromAnalysis(food.description)`.  
   - If that fails, try `extractItemsFromTextEstimates(food.description)`.

This ensures that once an entry has cards, Edit mode does not depend on brittle text parsing.

### 5.3 Guard against wiping cards on save

In `updateFoodEntry`:

```ts
const updatedEntry = {
  ...editingEntry,
  localDate: editingEntry.localDate || selectedDate,
  description: finalDescription,
  photo: photoPreview || editingEntry.photo,
  nutrition: analyzedNutrition || editingEntry.nutrition,
  items:
    analyzedItems && analyzedItems.length > 0
      ? analyzedItems
      : (editingEntry.items || null),
  total: analyzedTotal || (editingEntry.total || null),
}
```

This prevents a temporary failure to build `analyzedItems` from permanently erasing cards.

### 5.4 Backfill critical recent entries (optional but recommended)

Once Phase 1 and 2 changes are stable on production:

1. Work with the user to identify high‑value entries (e.g. crackers and San Remo meals).
2. Re‑analyze those photos with the fixed code to ensure:
   - `items` are stored in both `todaysFoods` and `FoodLog`.  
   - Edit mode reliably shows ingredient cards even after date navigation and refreshes.

---

## 6. Phase 3 – Reintroduce units and toggles (from `fix.plan.md`)

The original unit/toggle plan is still desired; it should be implemented **after** Phases 1–2.  
This section is lifted directly (with minor wording tweaks) from `fix.plan.md`.

### 6.1 Goals

- Make `Units` behave predictably: whole eggs/crackers, 1 oz steps for liquids, no weird fractions.  
- Keep fractional `servings` internally but hide the complexity for normal use.  
- Add safe toggles for calories ↔ kilojoules and ounces ↔ milliliters without altering the existing card layout.

### 6.2 Step 1: Stabilize serving/unit calculations

1. In `app/food/page.tsx`, fully trace how `servingUnitMeta` is built from `serving_size` (using `parseServingQuantity`) and how `servings` and `Units` are derived and updated.
2. Replace the current mixed stepping logic for `Units` so that:
   - `Units` always changes in whole-number steps (no 0.3, 0.5, etc), but the underlying `servings` can still be fractional.
   - For any item, `servings = units / servingUnitMeta.quantity` and we round `units` to an integer before storing.
3. Keep the `Servings` control flexible (can stay fractional) but ensure its +/- buttons and direct input changes always recalculate `Units` consistently with the same formula.
4. Add a small helper to clamp and round unit and serving values to avoid float noise (e.g., `Math.round(value * 1000) / 1000`) before display.

### 6.3 Step 2: Handle discrete vs volume/weight foods correctly

1. Refine `isDiscreteUnitLabel` in `app/food/page.tsx`:
   - Extend the discrete list to include terms like `cracker`, `crackers`, `chip`, `chips`, and any other obvious piece-based snack words.
   - Keep weight/volume words (g, kg, ml, l, oz, lb, cup, tbsp, tsp, etc.) strictly treated as non-discrete.
2. Introduce a small helper like `getUnitStep(servingUnitMeta, mode)` that returns:
   - `1` unit for discrete items (eggs, slices, crackers, etc.).
   - `1` unit for liquids measured in ounces (so an 8 oz glass can move 7, 8, 9, 10 oz, etc.).
   - `1` unit for grams/milliliters internally (even if we later show them grouped visually).
3. Wire this helper into the +/- buttons and `Units` input so both desktop and mobile behaviors are consistent.

### 6.4 Step 3: Energy unit toggle (calories ↔ kilojoules)

1. Add a simple state on the food page (e.g., `energyUnit` = `'kcal' | 'kJ'`) with default `'kcal'`.
2. Add a tiny, inline toggle control near the existing per-serving and totals energy labels (reusing current typography and spacing so the card layout doesn’t change, just the label text).
3. Update `formatMacroValue` or a new `formatEnergyValue` helper in `app/food/page.tsx` so that:
   - Under the hood, values stay stored in calories.
   - When `energyUnit === 'kJ'`, values are converted using a fixed factor (e.g., `kJ = kcal * 4.184`, rounded to a sensible whole or one decimal place).
4. Ensure nutrient chips and totals sections both respect the selected energy unit while keeping fonts, colors, and chip layout identical.

### 6.5 Step 4: Volume unit toggle (ounces ↔ milliliters)

1. Add a `volumeUnit` state (e.g. `'oz' | 'ml'`) on the food page, defaulting to `'oz'` so existing behavior is untouched for current users.
2. Detect serving sizes that are volume-based (contain `oz`, `ml`, `cup`, etc.) using the existing parsing logic.
3. For items with ounces:
   - When `volumeUnit === 'oz'`, continue to show ounces and use 1 oz steps for `Units`.
   - When `volumeUnit === 'ml'`, convert the base quantity using a standard factor (e.g., `1 oz ≈ 29.57 ml`), update the unit label to `ml`, and use a whole-number ml step (e.g., 10 ml) for `Units`.
   - Keep `servings = units_in_current_unit / base_quantity_in_current_unit` so totals remain correct regardless of display mode.
4. Place the ounces↔ml toggle as a small pill-style control in the same area as the energy toggle or near the units label, matching existing styles so the card layout does not shift.

### 6.6 Step 5: Testing and verification

1. Manually test on desktop and iPhone for:
   - Eggs (per-piece discrete), crackers (newly discrete), and a glass of orange juice (8 oz) to verify clean 1-unit or 1-oz steps only.
   - Switching between calories and kilojoules and confirming that per-serving and total energy values update consistently without layout changes.
   - Switching between oz and ml for a liquid item and checking that increments, totals, and labels all stay correct.
2. Spot-check a few other starter foods from `data/foods-starter.ts` to confirm no regressions in unit behavior.
3. Once everything passes, summarize the behavioural changes for the user and wait for explicit approval before any deployment.

---

## 7. To-do checklist (for the next agent)

- [ ] Phase 1: Fix `/api/food-log` date window and verify behaviour in Melbourne and at least one other timezone.  
- [ ] Phase 2: Persist `items` to `FoodLog`, prefer stored items in `editFood`, and guard against wiping cards; backfill key recent entries (crackers/San Remo) once stable.  
- [ ] Phase 3: Implement units and toggles exactly as in section 6 and complete a full regression sweep on desktop + iPhone.


