#!/bin/bash
set -euo pipefail
check_root="$(cd "$(dirname "$0")/.." && pwd)"
check_build="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-focus-build.XXXXXX")"
trap 'rm -rf "$check_build"' EXIT
xcrun swiftc -module-cache-path "$check_build/cache" \
  "$check_root/modules/camera-image-stacking/ios/ImageStackingEngine.swift" \
  "$check_root/modules/camera-image-stacking/ios/ImageStackingStrategies.swift" \
  "$check_root/modules/camera-image-stacking/ios/FocusBracketing.swift" \
  "$check_root/scripts/check-focus-bracketing-native.swift" -o "$check_build/check"
"$check_build/check"
