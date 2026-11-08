# MRG Labs OCR — Android app

The phone version of the MRG Labs OCR web app, in React Native (Expo SDK 58, Expo Router).
It keeps the web app's mobile experience: home search and Quick read, full-screen camera
scan, batch upload, inventory, and settings with the four themes. It has no server of its
own: it calls the deployed web app's `/api/v1` routes with the user's Clerk session.

## Before the first build

1. **Clerk:** in the Clerk dashboard, go to **Configure → Native applications** and turn on
   the **Native API**. Without it, sign-in from the app is refused.
2. **Server address and key:** either set `EXPO_PUBLIC_API_URL` and
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (see `.env.example`) before building, or leave them
   out and enter them in the app on first launch. They can be changed later in
   **Settings → Server**.

Nothing in the web app needs to change: Clerk's middleware accepts the app's
`Authorization: Bearer` session token in place of the browser cookie.

## Run and build

```bash
npm install
npx expo run:android          # debug build on a connected phone or emulator
npm run typecheck
```

Release APK, locally (needs the Android SDK and JDK 17):

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Or in GitHub Actions: `.github/workflows/android-apk.yml` builds the same APK and attaches
it to the run as the `mrg-labs-ocr-apk` artifact. Builds of `main` are also published as a
GitHub Release, so the latest APK is always at **Releases → Latest → mrg-labs-ocr.apk**. Set `EXPO_PUBLIC_API_URL` and
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` as repository *variables* to bake them in.

The release APK is signed with the debug key, which is fine for installing directly on
phones. For the Play Store, add your own keystore (or use `eas build`).

## How it maps to the web app

| Web (phone layout)          | App                                  |
| --------------------------- | ------------------------------------ |
| `/`                         | `src/app/(tabs)/index.tsx`           |
| `/camera`                   | `src/app/(tabs)/camera.tsx`          |
| `/file-upload`              | `src/app/(tabs)/upload.tsx`          |
| `/inventory`                | `src/app/(tabs)/inventory.tsx`       |
| `/settings`                 | `src/app/(tabs)/settings.tsx`        |
| `/sign-in`                  | `src/app/sign-in.tsx`                |
| `features/labels/lib`       | `src/lib/labels.ts`, `media.ts`      |

Differences from the web app:

- The camera has a **Photo** mode alongside **Video**.
- Uploaded videos go to the OCR route whole, as the camera's recordings already did; the
  server picks the frames. The still kept in Cloudinary is the video's middle frame.
- Photos are converted to JPEG and resized to 1600px before upload (handles HEIC and keeps
  mobile data use down).
- CSV downloads open the share sheet (save to Files, Drive, email…).
