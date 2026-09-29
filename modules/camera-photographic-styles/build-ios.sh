#!/usr/bin/env bash
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$MODULE_DIR/rust"
FRAMEWORK_DIR="$MODULE_DIR/ios/Frameworks/XDRemuxCore.xcframework"
HEADERS_DIR="$MODULE_DIR/ios/FrameworkHeaders"
CARGO_BIN="${CARGO_BIN:-$HOME/.cargo/bin/cargo}"

build_target() {
  local target="$1"
  local output="$2"
  IPHONEOS_DEPLOYMENT_TARGET=15.1 \
    CARGO_TARGET_DIR="$RUST_DIR/$output" \
    "$CARGO_BIN" build --manifest-path "$RUST_DIR/Cargo.toml" --release --target "$target"
}

build_target aarch64-apple-ios target-ios-device
build_target aarch64-apple-ios-sim target-ios-sim-arm64
build_target x86_64-apple-ios target-ios-sim-x64

mkdir -p "$RUST_DIR/universal-simulator" "$MODULE_DIR/ios/Frameworks"
lipo -create \
  "$RUST_DIR/target-ios-sim-arm64/aarch64-apple-ios-sim/release/libxdremux_core.a" \
  "$RUST_DIR/target-ios-sim-x64/x86_64-apple-ios/release/libxdremux_core.a" \
  -output "$RUST_DIR/universal-simulator/libxdremux_core.a"

if [[ -d "$FRAMEWORK_DIR" ]]; then
  mv "$FRAMEWORK_DIR" "$FRAMEWORK_DIR.previous"
fi

xcodebuild -create-xcframework \
  -library "$RUST_DIR/target-ios-device/aarch64-apple-ios/release/libxdremux_core.a" \
  -headers "$HEADERS_DIR" \
  -library "$RUST_DIR/universal-simulator/libxdremux_core.a" \
  -headers "$HEADERS_DIR" \
  -output "$FRAMEWORK_DIR"

if [[ -d "$FRAMEWORK_DIR.previous" ]]; then
  rm -rf "$FRAMEWORK_DIR.previous"
fi
