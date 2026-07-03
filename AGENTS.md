# Repository Guidelines

## Project Structure & Module Organization

Komorebi is an Expo/React Native camera app using Expo Router. The main app lives in `app/`: screens are in `app/index.jsx` and `app/_layout.tsx`, reusable UI is in `app/components/`, hooks in `app/hooks/`, shared state in `app/context/`, and image/EXIF/LUT helpers in `app/utils/`. Static assets live in `assets/`, including LUT `.cube` files, sounds, and images. Custom Expo native modules are under `modules/` (`camera-manual-controls`, `camera-raw-capture`, `camera-control-button`) with Swift iOS implementations and TypeScript entry points. Native projects are in `ios/` and `android/`; config plugins are in `plugins/`; patch-package patches are in `patches/`; technical notes are in `docs/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies and apply `patch-package` via `postinstall`.
- `npm start`: start the Expo development server.
- `npm run ios`: build and run the iOS app.
- `npm run android`: build and run the Android app.
- `npm run web`: start the web target for quick UI checks where supported.
- `npm run lint`: run Expo ESLint checks.

Use physical devices when validating camera, RAW capture, haptics, media library, GPS, and volume shutter behavior.

## Coding Style & Naming Conventions

Follow the existing JavaScript/React style: functional components, hooks for device/app behavior, and separate `*.styles.js` files for component styles. Use PascalCase for components (`CameraPreview.jsx`), `useCamelCase` for hooks (`useRawCapture.js`), and camelCase for utility modules. Keep native module public APIs in each module's `index.ts`; keep iOS implementation details in `modules/*/ios/`. Run `npm run lint` before handing off changes.

## Testing Guidelines

There is no dedicated automated test suite yet. For now, combine `npm run lint` with focused manual testing on iOS/Android. Validate the exact feature touched: capture flow, manual controls, LUT processing, EXIF preservation, gallery display, permissions, and error states. If adding tests later, place them near the feature as `*.test.js` or in a local `__tests__/` folder.

## Commit & Pull Request Guidelines

Recent history uses short Conventional Commit-style prefixes, often in Portuguese, such as `feat: suporte para fotos em RAW`, `fix: shutter não disparando`, and `chore: mudança no cliff.toml`. Keep commits focused and imperative. Pull requests should include a concise summary, tested devices/platforms, commands run, linked issue when available, and screenshots or screen recordings for UI/camera workflow changes.

## Security & Configuration Tips

Do not commit local build artifacts, secrets, signing files, or generated media. Treat camera, location, and media-library permissions as user-facing privacy surfaces; update `app/docs/` and `app.json` permission copy when behavior changes.
