# Support Chat Backup Snapshot

This file is a quick reference for restoring the support chat + ticket system
to a known good state if it is broken by later changes.

## Snapshot Commit

- Commit: `7db259ab2918433abef8e010786e224b0c600594`

## Files in the Snapshot

- `app/support/page.tsx`
- `components/support/SupportChatWidget.tsx`
- `app/api/support/tickets/route.ts`
- `app/api/support/inquiry/route.ts`
- `lib/support-automation.ts`
- `data/support-kb.json`
- `lib/support-code-search.ts`
- `data/support-code-index.json`
- `scripts/build-support-code-index.js`

## How to View or Restore

View a file from the snapshot:

```
git show 7db259ab:app/support/page.tsx
```

Restore a file from the snapshot (example):

```
git checkout 7db259ab -- app/support/page.tsx
```

After restoring, re-test the support flows and redeploy.
