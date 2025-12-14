# DELETE_ISSUE.md — Handover (Food Diary: Copy/Paste, Deletes, Ingredient Picker, Meal Builder)

**Audience:** next agent  
**Goal:** give a clear handover of what was shipped in this session, what is confirmed working vs still broken, and what to fix next **without breaking guard rails**.

---

## Read First (non‑negotiable)

Before touching anything in the Food Diary, read:
- `GUARD_RAILS.md` (especially Food Diary section)
- `FOOD-DIARY.md`

The Food Diary has protected behaviors (snapshot sync, DB verification, fallback loads, delete safety). Do not remove or “simplify” them.

---

## Status Icons

Use these exact markers in this doc:

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> = working (user can do it successfully right now)
- <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✕</span> = still broken / needs work

---

## 1) What was implemented in THIS session (numbered list)

1) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **Manual ingredient search now queries multiple sources**  
   - Endpoint: `GET /api/food-data?source=auto&q=...&kind=...`  
   - Now aggregates **USDA + FatSecret + OpenFoodFacts** and dedupes by `(name + brand)`.  
   - User screenshot confirms it returns results from multiple sources (e.g., OpenFoodFacts + USDA).

2) <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✕</span> **Search result ranking is poor (exact match not first)**  
   - Example complaint: searching “lamb chop” requires scrolling; “Lamb, chop” should be top.
   - Needs better ranking for exact/prefix match on `name`.

3) <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✕</span> **Ingredient search performance is unacceptable (30–60s)**  
   - User report: tapping “Packaged” or “Single food” can take 30–60 seconds to show results.  
   - User report: tapping “Reset” can cause results to appear (likely a UI state/race issue + slow external calls).

4) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **Ingredient picker now has a Reset button**  
   - Reset clears query/results/errors and resets toggles.
   - Also resets state on open/close to reduce “stuck loading” cases.

5) <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✕</span> **“Build a meal” (multi‑ingredient meal builder) shipped, but user reports it does not work**  
   - Intended behavior: multiple ingredients added as cards → saved as 1 diary entry → editable later as one entry with its ingredient cards.  
   - User report: “Build a meal is no different to add ingredient” and “when I add something nothing is actually added.”

6) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **Increased manual ingredient search result count**  
   - `/api/food-data` supports `limit` up to 50; client requests 20.

7) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **FatSecret serving selection improved (attempt)**  
   - `lib/food-data.ts` now prefers realistic package servings over “100 g” when possible.  
   - Not yet confirmed by user on Biscoff specifically, but change is shipped.

8) <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✕</span> **Food Diary still feels “glitchy” (flashing/disappearing entries)**  
   - User continues to report items flashing, disappearing, and coming back (especially around add/delete/copy flows).  
   - This is NOT reliably reproduced in this session; needs a fresh, systematic reproduction + logs.

9) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **Food Diary save logic changed to reduce cross‑day wipe risk**  
   - `saveFoodEntries()` now merges the updated day’s entries into the existing `userData.todaysFoods` cache instead of overwriting it with only the current list.  
   - Also tries to pick the newest “added entry” for history writes to avoid saving the wrong entry.  
   - This was shipped to address “items from yesterday disappear after copying”.

10) <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">✓</span> **New diary entries now use collision‑resistant local IDs**  
   - `addFoodEntry()` now uses `makeUniqueLocalEntryId(...)` instead of `id = createdAtMs`.

---

## 2) Files changed in this session

- `app/food/page.tsx`
  - `saveFoodEntries(...)` merge behavior (avoid cross‑day cache wipe)
  - add “Reset” behavior for ingredient picker
  - add “Build a meal” mode
  - `addFoodEntry(...)` uses `makeUniqueLocalEntryId(...)`
- `app/api/food-data/route.ts`
  - Auto mode now aggregates sources in parallel and supports `limit`
- `lib/food-data.ts`
  - Better FatSecret serving selection (avoid defaulting to 100g when better serving exists)

---

## 3) Deployments created in this session (for testing)

Latest deployment (contains everything from this session):  
- `https://helfi-o17gjd02a-louie-veleskis-projects.vercel.app`

Earlier deployments (subset of changes):
- Cross‑day cache wipe prevention: `https://helfi-2nyc2q58e-louie-veleskis-projects.vercel.app`
- Multi‑source search + serving attempts: `https://helfi-gq35e9jni-louie-veleskis-projects.vercel.app`

---

## 4) Immediate issues to fix next (based on latest user message)

1) **Search ranking (exact match should be first)**  
   - Add scoring on API response (or client) to push:
     - exact match of `name` to top
     - prefix match next
     - substring match next
   - Example: query “lamb chop” should prioritize “Lamb, chop”.

2) **Search latency (30–60 seconds)**  
   Likely causes:
   - External APIs are slow (FatSecret token + search, USDA search, OpenFoodFacts search)
   - No request cancellation; “Reset” doesn’t cancel in-flight requests → race conditions
   Fix direction:
   - Add AbortController in `handleOfficialSearch` and cancel previous in-flight calls
   - Add per-source timeout server-side (return partial results quickly)
   - Cache FatSecret access token server-side (short TTL) to avoid fetching it every search

3) **Build a meal not adding ingredients**  
   - Verify `addIngredientFromOfficial` runs in “analysis” mode during build mode.  
   - Ensure it appends to `analyzedItems` and that the ingredient cards UI is visible in builder state.
   - Add minimal logging (or temporary toast) confirming “ingredient added” and current ingredient count.

4) **Food Diary flashing/disappearing**  
   - Needs a reliable reproduction with exact steps and date/meal context.
   - Do not claim fixed without user confirmation.

---

## 5) Notes to the next agent (avoid breaking things)

- Do NOT remove any “DB verification + merge” guard rail logic in `app/food/page.tsx`.
- Do NOT remove:
  - fallback load from `/api/food-log`
  - cross-device polling refresh behavior
  - delete tombstone logic
- Prefer additive fixes (timeouts, cancelation, ranking) rather than rewriting Food Diary loading.

