#!/bin/bash
set -euo pipefail
check_root="$(cd "$(dirname "$0")/.." && pwd)"
check_build="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-depth-build.XXXXXX")"
trap 'rm -rf "$check_build"' EXIT
ruby "$check_root/scripts/verify-depth-model.rb"
xcrun swiftc -module-cache-path "$check_build/cache" \
  "$check_root/modules/camera-photo-depth/ios/PhotoDepthRecoveryStore.swift" \
  "$check_root/modules/camera-photo-depth/ios/PhotosPortraitCompatibility.swift" \
  "$check_root/modules/camera-photo-depth/ios/PhotoDepthEngine.swift" \
  "$check_root/modules/camera-photo-depth/ios/PhotoDepthPortraitEncoding.swift" \
  "$check_root/modules/camera-photo-depth/ios/PhotoDepthRenderingProfile.swift" \
  "$check_root/modules/shared/PhotoCatalogMetadata.swift" \
  "$check_root/scripts/check-photo-depth-native.swift" -o "$check_build/check"
"$check_build/check" "$check_root/modules/camera-photo-depth/ios/Models/DepthAnythingV2SmallF16.mlpackage"
