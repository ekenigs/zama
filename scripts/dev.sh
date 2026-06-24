#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Starting Postgres…"
docker compose up -d postgres

echo "Waiting for Postgres…"
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations…"
pnpm db:migrate

if command -v anvil >/dev/null 2>&1 && command -v forge >/dev/null 2>&1; then
  if ! curl -s http://127.0.0.1:8545 >/dev/null 2>&1; then
    echo "Starting Anvil in background…"
    anvil --chain-id 31337 > /tmp/zama-anvil.log 2>&1 &
    sleep 2
  fi

  if [[ -d vendor/forge-fhevm ]]; then
    echo "Deploying fhEVM host stack…"
    (cd vendor/forge-fhevm && ./deploy-local.sh)
  else
    echo "Skip fhEVM deploy — clone forge-fhevm into vendor/forge-fhevm"
  fi

  echo "Deploying confidential token…"
  DEPLOY_LOG="$(cd contracts && forge script script/DeployConfidentialToken.s.sol --rpc-url http://127.0.0.1:8545 --broadcast)"
  echo "$DEPLOY_LOG"
  CONTRACT_ADDRESS="$(echo "$DEPLOY_LOG" | awk -F'= ' '/CONTRACT_ADDRESS=/ {print $2}' | tail -1)"

  if [[ -n "$CONTRACT_ADDRESS" ]]; then
    export CONTRACT_ADDRESS
    echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS"

    if [[ -f .env ]]; then
      if grep -q '^CONTRACT_ADDRESS=' .env; then
        sed -i.bak "s/^CONTRACT_ADDRESS=.*/CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
        rm -f .env.bak
      else
        echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> .env
      fi
    fi

    INDEXER_CONFIG="apps/indexer/config.yaml"
    sed -i.bak "s/0x0000000000000000000000000000000000000000/$CONTRACT_ADDRESS/" "$INDEXER_CONFIG"
    rm -f "${INDEXER_CONFIG}.bak"
    (cd apps/indexer && pnpm codegen)
  fi
else
  echo "Foundry not installed — skipping chain deploy (install: curl -L https://foundry.paradigm.xyz | bash)"
fi

echo "Starting worker and API…"
pnpm dev:worker &
pnpm dev:api &
pnpm dev:indexer &

wait
