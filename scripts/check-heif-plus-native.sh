#!/bin/bash
set -euo pipefail
check_root="$(cd "$(dirname "$0")/.." && pwd)"
check_build="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-heifplus-build.XXXXXX")"
trap 'rm -rf "$check_build"' EXIT
xcrun swiftc -module-cache-path "$check_build/cache" \
  "$check_root/modules/camera-raw-capture/ios/HeifPlusEngine.swift" \
  "$check_root/modules/camera-raw-capture/ios/HeifPlusEffects.swift" \
  "$check_root/scripts/check-heif-plus-native.swift" -o "$check_build/check"
"$check_build/check"
