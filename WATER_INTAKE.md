# Water Intake (Food Diary) – Reference

This document is the **behavioral contract** and entry‑point map for the Water Intake feature.
It is intentionally **not a code dump** to avoid stale copies. Use the file references below as
source of truth.

## 1) Core pages and APIs

**UI**
- `app/food/water/page.tsx` – Water Intake page, quick add, custom entry, goal editor UI.
- `app/food/page.tsx` – Exercise panel (manual + wearable entries) that drives activity bonus.

**APIs**
- `app/api/water-log/route.ts` – List + create water entries for a date.
- `app/api/water-log/[id]/route.ts` – Delete a water entry.
- `app/api/hydration-goal/route.ts` – Hydration goal (base + activity bonus) + custom goal.
- `app/api/exercise-entries/route.ts` – Exercise entries list/create (manual).
- `app/api/exercise-entries/[id]/route.ts` – Edit/delete exercise entries.

**Goal calculation**
- `lib/hydration-goal.ts` – Base hydration target from profile (no exercise frequency).

## 2) Hydration goal rules (current contract)

- Base goal uses **profile only** (weight/height/gender/age/diet/primary goal).  
- **Health Setup exercise frequency is NOT used** in hydration targets.  
- Daily exercise affects hydration **only via logged calories**.
- Activity bonus = **1 ml per kcal**, capped at **1500 ml** per day.  
- Final goal is rounded to nearest **50 ml**.
- Custom goal (user saved) overrides recommended goal.

API shape: `GET /api/hydration-goal?date=YYYY-MM-DD`
- Returns: `targetMl`, `recommendedMl`, `source`, `exerciseBonusMl`.

## 3) Exercise → hydration linkage

- Logged exercise entries (manual or wearable) are the **only** source of activity bonus.  
- If there are **no exercise entries** for the selected date, the activity bonus is **0 ml**.  
- Wearable and manual logs share the same `ExerciseEntry` table, so **no double‑count**.

## 4) Water logging behaviors

- Users can log unlimited entries per day.
- Custom Entry input:
  - Clears on focus.
  - Uses numeric keypad (`type=number`, `inputMode=decimal`).
  - Unit label uses `ml` (lowercase), `L`, `oz`.

## 5) Exercise diary behaviors (Food page)

- Manual exercise entries are saved via `POST /api/exercise-entries`.
- After **save** or **delete**, the list must **force reload** from the server to avoid
  stale session storage (see `loadExerciseEntriesForDate(..., { force: true })`).

## 6) Quick sanity checks

- Log a water entry → appears immediately and updates total.
- Set custom goal → `source=custom`, goal remains until reset.
- Log exercise calories → Water goal increases by activity bonus for that date.
- Delete exercise → entry removed and bonus recalculates.

---

If you need an exact snapshot, reference the files above and the git history for
`app/food/water/page.tsx`, `app/api/hydration-goal/route.ts`, and `lib/hydration-goal.ts`.
