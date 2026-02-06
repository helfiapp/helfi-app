# Native (iPhone + Android) App

This repo now contains a separate phone app in the `native/` folder.

Important points:
- This is a real phone app (not a web page inside an app).
- It does not change or break the current website.
- iPhone and Android will share the same code, so we only build things once.

## What we named it
- App name users will see: `Helfi`
- Internal app ID used by Apple/Google (like a serial number): `ai.helfi.app`

If you strongly prefer `helfi.app` for the internal ID, we can change it, but
`ai.helfi.app` is the safer standard format because it matches `helfi.ai`.

## How to run it (developer steps)
These steps are for a developer machine.

```bash
cd native
npm run ios
```

```bash
cd native
npm run android
```

