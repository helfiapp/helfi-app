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

## How to run it (simple developer steps)
This is the easiest way to run the phone app on a Mac.

### 1) Install the phone-app dependencies (one time)
```bash
cd native
npm install
```

### 2) Start the phone app
```bash
cd native
npm start
```

This opens an Expo screen in your terminal/browser. From there you can:
- Run on an iPhone simulator (Mac): press `i`
- Run on an Android emulator: press `a`
- Run on a real phone using the Expo Go app: scan the QR code

### 3) One-command shortcuts
These do the same thing, just faster:

```bash
cd native
npm run ios
```

```bash
cd native
npm run android
```
