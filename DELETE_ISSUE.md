# DELETE_ISSUE.md — Food Diary “Ghost Entries” + Delete Resurrection

**Audience:** next agent.  
**Goal:** give full context so you do not repeat prior attempts.  
**Status:** still broken after multiple deploys on 12 Dec 2025.  

---

## 1. User‑visible symptom

- On a new day, “ghost” meals appear in Today’s Meals that the user did not enter that day (examples shown repeatedly: burger under Dinner, peanuts under Snacks).
- User deletes these ghosts from Today’s Meals.
- Immediately after delete they disappear in UI, but after refresh they **come back**.
- This has happened many times historically; user reports multiple agents previously “fixed it,” then it returned at the next day rollover.

Screenshots from this session show:
- Ghosts visible on today.
- Network panel often showing many `user-data` requests, several returning **413** (payload too large).
- Even after later deploys, ghosts still resurrect after delete + refresh.

---

## 2. Guard rails / historical context (from `GUARD_RAILS.md`)

Relevant protected section: **GUARD_RAILS.md §3 Food Diary Entry Loading & Date Filtering**.

Key guard‑rail requirements:
- Never rely on `localDate` alone to filter.
- Always merge DB rows into cache via `mapLogsToEntries(...)` + `dedupeEntries(...)`.
- Backfill safeguard (Jan 2026): if client has local entries for a day but `/api/food-log` returns 0, UI backfills those entries into `FoodLog` so deletes have real IDs.
- Delete sweep: try delete by ID, then by description+category across multiple dates.
- Do not remove multi‑date delete sweep or cache clear + reload.

Guard rails explicitly mention:
- Root cause previously observed: entries with mismatched `localDate` vs `createdAt` leak across days; warm cache can keep showing cards even after server delete.
- Delete failures can cause entries to reappear; there are console scripts for manual cleanup.

Prior agent handovers also noted:
- `todaysFoods` is stored in hidden goal `__TODAYS_FOODS_DATA__` for “fast today view”.
- History view uses real `FoodLog` rows.
- If snapshots don’t sync, deletes can 404 or resurrect.

---

## 3. Repo architecture relevant to this issue

**Frontend**
- Main diary page: `app/food/page.tsx`.
- Local “today cache”: `todaysFoods` state + warm snapshot (`sessionStorage foodDiary:warmState`) + persistent snapshot (`localStorage foodDiary:persistentSnapshot`).
- Server “today snapshot”: stored in hidden health goal `__TODAYS_FOODS_DATA__` via `POST /api/user-data` with `{todaysFoods, appendHistory:false}`.

**Backend**
- History table: Prisma `FoodLog`.
- Load history: `GET /api/food-log?date=YYYY-MM-DD&tz=...`.
  - Has broad OR query and post-filtering to handle wrong/missing `localDate`.
  - Includes JWT fallback because `getServerSession` is unreliable on some clients.
- Save history: `POST /api/food-log` (called directly by diary for new entries).
- Delete by id: `POST /api/food-log/delete`.
- Delete by description: `POST /api/food-log/delete-by-description`.

**Provider**
- `components/providers/UserDataProvider.tsx` only caches GET `/api/user-data` and provides `updateUserData` (local state merge). It does NOT POST.

---

## 4. What I (current agent) tried and deployed

### 4.1 Date‑drift / cross‑day leak fixes in `app/food/page.tsx`

Deploys:
1. **Commit `c56844a3` — “Fix Food Diary date drift ghosts”**
   - Added timestamp‑sanity derivation (`extractEntryTimestampMs`, `deriveDateFromEntryTimestamp`).
   - `entryMatchesDate` now trusts timestamp date over conflicting `localDate`.
   - `normalizeDiaryEntry` no longer defaults missing dates to today; uses selected date fallback.
   - Cache filter healed mismatched localDate vs timestamp.
   - **Result:** ghosts still resurrect after delete.

### 4.2 Payload‑size / 413 fixes for `/api/user-data`

Deploys:
2. **Commit `5e98e47b` — “Compact todaysFoods snapshot”**
   - Before POST `/api/user-data`, strip heavy fields and truncate description.
   - Applied to save and delete snapshot writes.
   - **Result:** still saw `user-data 413` in user screenshots; delete resurrection persisted.

3. **Commit `1e7fa7fb` — “Limit todaysFoods snapshot to recent window”**
   - Limit server snapshot to last ~21 days and max 300 entries.
   - Intended to guarantee no 413.
   - **Result:** still saw 413 on user side; also caused a regression where DB verification replaced cache and temporarily hid real breakfast entry.

4. **Commit `fa32e8cf` — “Merge DB+cache for today and scope snapshot to selected date”**
   - Server snapshot now only the currently viewed date.
   - DB verification merges DB rows with local cache instead of hard replace.
   - **Result:** 413 stopped in one screenshot, but ghosts still resurrect after delete + refresh.

### 4.3 Server delete auth reliability

Deploy:
5. **Commit `bfe594cc` — “Add JWT auth fallback to delete routes”**
   - Added JWT fallback to `/api/food-log/delete` and `/delete-by-description` matching `/api/food-log` GET.
   - Hypothesis: deletes were failing auth silently on Safari/PWA so rows survived.
   - **Result:** user still sees resurrection.

---

## 5. What remains true after all deploys

- Ghost entries **continue to reappear after delete + refresh**.
- In latest user screenshot, `delete` requests return 200 and no 413 is obvious, yet ghosts come back.
- Therefore this is not *only* local cache resurrection or auth failure.

---

## 6. Working hypotheses for next agent (DO NOT repeat prior attempts)

### Hypothesis A: Delete sweep is missing the real rows
Possibility:
- UI deletes a *mapped* entry (id timestamp) that corresponds to multiple FoodLog rows on the same day.
- `/api/food-log/delete` deletes one row, but another near‑duplicate row remains and is returned on refresh.

Evidence:
- Resurrection even when delete endpoint returns 200.
- Dedupe keys might collapse duplicates in UI, hiding multiple server rows.

### Hypothesis B: Backfill safeguard is re‑creating ghosts
Possibility:
- After delete, DB returns 0 or partial results for today, and the backfill path re‑posts local cache entries into FoodLog.
- If local cache still contains the ghosts (e.g., from warm/persistent snapshots), backfill recreates them.

Guard rail says backfill MUST stay, so fix must ensure only valid entries are backfilled.

### Hypothesis C: “todaysFoods” stored goal still contains ghosts
Possibility:
- Even with snapshot scoped to selected date, some other path is writing stale ghosts into `__TODAYS_FOODS_DATA__`.
- On load, diary reads provider `userData.todaysFoods` first, so stale goal entries can seed UI + backfill.

Need to audit ALL writers to `todaysFoods` and ensure they don’t include cross‑day ghosts.

### Hypothesis D: Server `FoodLog` GET post-filtering is rewriting localDate and moving rows
Possibility:
- GET auto‑heals localDate based on createdAt window; a ghost row might be getting re‑attributed to today even after delete of the expected id.
- Another row with wrong localDate/createdAt in boundary window keeps sliding into today.

### Hypothesis E: Client is deleting the wrong key
Possibility:
- `deleteFood` tries dbId then entryId timestamp. If entryId differs from actual FoodLog id and dbId is missing/incorrect, the wrong row is deleted.
- The “nuclear” delete‑by‑description uses normalized description; if server row description differs slightly (e.g., hidden meta line, whitespace, different category), it won’t match.

---

## 7. What the next agent should do

**Important:** Do NOT redo any patch above. Assume they are already live.

Recommended next steps:
1. **Inspect live DB for this user and today’s date.**
   - Query all FoodLog rows for `localDate = today` OR createdAt window for today.
   - Look for multiple similar rows (burger/peanuts) with different ids or slight description/category differences.
2. **Instrument delete endpoints temporarily (server logs).**
   - Log which IDs are deleted and how many rows match delete‑by‑description.
3. **Verify backfill triggers after delete.**
   - Confirm whether backfill runs when DB is empty/partial and whether it re‑creates deleted items.
4. **Audit all writers to `__TODAYS_FOODS_DATA__` and any other hidden goal storing foods.**
   - Ensure no cross‑day merge is happening elsewhere.
5. **If duplicates exist, adjust delete‑by‑description matching.**
   - Consider more robust normalization or deleting all matches for selectedDate regardless of minor diffs.

---

## 8. Deployment notes for next agent

- Preferred deploy path: commit + push to `master` (auto Vercel).  
- Always verify deploy status with `./scripts/check-deployment-status.sh`.
- Current relevant commits on master in order:
  1. `c56844a3` date drift fixes
  2. `5e98e47b` compact snapshot
  3. `1e7fa7fb` recent-window snapshot
  4. `fa32e8cf` merge DB+cache and snapshot-per-day
  5. `bfe594cc` delete JWT fallback
  6. `fa32e8cf` already includes latest snapshot scoping

---

## 9. User expectation

- User is exhausted and angry; they explicitly do **not** want any repeat of prior experiments.
- They want a **root-cause fix** that stops:
  - ghosts appearing on new days
  - ghosts being undeletable
  - deletes resurrecting after refresh

