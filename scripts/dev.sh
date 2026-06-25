#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORGE_FHEVM_DIR="$ROOT/vendor/forge-fhevm"
FORGE_FHEVM_URL="https://github.com/zama-ai/forge-fhevm.git"
CONTRACTS_DIR="$ROOT/contracts"
CONTRACTS_DEPS="$CONTRACTS_DIR/dependencies"

# Anvil account #8 — dedicated token deployer (nonces 0/1 → fixed CREATE addresses)
DEFAULT_TOKEN_DEPLOYER_KEY="0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"
DEFAULT_CONTRACT_ADDRESS="0x98eDDadCfde04dC22a0e62119617e74a6Bc77313"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

forge_fhevm_rev() {
  grep 'forge-fhevm' contracts/foundry.toml | sed -n 's/.*rev = "\([^"]*\)".*/\1/p'
}

clean_soldeer_partial() {
  local dir="$1"

  rm -f "$dir"/dependencies/*.zip 2>/dev/null || true
  find "$dir"/dependencies -maxdepth 1 -type d -empty -delete 2>/dev/null || true
}

install_soldeer() {
  local dir="$1"
  local attempt

  for attempt in 1 2 3; do
    if (cd "$dir" && forge soldeer install); then
      return 0
    fi

    echo "forge soldeer install failed in ${dir} (attempt ${attempt}/3)"

    clean_soldeer_partial "$dir"
    sleep 1
  done

  return 1
}

contract_deps_ready() {
  [[ -f "$CONTRACTS_DEPS/forge-std-1.9.6/src/Script.sol" ]] &&
    [[ -f "$CONTRACTS_DEPS/@fhevm-solidity-0.11.1/lib/FHE.sol" ]] &&
    [[ -d "$CONTRACTS_DEPS/@openzeppelin-confidential-contracts-0.5.1/contracts" ]]
}

bootstrap_contract_deps_fallback() {
  local fhevm_deps="$FORGE_FHEVM_DIR/dependencies"
  local rev
  rev="$(forge_fhevm_rev)"
  rev="${rev:-eba2324}"

  echo "Falling back to git clones for contract dependencies…"
  mkdir -p "$CONTRACTS_DEPS"

  if [[ ! -f "$CONTRACTS_DEPS/forge-std-1.9.6/src/Script.sol" ]]; then
    git clone --depth 1 --branch v1.9.6 https://github.com/foundry-rs/forge-std.git \
      "$CONTRACTS_DEPS/forge-std-1.9.6"
  fi

  if [[ ! -d "$CONTRACTS_DEPS/@openzeppelin-contracts-5.1.0/contracts" ]]; then
    git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git \
      "$CONTRACTS_DEPS/@openzeppelin-contracts-5.1.0"
  fi

  if [[ ! -d "$CONTRACTS_DEPS/@openzeppelin-confidential-contracts-0.5.1/contracts" ]]; then
    git clone --depth 1 --branch v0.5.1 https://github.com/OpenZeppelin/openzeppelin-confidential-contracts.git \
      "$CONTRACTS_DEPS/@openzeppelin-confidential-contracts-0.5.1"
  fi

  if [[ ! -d "$CONTRACTS_DEPS/forge-fhevm-${rev}/src" ]]; then
    git clone --depth 1 https://github.com/zama-ai/forge-fhevm.git \
      "$CONTRACTS_DEPS/forge-fhevm-${rev}"
    (cd "$CONTRACTS_DEPS/forge-fhevm-${rev}" && git checkout "$rev" 2>/dev/null || true)
  fi

  if [[ -d "$fhevm_deps/@fhevm-solidity-0.11.1" ]]; then
    rm -rf "$CONTRACTS_DEPS/@fhevm-solidity-0.11.1"
    cp -R "$fhevm_deps/@fhevm-solidity-0.11.1" "$CONTRACTS_DEPS/"
  fi

  if [[ -d "$fhevm_deps/@encrypted-types-0.0.4" ]]; then
    rm -rf "$CONTRACTS_DEPS/@encrypted-types-0.0.4"
    cp -R "$fhevm_deps/@encrypted-types-0.0.4" "$CONTRACTS_DEPS/"
  fi

  contract_deps_ready
}

ensure_forge_fhevm_host() {
  if [[ -x "$FORGE_FHEVM_DIR/deploy-local.sh" ]]; then
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "git required to fetch forge-fhevm — install git or clone manually into vendor/forge-fhevm"

    return 1
  fi

  local rev
  rev="$(forge_fhevm_rev)"
  rev="${rev:-main}"

  echo "Fetching forge-fhevm (rev ${rev})…"
  mkdir -p "$ROOT/vendor"
  rm -rf "$FORGE_FHEVM_DIR"

  if ! git clone --depth 250 "$FORGE_FHEVM_URL" "$FORGE_FHEVM_DIR"; then
    echo "Failed to clone forge-fhevm from ${FORGE_FHEVM_URL}"

    return 1
  fi

  if ! (cd "$FORGE_FHEVM_DIR" && git checkout "$rev" 2>/dev/null); then
    echo "Warning: could not checkout forge-fhevm rev ${rev} — using default branch"
  fi

  if [[ ! -x "$FORGE_FHEVM_DIR/deploy-local.sh" ]]; then
    echo "forge-fhevm clone missing deploy-local.sh"

    return 1
  fi

  return 0
}

ensure_forge_fhevm_deps() {
  if [[ ! -d "$FORGE_FHEVM_DIR" ]]; then
    return 1
  fi

  if [[ -f "$FORGE_FHEVM_DIR/dependencies/forge-std-1.14.0/src/Script.sol" ]]; then
    return 0
  fi

  echo "Installing forge-fhevm dependencies (forge soldeer)…"

  install_soldeer "$FORGE_FHEVM_DIR"
}

ensure_contract_deps() {
  if [[ ! -f contracts/foundry.toml ]]; then
    return 0
  fi

  if contract_deps_ready; then
    return 0
  fi

  echo "Installing contract dependencies (forge soldeer)…"

  if install_soldeer "$CONTRACTS_DIR"; then
    return 0
  fi

  echo "Warning: forge soldeer install failed — trying git fallback"

  if bootstrap_contract_deps_fallback; then
    return 0
  fi

  echo "Error: could not install contract dependencies"

  return 1
}

token_deployer_private_key() {
  echo "${TOKEN_DEPLOYER_PRIVATE_KEY:-$DEFAULT_TOKEN_DEPLOYER_KEY}"
}

expected_contract_address() {
  echo "${CONTRACT_ADDRESS:-$DEFAULT_CONTRACT_ADDRESS}"
}

contract_code_at() {
  local address="$1"
  cast code "$address" --rpc-url http://127.0.0.1:8545 2>/dev/null || echo "0x"
}

token_contracts_deployed() {
  local contract_address
  contract_address="$(expected_contract_address)"
  [[ "$(contract_code_at "$contract_address")" != "0x" ]]
}

deploy_token_contracts() {
  local deployer_key deployer_address nonce contract_address

  if token_contracts_deployed; then
    echo "Token contracts already deployed at $(expected_contract_address) — skipping forge deploy"

    return 0
  fi

  if [[ -z "${CONTRACT_ADDRESS:-}" || -z "${UNDERLYING_ADDRESS:-}" ]]; then
    echo "Error: CONTRACT_ADDRESS and UNDERLYING_ADDRESS must be set in .env (see .env.example)"

    return 1
  fi

  deployer_key="$(token_deployer_private_key)"
  deployer_address="$(cast wallet address --private-key "$deployer_key")"
  nonce="$(cast nonce "$deployer_address" --rpc-url http://127.0.0.1:8545)"

  if [[ "$nonce" != "0" ]]; then
    echo "Error: token deployer $deployer_address has nonce $nonce (expected 0)."
    echo "Restart Anvil or run the clean-slate steps in README Troubleshooting."

    return 1
  fi

  echo "Deploying confidential token to predefined addresses…"
  echo "  CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
  echo "  UNDERLYING_ADDRESS=$UNDERLYING_ADDRESS"

  (cd contracts &&
    forge script script/DeployConfidentialToken.s.sol \
      --rpc-url http://127.0.0.1:8545 \
      --broadcast \
      --private-key "$deployer_key")
}

echo "Starting Postgres…"
docker compose up -d postgres

echo "Waiting for Postgres…"
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations…"
pnpm db:migrate

ANVIL_FRESH_START=0

if command -v anvil >/dev/null 2>&1 && command -v forge >/dev/null 2>&1; then
  if ! curl -s http://127.0.0.1:8545 >/dev/null 2>&1; then
    echo "Starting Anvil in background…"
    anvil --chain-id 31337 > /tmp/zama-anvil.log 2>&1 &
    sleep 2
    ANVIL_FRESH_START=1
  else
    echo "Anvil already running on :8545"
  fi

  if ensure_forge_fhevm_host; then
    ensure_forge_fhevm_deps
  else
    echo "Skip fhEVM deploy — wrap/send/decrypt will not work without forge-fhevm"
  fi

  ensure_contract_deps

  if [[ -x "$FORGE_FHEVM_DIR/deploy-local.sh" ]]; then
    echo "Deploying fhEVM host stack…"
    (cd "$FORGE_FHEVM_DIR" && ./deploy-local.sh)
  fi

  deploy_token_contracts
  (cd apps/indexer && pnpm codegen)
else
  echo "Foundry not installed — skipping chain deploy (install: curl -L https://foundry.paradigm.xyz | bash)"
fi

free_dev_ports() {
  for port in 3000 9898; do
    lsof -ti ":$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
}

echo "Starting worker and API…"
free_dev_ports
pnpm dev:worker &
pnpm dev:api &

if [[ "${ANVIL_FRESH_START:-0}" == "1" ]]; then
  echo "Fresh Anvil — resetting Envio indexer state (envio dev -r)…"
  (cd apps/indexer && pnpm exec envio dev -r) &
else
  pnpm dev:indexer &
fi

wait
