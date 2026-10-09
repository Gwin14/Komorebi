# Repository Guidelines

## Project Structure & Module Organization

Komorebi is an Expo/React Native camera app using Expo Router. The main app lives in `app/`: screens are in `app/index.jsx` and `app/_layout.tsx`, reusable UI is in `app/components/`, hooks in `app/hooks/`, shared state in `app/context/`, and image/EXIF/LUT helpers in `app/utils/`. Static assets live in `assets/`, including LUT `.cube` files, sounds, and images. Custom Expo native modules are under `modules/` (manual controls, RAW/HEIF+, Live Photo, portrait, stacking, photographic styles, photo depth, composition scan, and physical camera buttons) with Swift iOS implementations and TypeScript entry points; `camera-control-button` also has Android code. Shared Swift helpers live in `modules/shared/`. Native projects are in `ios/` and `android/`; config plugins are in `plugins/`; patch-package patches are in `patches/`; technical notes are in `docs/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies and apply `patch-package` via `postinstall`.
- `npm start`: start the Expo development server.
- `npm run ios`: build and run the iOS app.
- `npm run android`: build and run the Android app.
- `npm run web`: start the web target for quick UI checks where supported.
- `npm run lint`: run Expo ESLint checks.
- `npm test`: run Node tests for utilities, composition, hooks, and performance regressions.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run test:focus-native`: check native Focus Bracketing behavior.
- `npm run test:depth-native`: check depth model integrity, inference, metadata, and recovery on macOS/Xcode.
- `npm run setup:minicpm-ios`: prepare/validate the local iOS Scan runtime before installing Pods.

Use a native development build for local modules; Expo Go does not include them.

Use physical devices when validating camera, RAW capture, haptics, media library, GPS, and volume shutter behavior.

## Coding Style & Naming Conventions

Follow the existing JavaScript/React style: functional components, hooks for device/app behavior, and separate `*.styles.js` files for component styles. Use PascalCase for components (`CameraPreview.jsx`), `useCamelCase` for hooks (`useRawCapture.js`), and camelCase for utility modules. Keep native module public APIs in each module's `index.ts`; keep iOS implementation details in `modules/*/ios/`. Run `npm run lint` before handing off changes.

## Camera Notices

Use `useTopBarNotice` and the TopBar notice slot for brief informational messages and warnings on the camera screen. Keep text short and on one line. Notices temporarily replace controls with a fade, then restore them without changing the TopBar height. Keep capture progress and cancellation accessible; actionable permission prompts and dialogs can retain their dedicated UI.

## Testing Guidelines

The automated suite uses Node’s test runner (`npm test`), with utility tests in `app/utils/*.test.cjs` and composition/performance tests under `tests/`. Combine relevant automated checks and `npm run lint` with focused manual testing on iOS/Android. Validate the exact feature touched: capture flow, manual controls, LUT processing, EXIF preservation, gallery display, permissions, and error states. Follow the existing `*.test.cjs` convention for utility tests or the appropriate folder under `tests/`. Native checks and structural file validation do not replace physical-device validation of camera behavior and Apple Photos controls.

## Commit & Pull Request Guidelines

Recent history uses short Conventional Commit-style prefixes, often in Portuguese, such as `feat: suporte para fotos em RAW`, `fix: shutter não disparando`, and `chore: mudança no cliff.toml`. Keep commits focused and imperative. Pull requests should include a concise summary, tested devices/platforms, commands run, linked issue when available, and screenshots or screen recordings for UI/camera workflow changes.

## Security & Configuration Tips

Do not commit local build artifacts, secrets, signing files, or generated media. Treat camera, location, and media-library permissions as user-facing privacy surfaces; update `app/docs/` and `app.json` permission copy when behavior changes.
