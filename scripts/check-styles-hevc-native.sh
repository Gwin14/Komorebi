#!/bin/bash
set -euo pipefail
check_root="$(cd "$(dirname "$0")/.." && pwd)"
check_build="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-styles-hevc.XXXXXX")"
trap 'rm -rf "$check_build"' EXIT
xcrun swiftc -O -module-cache-path "$check_build/cache" \
  "$check_root/modules/camera-photographic-styles/ios/VideoToolboxHEVCEncoder.swift" \
  "$check_root/scripts/check-styles-hevc-native.swift" -o "$check_build/check"
"$check_build/check" "$check_build"
if command -v ffmpeg >/dev/null; then
  for variant in fresh reused independent; do
    ffmpeg -v error -xerror -i "$check_build/$variant.hevc" \
      -pix_fmt gray -f rawvideo "$check_build/$variant.gray"
  done
  cmp "$check_build/fresh.gray" "$check_build/reused.gray"
  tail -c 262144 "$check_build/reused.gray" > "$check_build/last.gray"
  cmp "$check_build/last.gray" "$check_build/independent.gray"
  echo "Decoded pixels match; final tile decodes independently"
fi
