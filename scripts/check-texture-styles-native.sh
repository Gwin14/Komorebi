#!/bin/bash
set -euo pipefail
check_root="$(cd "$(dirname "$0")/.." && pwd)"
check_build="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-texture-styles.XXXXXX")"
trap 'rm -rf "$check_build"' EXIT
xcrun swiftc -module-cache-path "$check_build/cache" \
  "$check_root/modules/camera-photographic-styles/ios/TextureStylesMetadata.swift" \
  "$check_root/modules/shared/PhotoCatalogMetadata.swift" \
  "$check_root/scripts/check-texture-styles-native.swift" -o "$check_build/check"
"$check_build/check"
