# AUTO_SYNC.md — Cross‑Device Auto‑Sync (Food Diary) Handoff Notes

## Goal
Make Food Diary stay consistent across devices (desktop + iPhone/PWA) so that:
- Deleting/editing on one device propagates to the other without relying on manual refresh.
- The UI does **not** accumulate duplicates over time.

This file documents the intended approach and the current implementation location so a future agent can revisit “Google Docs‑like” realtime syncing.

---

## Current State (lightweight auto-sync)
**File:** `app/food/page.tsx`

There is a “best effort” sync that:
- Calls `/api/food-log?date=YYYY-MM-DD&tz=...` and maps logs via `mapLogsToEntries(...)`.
- Runs the result through `dedupeEntries(...)` before updating state.
- Triggers:
  - shortly after mount / date switch
  - on window focus
  - on `visibilitychange` (when tab becomes visible)
  - on a polling interval (currently ~12s) while `/food` is open

**Important invariant:** server rows are authoritative for DB‑backed entries (`dbId` present). Local entries are only kept if they are not DB‑backed (optimistic/pending).

Why: if you merge server rows with already-cached DB rows, timestamp ids may not match and you can “multiply duplicates” on every refresh/poll.

---

## Why this is not true realtime
This is not a collaborative realtime system (no live cursor / instant push). It’s a periodic pull + focus refresh.

True realtime cross‑device sync requires server‑driven updates (SSE/WebSockets) or push notifications + background fetch, plus conflict resolution rules.

---

## Future “Google Docs‑like” approach (recommended)
### Option A — Server-Sent Events (SSE)
- Add `/api/food-log/stream?date=...` that emits events on create/update/delete.
- Client subscribes while `/food` is open.
- Reconcile using `dbId` as the stable key.

Pros: simpler than WebSockets, works well for “push updates”.
Cons: mobile/PWA background behavior is limited; still need periodic refetch on resume.

### Option B — WebSockets
- Maintain a per-user channel; broadcast changes to all open clients.
- Requires infra (WS server) and operational work.

Pros: bi-directional, lowest latency.
Cons: more infra + complexity.

### Option C — Keep polling + add better “staleness” UX
- Keep focus refresh + longer polling interval.
- Show subtle “Updated just now” indicator and a “Refresh” button.

Pros: minimal infra.
Cons: not instant; can still feel laggy.

---

## Guard Rails / Rules to keep
From `GUARD_RAILS.md`:
- Always map API results via `mapLogsToEntries(...)` then `dedupeEntries(...)` before state updates.
- Do not reintroduce strict `localDate` filtering; timestamp fallback is required.
- Delete protection relies on tombstones and multi-date delete sweep; don’t weaken it.

---

## Implementation Notes (if you extend this)
1. **Use `dbId` as the canonical identity** for DB rows.
2. On any server sync event, either:
   - refetch the day and replace DB-backed rows, or
   - apply a patch (upsert/delete) to local state keyed by `dbId`.
3. Keep local “optimistic” entries only until they receive a `dbId` (or are replaced by the corresponding server row).
4. Any sync system must avoid “merge server + keep local DB rows” without a `dbId` reconciliation step.

