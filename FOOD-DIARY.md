## Emergency follow-up – Agent GPT‑5.1 High (November 19, 2025)

> **Status after this session (honest summary)**  
> - Entries for past dates (e.g. **18/11/2025**) still **disappear after a full page refresh**, even though they look correct immediately after saving.  
> - Today’s view continues to work because it reads from the `todaysFoods` snapshot, but the permanent history table (`FoodLog`) is **not reliably getting rows** for the user’s new meals.  
> - I have **not** changed the core timezone logic or database schema from the previous stable handover; all work here was around the save pipeline and UI behaviour.

This section documents **exactly** what I changed and observed so that the next agent:

- Understands the current code paths and DB state.  
- Does **not** repeat these same experiments.  
- Can design a cleaner, more reliable fix with minimal new regressions.

---

### A. Changes I made in this session (do not re‑attempt these blindly)

#### A.1 Save pipeline in `app/food/page.tsx` – `saveFoodEntries`

File: `app/food/page.tsx`  
Function: `saveFoodEntries(updatedFoods, options?)`

1. **Original behaviour (from previous agent, simplified):**
   - Immediately updated context via `updateUserData({ todaysFoods: updatedFoods })`.  
   - Posted to `/api/user-data` with:
     - `todaysFoods: updatedFoods`  
     - `appendHistory` flag (default `true`)  
   - Backend (`POST /api/user-data`) used `appendHistory` to optionally append the latest entry (`todaysFoods[0]`) into the `FoodLog` table.

2. **My first change (attempt to separate “today snapshot” from “history append”):**
   - Still called `updateUserData({ todaysFoods: updatedFoods })`.  
   - **Forced** the `/api/user-data` call to use `appendHistory: false` so that endpoint would **only** update the `__TODAYS_FOODS_DATA__` snapshot and **not** touch `FoodLog`.  
   - Added a **new direct call** to `/api/food-log`:
     - Payload: `{ description, nutrition, imageUrl, items, localDate }`.  
     - `localDate` taken from `latest.localDate` or `selectedDate`.  
   - Rationale: make the permanent history writes go through one dedicated endpoint instead of two separate paths.

3. **Follow‑up change (to avoid completely disabling the existing history path):**
   - Restored `appendHistory` to be **passed through** to `/api/user-data` again:
     - `body: { todaysFoods: updatedFoods, appendHistory }`.  
   - **Kept** the new direct `/api/food-log` POST when `appendHistory === true`.  
   - Effect: for a “new” entry we now have a **belt‑and‑suspenders** approach:
     - `/api/user-data` may append to `FoodLog` (existing logic).  
     - `/api/food-log` is also called explicitly.

4. **Key detail for future agents:**  
   - As of my last commit, `saveFoodEntries`:
     - Always updates `todaysFoods` in context.  
     - Always posts the full `updatedFoods` array to `/api/user-data` with `appendHistory` from the caller.  
     - Additionally posts the **latest entry only** to `/api/food-log` when `appendHistory` is true.
   - Callers:
     - `addFoodEntry(...)` calls `saveFoodEntries(updatedFoods)` (so `appendHistory` defaults to `true`).  
     - `updateFoodEntry(...)` and deletes call `saveFoodEntries(..., { appendHistory: false })` to avoid creating new history rows on edits/deletes.

#### A.2 Adding immediate history UI for non‑today dates – `addFoodEntry`

File: `app/food/page.tsx`  
Function: `addFoodEntry(description, method, nutrition?)`

Changes:

- After constructing `newEntry` (with `localDate: selectedDate`), I **kept**:
  - `const updatedFoods = [newEntry, ...todaysFoods]`  
  - `setTodaysFoods(updatedFoods)`  
  - `await saveFoodEntries(updatedFoods)`  
- I **added** logic so that when the user is **not** viewing today (`!isViewingToday`), the newly created entry is also pushed into the `historyFoods` state:

  - `setHistoryFoods(prev => [mappedNewEntry, ...prev])`  
  - `mappedNewEntry` copies the UI fields (`description`, `time`, `method`, `photo`, `nutrition`, `items`, `localDate`) but leaves `dbId` undefined (because the DB id from `FoodLog` is not known yet).

Goal: stop the just‑saved entry from “vanishing” immediately on non‑today dates before a reload.

#### A.3 History loading & de‑duplication – `loadHistory` effect

File: `app/food/page.tsx`  
Effect: `useEffect(() => { ... }, [selectedDate, isViewingToday])`

Existing behaviour:

- For non‑today dates, it fetches `/api/food-log?date=${selectedDate}&tz=${tz}`.  
- Maps each `FoodLog` row into `historyFoods` entries with:
  - `id` from `createdAt.getTime()`,  
  - `dbId` from `FoodLog.id`,  
  - `description`, `time`, `method`, `photo`, `nutrition`, `items`, and `localDate`.

My change:

- After mapping, I added a **client‑side de‑dupe pass**:
  - Build a key for each entry:  
    `key = (localDate + description + time + photo).toLowerCase()`.  
  - Use a `Set` to keep only the **first** entry for each key.  
  - Store the resulting `deduped` array in `historyFoods`.

Reason: once I turned on **both** `/api/user-data` append and direct `/api/food-log` writes, the same meal could surface twice in `FoodLog`; this de‑dupe is a defensive layer so the UI only shows one copy.

#### A.4 Entry options menu placement (Edit/Delete)

File: `app/food/page.tsx`  
Section: 3‑dot “entry options” menu for each meal.

- Original: menu container used `className="absolute right-0 mt-2 ..."` so the dropdown **opened below** the 3‑dot button.  
- Problem: on smaller screens / near the bottom of the list, the Delete option was partially off‑screen and the user could not scroll to it.  
- Change: switched to an **upwards** menu by using:  
  - `className="absolute right-0 bottom-full mb-2 ..."`  
- Result: Edit / Delete now appear **above** the 3‑dot button so both actions are accessible.

#### A.5 Database inspection (Prisma direct, read‑only)

From the repo root I ran small Node scripts using Prisma (no schema changes) to inspect the **live database**:

1. **Listing recent `FoodLog` rows:**
   - Command (simplified): queried `prisma.foodLog.findMany({ orderBy: { createdAt: 'desc' }, take: 25 })`.  
   - Finding:
     - For the current user (`email: "hendra16.icloud@gmail.com"`, `userId: "cmhmym0f60000r1lg61btiolp"`), there was **only one row**:  
       - `description: "DEBUG TEST ENTRY description"`  
       - `localDate: "2025-11-18"`  
       - `createdAt: "2025-11-17T13:52:13.477Z"`  
     - All other `FoodLog` rows belonged to older test users (`info@sonicweb.com.au`, etc.) and had `localDate = null`.

2. **Listing recent users:**
   - Command: `prisma.user.findMany({ select: { id, email, name, createdAt }, orderBy: { createdAt: 'desc' }, take: 10 })`.  
   - Confirmed the current user ids/emails and correlated them with the `FoodLog` rows above.

3. **Important side effect:**  
   - I **did** create a single debug row in `FoodLog` for the current user with description `"DEBUG TEST ENTRY description"` and `localDate: "2025-11-18"`.  
   - This was done to confirm that `FoodLog` writes for that user worked in principle.  
   - There are **no other** `FoodLog` rows for that user as of this session, which explains why the 18th consistently shows empty history after refresh: the history view depends solely on `FoodLog`, which currently has almost no data for them.

> Future agent note: please either delete or ignore this `"DEBUG TEST ENTRY description"` row once you have your own tests in place; it is harmless but may clutter analytics.

---

### B. Behaviour observed with the user (what still fails)

From multiple live tests with the user (all on production, Melbourne time):

1. **Saving on a past date (e.g. 18/11/2025):**
   - User selects **18/11/2025** in the date selector.  
   - Adds a new meal (e.g. burger, grilled salmon).  
   - Immediately after saving, the entry **appears** under Meals for that date (thanks to local state updates).  
   - After a manual **browser refresh**:
     - The app reloads on **today’s date** (e.g. 19/11/2025) showing the new meal under **Today’s Meals** (coming from `todaysFoods`).  
     - When the user navigates back to **18/11/2025**, the Meals section shows **“No food entries yet for this date”**.

2. **Duplication while I was experimenting:**
   - At one point (before de‑dupe and before I restored `appendHistory` to `/api/user-data`), the user observed **duplicate entries** for the same burger on 18/11.  
   - After subsequent changes (and dedupe), the duplicates disappeared, but the core issue remained: entries for 18/11 still vanish from the **history** view after a full reload.

3. **Key conclusion from behaviour + DB queries:**
   - Today’s view is driven by `todaysFoods` (stored in a hidden `__TODAYS_FOODS_DATA__` health goal). That data **does** contain the user’s recent meals.  
   - The history view (`/food?date=YYYY-MM-DD` for non‑today) is driven purely by `FoodLog` rows matching that `localDate` window.  
   - For the current user, `FoodLog` has virtually **no rows** for recent dates, which is why selecting 18/11 after a refresh always yields an empty history, regardless of how many entries “looked” saved earlier.

---

### C. Current state after my session (for the next agent)

1. **Schema & timezone logic:**  
   - `prisma/schema.prisma` `FoodLog` model (including `items Json?`) is **unchanged** from the previous handover.  
   - `GET /api/food-log` retains the **fixed** timezone math (`+ tzMin * 60 * 1000`) as documented in this file. I did **not** modify that.

2. **Front‑end save pipeline:**  
   - `saveFoodEntries` now:
     - Updates `todaysFoods` in context.  
     - Posts `todaysFoods` to `/api/user-data` with a configurable `appendHistory` flag.  
     - **Also** posts the latest entry directly to `/api/food-log` when `appendHistory` is true.  
   - `addFoodEntry` also pushes a mapped copy of the new entry into `historyFoods` when the user is viewing a non‑today date so that it does not disappear immediately before reload.

3. **History UI:**  
   - `loadHistory` de‑duplicates entries client‑side but otherwise still relies entirely on `/api/food-log` → `FoodLog`.

4. **Reality check:**  
   - Despite the extra writes and UI tweaks, **new meals for past dates are still not reliably appearing in `FoodLog` for the user**, as confirmed by Prisma queries.  
   - As a result, the **core user‑visible bug remains**:  
     - Meals entered for 18/11 look fine until a full page reload, then vanish from the 18th and reappear only under “today” via `todaysFoods`.

5. **Recommended next steps (for a future agent):**
   - **Do not** simply add more save calls; instead, instrument and trace the existing ones:
     - Add robust logging (with user id + selected date + localDate) inside:
       - `POST /api/user-data` where it appends to `FoodLog`.  
       - `POST /api/food-log` itself.  
     - Confirm whether those endpoints are being called from the browser at all and whether they succeed or 401/500 on the live site.  
   - Consider a **simpler, single source of truth** approach:
     - One authoritative “save meal” endpoint that accepts `{ date, items, totals }` and writes both `todaysFoods` and `FoodLog` server‑side in a transaction.  
     - The client would call this once per save instead of juggling multiple endpoints.

Until then, please treat my changes as **exploratory** and not as a final fix; the bug is real, reproducible, and still affecting the user’s daily experience.

---

## Food Diary – Handover and Fix Plan

**Last updated:** November 17, 2025 (after GPT‑5.1 ingredient‑editing UX session)  
**Baseline code version:** commit `557b732` (rollback starting point – current live behaviour is built on top of this; see session log for later commits)

This document is the **single source of truth** for the Food Diary / Food Analyzer area.  
Every future agent must read this fully before changing anything under `/app/food` or the related APIs.

---

## Latest handover – Agent GPT‑5.1 (read this first, then the rest of this file)

Before touching any code, **read this section once**, then go back and read the entire `FOOD-DIARY.md` file from top to bottom.

- I have **implemented**, on the live system:
  - ✅ The corrected date‑window logic in `GET /api/food-log` (see section 4.1 for details).  
    - This is a core fix. **Do not change the timezone maths** (`+ tzMin * 60 * 1000`) without talking to the user first.
  - ✅ A new `items` JSON column on `FoodLog` and wiring so **all new meals** save their cards into history:
    - `prisma/schema.prisma` `FoodLog.items Json?` + SQL migration `20251115120000_add_foodlog_items`.  
    - `saveFoodEntries` now sends `items` when calling `/api/food-log`.  
    - `GET /api/food-log` maps `items: l.items || l.nutrients?.items || null`.  
    - `editFood(food)` prefers `food.items`, so new entries edited from history keep their cards instead of depending on brittle text parsing.
  - ✅ Energy (`kcal ↔ kJ`) and volume (`oz ↔ ml`) toggles on the Food page:
    - `energyUnit` (`'kcal' | 'kJ'`) now drives **all** energy displays: the coloured analysis tiles, per‑ingredient chips, ingredient totals, and **Today’s Totals**. When `kJ` is selected, every relevant label reads **Kilojoules** and the values use `kJ = kcal × 4.184`.
    - `volumeUnit` (`'oz' | 'ml'`) is now **only shown for obvious liquids** (juice, milk, water, coffee, soups, sauces, dressings, etc.), never for buns, patties, cheese, or other solids.
    - Oz units step in clean **1 oz** increments; ml units step in **10 ml** increments. The “1 serving = …” helper text switches between `1 cup (8 oz)` and `≈ 240 ml` so it always matches the current unit.
  - ✅ Units controls for discrete vs volume/weight foods:
    - Discrete foods (eggs, slices, crackers, patties, chips, etc.) change in whole pieces.  
    - Volume/weight units (g, ml, oz, cup, etc.) use sensible steps and no longer jump in strange fractions (no more 0.3 / 0.5 / 7.5 / 9.006 style values).
- I have **largely stabilised** but not fully audited:
  - Burger‑style text → cards parsing (two‑line “1. **Bun** / `- Calories: …`” format).  
    - The user’s burger image now reliably produces per‑ingredient cards with sensible looking macros and totals, but a future agent should still sanity‑check numbers against real labels if this area is revisited.
- I have **not fully solved**:
  - Perfect macro accuracy for all complex meals – cards and totals are **much more trustworthy** than before, but a formal audit has not been done.  
  - Missing history rows for 14–16 November 2025 – those meals were never written into `FoodLog`, so there is nothing in the DB to fix; they must be recreated via the UI if needed.

For a full, detailed description of exactly what I changed, what is working, and what is still broken, see **section 8: “Session log – Agent GPT‑5.1”** near the end of this file.

Please **do not undo** the `FoodLog.items` column or the new `/api/food-log` date window; build on top of them.

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

### 3.1 Date bug – entries show up on the wrong day  **(✅ fixed on production)**

**Status (2025‑11‑16):** This bug is **fixed** by the new date‑window logic in section 4.1.  
The details below describe the original behaviour for historical context – do not revert the `+ tzMin * 60 * 1000` logic.

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

// ORIGINAL (BUGGY) LOGIC – replaced by the FIXED WINDOW in section 4.1
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

### 3.2 Ingredient cards disappearing  **(✅ fixed for new entries; historical gaps remain)**

**Status (2025‑11‑16):**
- New food entries now always persist `items` into `FoodLog.items`, and `editFood` never overwrites existing cards with an empty list.  
- Older meals that were never written into `FoodLog` (especially around 14–16 November 2025) still **cannot** have their cards reconstructed automatically – they must be re‑analyzed if the user cares about them.

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

## 4. Phase 1 – Fix date logic (**✅ completed – do not change without approval**)

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

## 5. Phase 2 – Make ingredient cards robust (**✅ completed for new entries**)

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

## 6. Phase 3 – Units and toggles (from `fix.plan.md`) (**✅ implemented and tested – treat as stable**)

The original unit/toggle plan is still desired; it should be implemented **after** Phases 1–2.  
This section is lifted directly (with minor wording tweaks) from `fix.plan.md`, and is now **implemented in code and live on production**. Future agents should treat this behaviour as the new baseline and **avoid changing it without explicit user approval.**

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

- [x] Phase 1: Fix `/api/food-log` date window and verify behaviour in Melbourne and at least one other timezone.  
- [x] Phase 2: Persist `items` to `FoodLog`, prefer stored items in `editFood`, and guard against wiping cards; backfill key recent entries (crackers/San Remo) once stable for **new** entries.  
- [x] Phase 3: Implement units and toggles exactly as in section 6 and complete a regression sweep on desktop (including user’s real burger and orange‑juice photos).  
- [x] Ingredient editing UX: add compact top‑of‑screen controls when editing an entry (Save changes / Cancel + 3‑dot menu for Edit description / Re‑analyze / Delete photo), and introduce collapsible ingredient cards so that multi‑ingredient meals start with all items closed and only one card expanded at a time.  
- [x] Mobile layout polish for the Food page: reduce left/right padding, remove the outer “square within a square” background container, and keep Today’s Totals as a normal (non‑sticky) section so editing flows feel natural on iPhone.  
- [ ] Stabilise nutrition truth source for complex meals (especially the burger): choose a single source of truth for totals (ideally structured JSON from `/api/analyze-food`) and simplify/remove prose‑based scraping as described in section 8.3.  
- [ ] Auto‑save editing: remove the need for a manual “Save changes” button by safely auto‑saving card and description edits (Google Docs style) while protecting against accidental data loss.  
- [ ] Unified description + ingredients box: allow the main food description and ingredient list to be edited in one place, with dynamic nutrition updates when the description changes (for example, changing “beef sausage” to “pork sausage”).  
- [ ] Daily calorie & macro targets (**new**): compute per‑day energy and macro targets from Health Setup data (gender, weight, height, **birthdate/age**, goals, and health issues) and surface them as clear “circles” or tiles in the Food Diary. Keep the calculation logic on the backend (or a shared util), and ensure the same targets are reused across Food Diary, Dashboard, and Insights.  
- [ ] Visual “rings / circles” for Food Diary (**design discussion in 9.1**): implement Cronometer‑style circles showing Calories, Protein, Carbs, Fat/Sugar (consumed vs target vs remaining). The user is open to:  
  - Option A – circles at the very top of the **Food Diary** page (above “Today’s Totals”),  
  - Option B – circles on the **Dashboard** only, or  
  - Option C – **both** places.  
  You must confirm their preference before building; default suggestion from this agent was to start with circles on the Food Diary page, then mirror to Dashboard if the user likes them.  
- [ ] Meal duplication across days (**design discussion in 9.2**): add a safe way to copy meals instead of re‑taking photos every day. The user specifically wants:  
  - At least a **“Copy yesterday to today”** action for the whole day.  
  - Ideally the ability to copy a **single meal** from one date to another.  
  - Longer‑term, a **“make this a regular breakfast”** option so the same meal can be reused daily without manual copying.  
  All copy operations must preserve ingredient cards (`items`) and totals exactly, and must not create hidden duplicates in the database.  
- [ ] Optional future work: audit macro accuracy for very complex meals and run deeper cross‑browser / iPhone testing before making any further UX changes.

---

## 8. Session log – Agent GPT‑5.1 (this session, November 16, 2025)

### 8.1 What I changed in the code

**Back‑end / database**
- **`app/api/food-log/route.ts`**  
  - Updated the date window logic to **add** the timezone offset instead of subtracting it (as described in section 4.1), so that a given local day (e.g. 15/11 in Melbourne) maps to the correct UTC window.  
  - Extended the `POST` handler to accept and store an `items` field (structured ingredient list) alongside `description`, `imageUrl`, and `nutrients`.
- **`prisma/schema.prisma` + migration**  
  - Added `items Json?` to `model FoodLog`.  
  - Ran a small SQL migration (`prisma/migrations/20251115120000_add_foodlog_items/migration.sql`) directly against the live Postgres database to add the `items` column.  
  - Verified via Prisma that existing rows are still present (`id`, `userId`, `name`, `createdAt`), but **none of the historical rows have `items` populated** (all `items = null`).

**Front‑end – history / persistence**
- **`app/food/page.tsx` – saving to history**
  - In `saveFoodEntries`, when calling `/api/food-log`, I now send:
    - `description`, `nutrition`, `imageUrl` **and** `items: last.items || null`.  
  - This means **new** analyzed meals will have their ingredient cards saved into `FoodLog.items` as soon as they are created.
- **`app/food/page.tsx` – loading history**
  - When mapping responses from `GET /api/food-log` into `todaysFoods` / `historyFoods`, I now include:
    - `items: (l as any).items || (l.nutrients as any)?.items || null`  
  - So if the DB row has `items`, edit mode will use those; if not, it falls back to any `items` nested inside `nutrients`.
- **`editFood(food)`** was already written to prefer `food.items` when present; I did not change that logic, but the new wiring above finally gives it real `items` data for new entries.

**Front‑end – units, toggles and parsing**
- **Units / toggles (Phase 3 work started but not fully validated)**  
  - Added `energyUnit` (`'kcal' | 'kJ'`) and `volumeUnit` (`'oz' | 'ml'`) state to the Food page.  
  - Inserted a **kcal ↔ kJ toggle** above the summary cards and wired it so that when `energyUnit === 'kJ'`, the summary and per‑ingredient displays use `kJ = kcal * 4.184`.  
  - Added an **oz ↔ ml toggle** inside the ingredient “Units” controls for oz‑based foods (e.g. burger patties), using `1 oz ≈ 29.57 ml` and whole‑number steps (1 oz or 10 ml) while keeping `servings` tied back to the base quantity.  
  - Extended `isDiscreteUnitLabel` to treat crackers/chips as discrete items so the **Units** control uses whole numbers for them.
- **Text → card parsing (this is where things are still fragile)**  
  - `extractStructuredItemsFromAnalysis(...)` was left as the primary JSON/`<ITEMS_JSON>` parser.  
  - `extractItemsFromTextEstimates(...)` was expanded to handle the user’s burger format:
    - Lines like `1. **Bun**: 1 bun (3 oz)` followed by  
      `- Calories: 150, Protein: 5g, Carbs: 28g, Fat: 3g`  
    - It builds a `servingMap` from the numbered lines and a set of macros from either inline or two‑line bullet formats.  
    - If it finds macros, it creates items with `name`, `serving_size`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`.  
    - If it **only** finds serving descriptions (no macros), it still builds items with `serving_size` and `name` but leaves macros `null` so cards exist but numbers are blank rather than wrong.
  - `applyStructuredItems(itemsFromApi, totalFromApi, analysisText)` now:
    - Starts with `itemsFromApi` (what the API returns).  
    - If empty, tries `extractStructuredItemsFromAnalysis(analysisText)`.  
    - If still empty, tries `extractItemsFromTextEstimates(analysisText)` (the prose parser described above).  
    - When it ends up with any items, it **builds cards** (`setAnalyzedItems(enriched)`), but as of my final change it **no longer forces a recalculated nutrition summary immediately**. The intention was:
      - First trust the AI’s own total from `extractNutritionData(result.analysis)` for the header cards.  
      - Only move to recalculated totals when the user edits the cards (via `updateItemField`, which still calls `applyRecalculatedNutrition`).

### 8.2 What is currently working

- **Date logic implementation (code‑side)**  
  - `GET /api/food-log` now uses the corrected timezone math shown in section 4.1 (`+ tzMin * 60 * 1000`).  
  - For new test entries created after this session (once `FoodLog` actually contains rows on that day), the API should return rows in the expected local‑day window.  
  - I verified via SQL that the existing `FoodLog` rows around 12/11/2025 have sensible Melbourne local times; when you run the date‑window math by hand they land in the intended day.
- **`FoodLog.items` column and wiring**  
  - The `items` column exists on the live DB and Prisma can read/write it.  
  - New saves from `saveFoodEntries` will record `items` into `FoodLog`.  
  - History mapping and `editFood` will prefer these stored `items` going forward, which should prevent **new** card data from disappearing just because the description parser fails later.
- **Burger entry now shows ingredient cards in Edit mode**  
  - For the user’s burger photo, clicking **Edit** now shows:
    - Cards for Bun, Patty, Cheese, Bacon, Lettuce, Tomato, Sauce.  
    - Units controls, serving size text, and the standard card layout.  
  - However, the numbers in those cards and in the coloured summary boxes are still **not reliable** (see next section).

### 8.3 What is *still* broken or untrustworthy

**1. History for old dates (14–16 November 2025)**  
- When I inspected the live DB, there were **only 5 `FoodLog` rows total**, all much older (Sept and 12 Nov).  
- There are **no rows at all** for 14–16 November, which means the meals the user created on those dates were **never written into `FoodLog`** (they lived only in `todaysFoods`).  
- Because of that, the new date logic cannot “bring them back”: there is simply nothing in `FoodLog` for those dates to show.  
- I did **not** attempt any data repair, because there are no DB rows to adjust; the only realistic way to re‑use those specific meals is to re‑create them via the UI.

**2. Nutrition numbers for the burger (most recent tests)**  
- The latest burger analyses now **show cards**, but the numbers are inconsistent:
  - At various points the header totals have been wildly off (850 kcal, then 42 kcal).  
  - The individual cards have also shown zeros or obviously wrong macros.  
- Root cause (still unresolved):  
  - We now have **three competing sources of truth** for totals:
    1. The AI’s prose text (parsed by `extractNutritionData`).  
    2. Any `total` object returned from the API (`result.total`).  
    3. Recalculated totals from the items we build (`recalculateNutritionFromItems`).  
  - The current code tries to be “helpful” by mixing these:
    - It parses the prose text for a headline summary.  
    - It then builds items from prose, which may have incomplete macros or parsing errors.  
    - Earlier in this session, `applyStructuredItems` was calling `applyRecalculatedNutrition` immediately, which could overwrite a decent AI total with bad zeros from partially parsed items.  
    - My last change removed that immediate overwrite, but because I couldn’t see the live private numbers, I **could not confirm** that the burger totals are now correct on production.
- **Bottom line for the next agent:**  
  - Do **not** trust the current burger numbers as “correct”; treat this as an open bug.  
  - The parsing layer is now quite complex and brittle. It may be simpler and safer to:
    - Tighten the `/api/analyze-food` response so it **always** returns a clean `items[]` + `total` JSON structure.  
    - In the UI, **only** trust that JSON for cards and totals, and stop scraping the prose entirely.  
  - Whatever approach you take, please test with the user’s real burger image and keep them in the loop in plain language.

**3. Units / energy toggles not fully validated end‑to‑end**  
- `energyUnit` and `volumeUnit` are wired in, but under time pressure I focused mainly on getting the burger cards to appear.  
- I have **not** done a full regression sweep for:
  - Eggs, crackers, orange juice, and other starters from `data/foods-starter.ts`.  
  - Mobile behaviour (iPhone), where the user has historically seen subtle regressions.  
- It’s possible there are edge‑case bugs in the new toggles (especially interactions between unit changes and servings). Treat that code as “experimental” until you test it thoroughly.

### 8.4 Guidance for the next agent

- **Please honour the user’s constraints:**
  - They are **not** a developer and do not want to read technical monologues. Keep explanations short and plain.  
  - Their biggest fear is “cards disappearing” or numbers silently changing; any change that touches cards or totals must be tested with **real entries** (e.g. burgers, eggs, crackers) on the live site.  
  - They want one issue solved **completely** before you move on to the next.
- **Recommended plan from here:**
  1. **Stabilise nutrition truth source**  
     - Decide a single source of truth for totals (`result.total` from the API is ideal).  
     - Update the UI so the coloured header cards and the ingredient cards both derive numbers from that source only.  
     - Remove or drastically simplify `extractNutritionData` and the prose‑based macro scraping once you rely on JSON.  
  2. **Simplify the parsing path**  
     - If you can, make `/api/analyze-food` always return a structured payload:
       - `items[]` with per‑item macros and serving sizes.  
       - `total` with summed macros.  
     - In the front‑end, treat prose (`aiDescription`) as display‑only; never use it to compute numbers unless JSON is truly missing.  
  3. **Retest the specific burger the user used in this session**  
     - Confirm that:
       - Cards appear for bun, patty, cheese, bacon, lettuce, tomato, sauce.  
       - Macros per card are reasonable (no zeros unless genuinely unknown).  
       - The header totals match the sum of the cards within rounding error.  
  4. **Only after the above is solid**, revisit the units/toggles behaviour and the older “crackers / San Remo” entries if the user still cares about those historical records.

Please **do not roll back** the `FoodLog.items` column or the `/api/food-log` date‑window fix; those are foundational for making the diary reliable long‑term, even though the burger numbers are still not right today.

### 8.5 Follow‑up changes – Agent GPT‑5.1 via Cursor (later on November 16, 2025)

This follow‑up session built **on top of** the work described above and is now live on production.

**Units, liquids and serving display**
- Finalised `Units` behaviour on the Food page so that:
  - Discrete foods (eggs, slices, crackers, patties, chips, etc.) use whole‑number unit steps.  
  - Volume/weight items use stable steps (1 oz or 10 ml / 10 g) with no more “stuck” values or strange jumps (for example 7.5 → 9.006 oz).
- Limited the `oz`/`ml` toggle to obvious liquids only (juice, milk, water, coffee, soups, sauces, dressings, oils, drinks, etc.). Solids (bun, patty, cheese, crackers) **never** show the `ml` option any more.  
- Improved the `oz`/`ml` pill UI so the active unit is clearly highlighted and easy to see.
- For liquid servings that include ounces in the label (for example `1 cup (8 oz)` for orange juice):
  - The code now treats the **ounce quantity** as the single source of truth.  
  - In `oz` mode, units step 1 oz at a time.  
  - In `ml` mode, units represent millilitres, using 10 ml steps, and the helper text switches to an approximate ml value (for example `≈ 240 ml`) instead of an incorrect value like `30 ml`.

**Energy units (kcal ↔ kJ)**
- Made `energyUnit` the single switch for **all** energy displays:
  - The main analysis tiles.  
  - Per‑ingredient chips and ingredient totals.  
  - The **Today’s Totals** bar at the top of the Food Diary.
- When `energyUnit` is set to `kJ`, every relevant label now reads **Kilojoules** and all energy numbers are converted using `kJ = kcal * 4.184`. When `energyUnit` is `kcal`, labels and numbers are in calories.

**Guidance for future agents**
- The user is finally happy with how cards, units, kJ/oz/ml toggles, and Today’s Totals behave.  
- Treat the current Food Diary behaviour as **stable and user‑approved**.  
- Do **not** change:
  - The `/api/food-log` date window logic.  
  - The `FoodLog.items` column or how new entries persist `items`.  
  - The basic semantics of `energyUnit` / `volumeUnit`, the oz/ml toggle visibility rules, or the way units and servings move together.  
- If you ever need to touch this area again, read this entire file carefully, then coordinate with the user and test on **live production** with real entries (burger, eggs, crackers, orange juice) before claiming success.
### 8.6 Follow‑up changes – Agent GPT‑5.1 via Cursor (November 17, 2025 – ingredient editing UX)

This session focused on **making the Food Diary easier to edit** without changing the underlying units/toggles logic.

**Ingredient cards – expand/collapse behaviour**
- Multi‑ingredient meals now show a **compact list of ingredients** when you tap Edit:
  - Each row only shows the ingredient name on the left and a small triangle on the right.  
  - Tapping the triangle expands that card to reveal the full controls (servings, Units, per‑serving chips, and “Totals for …” box), plus the edit and delete icons.  
  - Only **one card is expanded at a time**; expanding one ingredient automatically collapses the others, so you can always see the nutrition tiles while adjusting a specific ingredient.  
- Single‑ingredient meals keep their card **fully open** by default so you can see everything at a glance.

**Edit controls at the top of the analysis panel**
- When editing an existing entry, the Food Analysis panel now shows a **compact control bar at the top**:
  - Visible buttons: **Save changes** and **Cancel**.  
  - A 3‑dot menu on the right with: **Edit description**, **Re‑analyze**, and **Delete photo**.  
- The goal is to avoid long scrolling: all important editing actions are reachable immediately at the top while the existing bottom‑of‑panel controls remain familiar.

**Sticky headers and scrolling**
- Based on user feedback, **Today’s Totals is no longer sticky** – it scrolls like a normal section because that page is read‑only.  
- The per‑meal nutrition strip inside Edit mode is also non‑sticky now; instead, the new expand/collapse system keeps the view simple while still letting the user watch the nutrition tiles update as they adjust one ingredient at a time.

**Mobile layout tweaks for the Food page**
- Reduced horizontal padding and removed an extra background panel to get rid of the “square within a square” look on phones, allowing ingredient cards and photos to use more of the screen width.  
- These are visual/spacing improvements only; they do **not** change the behaviour of units, toggles, or nutrition calculations.

---

### 8.7 Follow‑up changes – Agent GPT‑5.1 via Cursor (November 19–20, 2025 – Food Diary + Health Setup polish)

These changes are **user‑approved and live on production**. Future agents should treat them as stable and **must not modify them** without explicit confirmation from the user and a careful reread of this file.

**Food Diary – Analysis layout & editing behaviour**
- ✅ **Food Description is read‑only and consistently placed**
  - “Food Analysis” now shows a **Food Description** section directly under the title bar.  
  - The primary meal title (brand + food name + serving size) appears as a green pill under the “Food Description” heading, followed by a plain‑text description.  
  - The old editable description textarea and helper text (“Change the food description and click on the ‘Re‑Analyze’ button”) plus the dedicated “Edit Description / Re‑Analyze” flow have been removed.  
  - **Do not** re‑introduce editable free‑text description in this panel without a new plan agreed with the user.
- ✅ **Desktop vs mobile layout for analysis**
  - **Desktop:** Food Description spans the top; below it, a two‑column row shows **image on the left** and **macro ring + chips on the right**, and the full ingredient cards sit **directly underneath** that row.  
  - **Mobile:** the order is **photo → Food Description → macro breakdown (circle + list) → ingredient cards**, so when the user adjusts servings on a card the macro numbers stay visible just above.  
  - This structure is deliberate; do not move macros below the cards on mobile or separate the image/macros row from the cards on desktop.

**Food Diary – cancel/delete behaviour**
- ✅ **Canceling an edit returns to the main Food Diary view**
  - Pressing **Cancel** when editing an existing entry (including photo‑based meals and manual entries) now:
    - Restores the original entry values (via `revertEditingChanges`).  
    - Clears editing state (`editingEntry`, `originalEditingEntry`, `isEditingDescription`, analyzer state).  
    - Closes the add/edit panel (`showAddFood` set to `false`) so the user is taken back to the normal Food Diary list (energy summary + meals).  
  - The Manual Food Entry card’s small “✕ / Cancel” button also just closes the card and returns to the diary, without popping open any extra forms.
- ✅ **Deleting a photo after analysis behaves like cancel**
  - When a meal has been analyzed from a photo, using **Delete Photo** now calls the same reset helper used by Cancel: all analyzer state is cleared and the user is returned to the main Food Diary view.  
  - **Do not** change Delete Photo to keep the manual entry panel open or to leave the user “stuck” inside the analysis card.

**Food Diary – ingredient macros & totals**
- ✅ **Per‑ingredient macro chips track Servings**
  - Inside each ingredient card, the coloured chips (e.g. `200 kcal`, `5g Protein`, `23g Carbs`, `8g Fat`, `4g Fibre`, `5g Sugar`) now reflect the **totals for the current Servings value**, not just “per 1 serving”.  
  - When the user changes Servings (via `‑` / `+` or direct number input), these chips recompute in real time from `totalsByField` so the chips, the “Totals for …” label, and serving controls always agree.  
  - **Do not** switch these chips back to per‑serving values; they are intended to show total macros for the chosen amount.
- ✅ **Removed redundant text‑only totals row**
  - The old grey “Totals for 1 serving – 200 kcal calories, 5g protein, 23g carbs, …” text block under each card has been removed to avoid duplication.  
  - The new chip row labelled “Totals for X serving(s)” replaces that function and must remain the single source of truth for per‑ingredient totals.

**Food Diary – Add Ingredient modal & data sources**
- ✅ **Starter foods list removed – USDA is now the primary source**
  - The “Add ingredient” modal no longer shows the local `STARTER_FOODS` list or a generic “Search starter foods (e.g., egg, bacon, rice)” section.  
  - All new ingredients are sourced from **USDA FoodData Central** via `/api/food-data`, using the existing `lib/food-data.ts` helper functions.  
  - The modal is now split into:
    - A **USDA search bar** at the top with two toggles: **Packaged** and **Single food**.  
    - Below that, a list of normalized USDA results showing name, optional brand, serving size, macros, and a Source label (“USDA FoodData Central”).  
  - Clicking **Add** on a result creates a new ingredient card with `serving_size`, per‑serving macros and `servings = 1`.  
  - **Do not** reintroduce the old generic starter list or change USDA to a secondary source without discussing it with the user.
- ✅ **Backend wiring for USDA search**
  - `lib/food-data.ts` `searchUsdaFoods` now accepts an extra `dataType` option (`'branded' | 'generic' | 'all'`) and uses it to build the `dataType` parameter for USDA (`Branded`, `Survey (FNDDS)`, `SR Legacy`).  
  - `GET /api/food-data` accepts a `kind` query parameter:
    - `kind=packaged` → calls `searchUsdaFoods(query, { pageSize: 5, dataType: 'branded' })`.  
    - `kind=single`   → calls `searchUsdaFoods(query, { pageSize: 5, dataType: 'generic' })`.  
    - `source=auto` still prefers USDA but is not used by the Add Ingredient UI.  
  - **Do not** bypass this normalization by calling USDA directly from the client; always use `/api/food-data`.
- ✅ **AI photo fallback when USDA can’t find a match**
  - If USDA search returns no useful items, the modal shows an **“Or use AI photo analysis”** section with a **“📷 Add Image”** button.  
  - Choosing this lets the user select or capture a photo; the modal closes, the main Food Analysis flow opens with that photo, and the existing OpenAI food‑analysis pipeline is used to build cards and totals.  
  - **Do not** remove or repurpose this fallback; it is the sanctioned way to handle foods that USDA can’t identify.

**Health Setup – Physical step (weight & height units)**
- ✅ **Weight toggle labels and behaviour (kg ↔ lbs)**
  - The unit toggle above “Enter your current weight” now shows **kg** and **lbs** only (no more `kg/cm` or `lbs/in`).  
  - Tapping the toggle **converts the stored value**, not just the label:
    - Metric → Imperial: `weight_kg × 2.20462`, rounded to the nearest whole pound.  
    - Imperial → Metric: `weight_lbs ÷ 2.20462`, rounded to the nearest whole kilogram.  
  - The input placeholder updates dynamically to `Weight (kg)` or `Weight (lbs)` to match.  
  - **Do not** change this behaviour back to a non‑converting label switch.
- ✅ **Height toggle (cm ↔ ft/in) with live conversion**
  - The “How tall are you?” section now has its own unit toggle to the right: **cm** vs **ft/in**, sharing the same `unit` state as weight.  
  - When switching:
    - Metric → Imperial: existing centimetres are converted to feet and inches (`totalInches = cm / 2.54`; `feet = floor(totalInches / 12)`; `inches = round(totalInches − feet×12)`), and the **Feet/Inches** boxes are populated.  
    - Imperial → Metric: existing feet/inches are converted back to centimetres (`totalInches = feet×12 + inches`; `cm = totalInches × 2.54`), and the single **Height (cm)** box is filled with the rounded value.  
  - The `height` field stored in the payload remains:
    - Metric: raw centimetre string.  
    - Imperial: a human‑readable string in the existing format (`5'10"`), plus separate `feet` and `inches` fields for reference.  
  - **Do not** break this round‑trip behaviour; users rely on being able to flip units without losing or corrupting their numbers.

**General guidance for future agents**
- ✅ **No‑touch zones established in this session**
  - Food Diary:  
    - Cancel / Delete Photo flows that always take the user back to the main diary view.  
    - Food Analysis layout (Food Description placement, desktop vs mobile ordering, macro‑above‑cards structure).  
    - Ingredient macro chips as the single authoritative per‑ingredient totals display.  
    - USDA‑only Add Ingredient search with Packaged / Single toggles and AI photo fallback.  
  - Health Setup → Physical step:  
    - Weight/height unit toggles and their conversion logic.  
  - Before changing any of these, **explain the exact change to the user in simple terms, get written approval, and update this document**.

---

## 9. Future roadmap – calorie “circles” and daily meal copying

The user has started planning the **next major upgrade** to the Food Diary, inspired by Cronometer. These ideas are **not implemented yet** and should be treated as a design brief for a future agent.

### 9.1 Daily targets & circles (hardest task – should go first)

- The user wants Helfi to give them **personalised daily calorie and macro targets**, then show progress visually (similar to Cronometer’s rings).  
- Targets should be based on:
  - Gender and **birthdate** (age),  
  - Weight and height,  
  - Activity / exercise frequency,  
  - Health goals and health issues (e.g. weight loss vs muscle gain, diabetes, etc.).  
- These targets should feed:
  - A set of **circles / rings** showing Consumed vs Target vs Remaining for calories and key macros, and  
  - The logic used by Insights / other parts of the app so numbers stay consistent everywhere.  
- Open decisions you **must confirm with the user**:
  - **Where the circles live:**
    - Option A – at the top of the **Food Diary** page (above “Today’s Totals”).  
    - Option B – on the **Dashboard** only.  
    - Option C – **both** Dashboard and Food Diary.  
  - **Exact visual style:** the user likes Cronometer‑style rings but wants a clean, modern Helfi‑branded version.
- Important prerequisite: at the moment, **date of birth is captured in the Health Setup UI but is not persisted in the database**.  
  - A future agent must first decide where to store it (likely in the existing profile info JSON or a new `User` field) and wire it through `/api/user-data` so age is reliable before using it for calorie targets.

#### 9.1.1 Detailed ring behaviour and placement

- **Primary home = Food Diary page (mobile‑first):**
  - Replace the six large “Today’s Totals” tiles with a **compact ring header** at the top of the Food Diary page.  
  - On mobile, this header should look and feel similar to Cronometer’s energy summary strip: circles with clear labels and values that leave most of the screen for the actual diary entries (Breakfast, Lunch, Dinner, Snacks).  

- **When there is no wearable (Fitbit / Apple Watch) connected:**
  - Show at least **one ring for “Consumed” calories** for the day (kcal / kJ toggle still respected).  
  - Show a second **“AI daily target” ring** that represents the recommended calorie/macronutrient allowance for the day:
    - This target must be computed from Health Setup data (gender, age from birthdate, weight, height, exercise level, goals, health issues).  
    - AI should pick *sensible* total calories and macro splits for that person, and these targets should be reused across Food Diary, Dashboard and Insights so numbers stay consistent.  

- **When a wearable is connected and providing energy data:**
  - Upgrade the header to **three rings**, similar to Cronometer:  
    - **Consumed** – food energy eaten today.  
    - **Burned** – energy expenditure from the wearable (and any other exercise data).  
    - **Deficit** – AI‑calculated difference between Burned and Consumed, compared against the user’s daily target.  
  - Behavioural rule: if wearable data is temporarily unavailable, gracefully fall back to the “no wearable” two‑ring mode instead of showing broken values.

- **Dashboard integration:**
  - The same ring summary should appear on the **Dashboard** only when there is **actual food data in the diary for that day**.  
  - If there is no food data yet today, the Dashboard can show a gentle prompt to add food rather than empty rings.  

- **Design rules:**
  - Visual style should be “Cronometer‑inspired but clearly Helfi”: clean rings, friendly colours, and labels that are easy to read at a glance.  
  - Rings should be tap‑able to show more details (macros, remaining vs target, etc.) but tapping is optional; the default view must already be useful without interaction.

#### 9.1.2 Food Diary mobile navigation (Cronometer‑style)

- When the user taps **Food** in the global bottom nav, the app should switch into a **Food‑focused navigation mode** on mobile.  
- Proposed Food nav layout (bottom bar) once the Food page is active:
  - `Diary` – today’s Food Diary (date selector + rings + meal sections).  
  - `Favourites` – quick access to frequently used meals/foods.  
  - `+` (large central button) – opens a “quick add” sheet.  
  - `Targets` – shows the user’s daily calorie and macro targets, with explanations.  
  - `More` – any additional food‑related options we add later.

- **Quick add sheet (opened from the big + button):**
  - `Suggest Food` – AI‑generated suggestions based on the user’s health data and targets.  
  - `Add Food` – opens the existing “Add Food Entry” flow (photo + manual entry options).  
  - `Scan Food` – barcode scanning for packaged foods.  
  - **Intentionally omitted for now** (can be added later if the user requests):  
    - `Add Biometric`  
    - `Add Note`  
    - `Add Exercise`  

- Implementation rule: do **not** change any of this nav yet without updating this file and confirming with the user. All Food Diary navigation changes must be planned here first so future agents never lose track of the intended design.

### 9.2 Copying meals across days (after targets are in place)

- The user frequently eats the **same meals on multiple days** and wants an easier way than re‑taking photos or re‑entering everything.  
- Desired features (in roughly this order):
  1. A **“Copy yesterday to today”** button that duplicates all meals from the previous day into today’s Food Diary.  
  2. The ability to copy a **single meal** from one date to another (for example, copying “Breakfast 2 Jan” to “Breakfast 5 Jan”).  
  3. Longer‑term: a **“make this a regular breakfast”** / template feature so favourite meals can be added in one tap without referring to a specific date.
- Constraints:
  - Copying must carry over the full ingredient `items` array, servings, units, and totals exactly (no partial copies, no recalculation drift).  
  - The history table (`FoodLog`) should not end up with confusing duplicates; consider explicit flags or linking copied entries back to their originals if needed.  
  - All copying behaviour must respect the fixed `localDate` logic so meals stay pinned to the day the user expects.

The user prefers tackling the **hardest problems first**, so a future agent should start with **daily targets + circles**, then add **copy‑meals** functionality once targets are solid and trusted. Remember to discuss these options with the user in simple, non‑technical language before implementing anything.