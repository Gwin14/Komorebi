#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FRAMEWORK_DIR="${ROOT_DIR}/modules/composition-scan/ios/Frameworks"
INSTALLED_FRAMEWORK="${FRAMEWORK_DIR}/llama.xcframework"
UPSTREAM_COMMIT="d1aac05eecaac64b7fc35f1cc93a06b726ce10e3"
SOURCE_DIR=""

validate_framework() {
  local framework="$1"
  local device="${framework}/ios-arm64/llama.framework"
  local simulator="${framework}/ios-arm64_x86_64-simulator/llama.framework"

  [[ -f "${framework}/Info.plist" ]] || return 1
  for slice in "${device}" "${simulator}"; do
    [[ -s "${slice}/llama" ]] || return 1
    [[ -f "${slice}/Headers/llama.h" ]] || return 1
    [[ -f "${slice}/Headers/mtmd.h" ]] || return 1
    [[ -f "${slice}/Headers/mtmd-helper.h" ]] || return 1
    grep -q '_llama_model_load_from_file$' < <(nm -gU "${slice}/llama" 2>/dev/null) || return 1
    grep -q '_mtmd_init_from_file$' < <(nm -gU "${slice}/llama" 2>/dev/null) || return 1
  done
}

if [[ "${1:-}" != "--force" ]] && validate_framework "${INSTALLED_FRAMEWORK}"; then
  echo "Runtime MiniCPM-V já está pronto e validado. Nada para recompilar."
  echo "Próximo passo: npx pod-install ios"
  exit 0
fi

SOURCE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/komorebi-minicpm.XXXXXX")"

cleanup() {
  if [[ -n "${SOURCE_DIR}" && -d "${SOURCE_DIR}" ]]; then
    rm -rf -- "${SOURCE_DIR}"
  fi
}
trap cleanup EXIT

if ! command -v cmake >/dev/null 2>&1; then
  echo "CMake 3.28+ é necessário. Instale com: brew install cmake" >&2
  exit 1
fi

echo "Preparando runtime local MiniCPM-V…"
git clone --filter=blob:none --no-checkout https://github.com/OpenBMB/MiniCPM-V-Apps.git "${SOURCE_DIR}"
git -C "${SOURCE_DIR}" fetch --depth 1 origin "${UPSTREAM_COMMIT}"
git -C "${SOURCE_DIR}" checkout --detach "${UPSTREAM_COMMIT}"
git -C "${SOURCE_DIR}" submodule update --init --depth 1 --single-branch llama.cpp-omni

# The pinned upstream script installs the generated framework here, but the
# empty thirdparty directory is not tracked by Git in a fresh checkout.
mkdir -p "${SOURCE_DIR}/MiniCPM-V-demo/thirdparty"
MINIMAL_MODE=ios "${SOURCE_DIR}/scripts/build_xcframework.sh"

GENERATED_FRAMEWORK="${SOURCE_DIR}/MiniCPM-V-demo/thirdparty/llama.xcframework"
if [[ ! -d "${GENERATED_FRAMEWORK}" ]]; then
  echo "Erro: a compilação terminou sem gerar llama.xcframework." >&2
  exit 1
fi

mkdir -p "${FRAMEWORK_DIR}"
STAGING_DIR="$(mktemp -d "${FRAMEWORK_DIR}/.llama-install.XXXXXX")"
cp -R "${GENERATED_FRAMEWORK}" "${STAGING_DIR}/llama.xcframework"
if ! validate_framework "${STAGING_DIR}/llama.xcframework"; then
  rm -rf -- "${STAGING_DIR}"
  echo "Erro: llama.xcframework foi gerado, mas falhou na validação de integridade." >&2
  exit 1
fi
rm -rf -- "${INSTALLED_FRAMEWORK}"
mv "${STAGING_DIR}/llama.xcframework" "${INSTALLED_FRAMEWORK}"
rmdir "${STAGING_DIR}"

echo "Runtime pronto e validado. Rode npx pod-install ios antes do próximo build."
