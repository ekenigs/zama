#!/usr/bin/env bash
# Deterministic contract dependency install (git + vendor copy + pinned zip URLs).
# Avoids forge soldeer, which can leave corrupt zips or layouts that break remappings.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS="$ROOT/contracts/dependencies"
VENDOR_DEPS="$ROOT/vendor/forge-fhevm/dependencies"

FHEVM_SOLIDITY_ZIP="https://soldeer-revisions.s3.amazonaws.com/@fhevm-solidity/0_11_1_23-03-2026_15:50:59_library-solidity.zip"
ENCRYPTED_TYPES_ZIP="https://soldeer-revisions.s3.amazonaws.com/@encrypted-types/0_0_4_17-03-2026_15:04:04_encrypted-types.zip"

forge_fhevm_rev() {
  grep 'forge-fhevm' "$ROOT/contracts/foundry.toml" | sed -n 's/.*rev = "\([^"]*\)".*/\1/p'
}

FORGE_FHEVM_REV="$(forge_fhevm_rev)"
FORGE_FHEVM_REV="${FORGE_FHEVM_REV:-eba2324}"

contract_deps_ready() {
  [[ -f "$DEPS/forge-std-1.9.6/src/Script.sol" ]] &&
    [[ -f "$DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol" ]] &&
    [[ -f "$DEPS/@encrypted-types-0.0.4/EncryptedTypes.sol" ]] &&
    [[ -f "$DEPS/@openzeppelin-contracts-5.1.0/contracts/interfaces/IERC20.sol" ]] &&
    [[ -f "$DEPS/@openzeppelin-contracts-5.1.0/contracts/mocks/token/ERC20Mock.sol" ]] &&
    [[ -f "$DEPS/@openzeppelin-confidential-contracts-0.5.1/contracts/token/ERC7984/ERC7984.sol" ]] &&
    [[ -f "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}/deploy-local.sh" ]]
}

git_clone_dep() {
  local check_file="$1"
  local dest="$2"
  shift 2

  if [[ -f "$check_file" || -d "$check_file" ]]; then
    return 0
  fi

  rm -rf "$dest"
  git clone "$@" "$dest"
}

copy_vendor_dep() {
  local name="$1"
  local check_file="$2"

  if [[ -f "$check_file" || -d "$check_file" ]]; then
    return 0
  fi

  if [[ ! -d "$VENDOR_DEPS/$name" ]]; then
    return 1
  fi

  rm -rf "$DEPS/$name"
  cp -R "$VENDOR_DEPS/$name" "$DEPS/$name"

  return 0
}

install_zip_dep() {
  local dest_name="$1"
  local url="$2"
  local check_file="$3"

  if [[ -f "$check_file" ]]; then
    return 0
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"

  echo "  fetching ${dest_name}…"
  curl -fsSL "$url" -o "$tmpdir/archive.zip"
  rm -rf "$DEPS/$dest_name"
  mkdir -p "$DEPS/$dest_name"
  unzip -q "$tmpdir/archive.zip" -d "$DEPS/$dest_name"
  rm -rf "$tmpdir"

  if [[ ! -f "$check_file" ]]; then
    echo "Error: ${dest_name} missing ${check_file} after zip extract"

    return 1
  fi
}

install_contract_deps() {
  mkdir -p "$DEPS"

  echo "Installing forge-std 1.9.6…"
  git_clone_dep \
    "$DEPS/forge-std-1.9.6/src/Script.sol" \
    "$DEPS/forge-std-1.9.6" \
    --depth 1 --branch v1.9.6 \
    https://github.com/foundry-rs/forge-std.git

  echo "Installing OpenZeppelin contracts 5.1.0…"
  git_clone_dep \
    "$DEPS/@openzeppelin-contracts-5.1.0/contracts/interfaces/IERC20.sol" \
    "$DEPS/@openzeppelin-contracts-5.1.0" \
    --depth 1 --branch v5.1.0 \
    https://github.com/OpenZeppelin/openzeppelin-contracts.git

  echo "Installing OpenZeppelin confidential contracts 0.5.1…"
  git_clone_dep \
    "$DEPS/@openzeppelin-confidential-contracts-0.5.1/contracts/token/ERC7984/ERC7984.sol" \
    "$DEPS/@openzeppelin-confidential-contracts-0.5.1" \
    --depth 1 --branch v0.5.1 \
    https://github.com/OpenZeppelin/openzeppelin-confidential-contracts.git

  echo "Installing forge-fhevm ${FORGE_FHEVM_REV}…"
  if [[ ! -f "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}/deploy-local.sh" ]]; then
    rm -rf "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}"
    git_clone_dep \
      "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}/deploy-local.sh" \
      "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}" \
      --depth 250 \
      https://github.com/zama-ai/forge-fhevm.git
    (cd "$DEPS/forge-fhevm-${FORGE_FHEVM_REV}" && git checkout "$FORGE_FHEVM_REV" 2>/dev/null || true)
  fi

  echo "Installing @fhevm-solidity 0.11.1…"
  if ! copy_vendor_dep "@fhevm-solidity-0.11.1" "$DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol"; then
    install_zip_dep \
      "@fhevm-solidity-0.11.1" \
      "$FHEVM_SOLIDITY_ZIP" \
      "$DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol"
  fi

  echo "Installing @encrypted-types 0.0.4…"
  if ! copy_vendor_dep "@encrypted-types-0.0.4" "$DEPS/@encrypted-types-0.0.4/EncryptedTypes.sol"; then
    install_zip_dep \
      "@encrypted-types-0.0.4" \
      "$ENCRYPTED_TYPES_ZIP" \
      "$DEPS/@encrypted-types-0.0.4/EncryptedTypes.sol"
  fi
}

if contract_deps_ready; then
  echo "Contract dependencies already installed."

  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to install contract dependencies"

  exit 1
fi

echo "Installing contract dependencies…"
install_contract_deps

if ! contract_deps_ready; then
  echo "Error: contract dependencies are still incomplete after install"

  exit 1
fi

echo "Contract dependencies ready."
