#!/usr/bin/env bash
# Install vendor/forge-fhevm/dependencies without soldeer (git + pinned zip URLs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/forge-fhevm"
DEPS="$VENDOR/dependencies"

FORGE_STD_ZIP="https://soldeer-revisions.s3.amazonaws.com/forge-std/1_14_0_05-01-2026_15:24:39_forge-std-1.14.zip"
OZ_CONTRACTS_ZIP="https://soldeer-revisions.s3.amazonaws.com/@openzeppelin-contracts/5_1_0_19-10-2024_10:28:52_contracts.zip"
OZ_UPGRADEABLE_ZIP="https://soldeer-revisions.s3.amazonaws.com/@openzeppelin-contracts-upgradeable/5_1_0_19-10-2024_10:28:58_contracts-upgradeable.zip"
FHEVM_SOLIDITY_ZIP="https://soldeer-revisions.s3.amazonaws.com/@fhevm-solidity/0_11_1_23-03-2026_15:50:59_library-solidity.zip"
ENCRYPTED_TYPES_ZIP="https://soldeer-revisions.s3.amazonaws.com/@encrypted-types/0_0_4_17-03-2026_15:04:04_encrypted-types.zip"
OZ_CONFIDENTIAL_REV="6edd293165d6dc1fd29fffaa391b370b1888a70d"
OZ_CONFIDENTIAL_DIR="@openzeppelin-confidential-contracts-6edd293"

vendor_deps_ready() {
  [[ -f "$DEPS/forge-std-1.14.0/src/Script.sol" ]] &&
    [[ -f "$DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol" ]] &&
    [[ -f "$DEPS/@encrypted-types-0.0.4/EncryptedTypes.sol" ]] &&
    [[ -f "$DEPS/@openzeppelin-contracts-5.1.0/interfaces/IERC20.sol" ]] &&
    [[ -f "$DEPS/@openzeppelin-contracts-upgradeable-5.1.0/utils/MulticallUpgradeable.sol" ]] &&
    [[ -f "$DEPS/${OZ_CONFIDENTIAL_DIR}/contracts/token/ERC7984/ERC7984.sol" ]] &&
    [[ -f "$DEPS/${OZ_CONFIDENTIAL_DIR}/lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol" ]] &&
    [[ -f "$VENDOR/remappings.txt" ]]
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
}

install_confidential_contracts() {
  local dest="$DEPS/${OZ_CONFIDENTIAL_DIR}"

  if [[ -f "$dest/lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol" ]]; then
    return 0
  fi

  echo "  cloning OpenZeppelin confidential contracts (${OZ_CONFIDENTIAL_REV:0:7})…"
  rm -rf "$dest"
  git clone --recurse-submodules \
    https://github.com/OpenZeppelin/openzeppelin-confidential-contracts.git \
    "$dest"
  (cd "$dest" && git checkout "$OZ_CONFIDENTIAL_REV")
  (cd "$dest" && git submodule update --init --recursive)
}

write_vendor_remappings() {
  cat >"$VENDOR/remappings.txt" <<'EOF'
encrypted-types/=dependencies/@encrypted-types-0.0.4/
@fhevm/host-contracts/=src/fhevm-host/
@fhevm/solidity/=dependencies/@fhevm-solidity-0.11.1/
@openzeppelin/contracts-upgradeable/=dependencies/@openzeppelin-contracts-upgradeable-5.1.0/
@openzeppelin/contracts/=dependencies/@openzeppelin-contracts-5.1.0/
@openzeppelin-contracts-upgradeable/=dependencies/@openzeppelin-contracts-upgradeable-5.1.0/
@openzeppelin-contracts/=dependencies/@openzeppelin-contracts-5.1.0/
@openzeppelin/confidential-contracts/=dependencies/@openzeppelin-confidential-contracts-6edd293/contracts/
forge-fhevm/=src/
forge-std/=dependencies/forge-std-1.14.0/src/
EOF
}

disable_soldeer_recursive_deps() {
  if [[ ! -f "$VENDOR/foundry.toml" ]]; then
    return 0
  fi

  if grep -q 'recursive_deps = false' "$VENDOR/foundry.toml"; then
    return 0
  fi

  sed -i '' 's/recursive_deps = true/recursive_deps = false/' "$VENDOR/foundry.toml" 2>/dev/null ||
    sed -i 's/recursive_deps = true/recursive_deps = false/' "$VENDOR/foundry.toml"
}

install_vendor_deps() {
  mkdir -p "$DEPS"

  echo "Installing forge-std 1.14.0…"
  install_zip_dep \
    "forge-std-1.14.0" \
    "$FORGE_STD_ZIP" \
    "$DEPS/forge-std-1.14.0/src/Script.sol"

  echo "Installing OpenZeppelin contracts 5.1.0…"
  install_zip_dep \
    "@openzeppelin-contracts-5.1.0" \
    "$OZ_CONTRACTS_ZIP" \
    "$DEPS/@openzeppelin-contracts-5.1.0/interfaces/IERC20.sol"

  echo "Installing OpenZeppelin upgradeable 5.1.0…"
  install_zip_dep \
    "@openzeppelin-contracts-upgradeable-5.1.0" \
    "$OZ_UPGRADEABLE_ZIP" \
    "$DEPS/@openzeppelin-contracts-upgradeable-5.1.0/utils/MulticallUpgradeable.sol"

  echo "Installing @fhevm-solidity 0.11.1…"
  install_zip_dep \
    "@fhevm-solidity-0.11.1" \
    "$FHEVM_SOLIDITY_ZIP" \
    "$DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol"

  echo "Installing @encrypted-types 0.0.4…"
  install_zip_dep \
    "@encrypted-types-0.0.4" \
    "$ENCRYPTED_TYPES_ZIP" \
    "$DEPS/@encrypted-types-0.0.4/EncryptedTypes.sol"

  echo "Installing OpenZeppelin confidential contracts…"
  install_confidential_contracts
}

sync_vendor_config() {
  write_vendor_remappings
  disable_soldeer_recursive_deps
  rm -f "$VENDOR/soldeer.lock"
}

if [[ ! -d "$VENDOR" ]]; then
  echo "Skip forge-fhevm deps — vendor/forge-fhevm not present"

  exit 0
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  echo "Error: curl and unzip are required to install forge-fhevm dependencies"

  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to install forge-fhevm dependencies"

  exit 1
fi

if vendor_deps_ready; then
  sync_vendor_config
  echo "forge-fhevm dependencies already installed."

  exit 0
fi

echo "Installing forge-fhevm dependencies…"
install_vendor_deps

if ! vendor_deps_ready; then
  echo "Error: forge-fhevm dependencies are still incomplete after install"

  exit 1
fi

sync_vendor_config
echo "forge-fhevm dependencies ready."
