# Confidential ERC-7984 Indexer

Local fhEVM indexer + decrypt worker + partner read API for ERC-7984 confidential tokens.

## Prerequisites

- Node.js ≥ 24, pnpm 11
- Docker (Postgres 18) — OrbStack, Docker Desktop, or equivalent
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`anvil`, `forge`, `git`)
- Network access on first `pnpm dev` — auto-clones [forge-fhevm](https://github.com/zama-ai/forge-fhevm) to `vendor/forge-fhevm` and installs contract deps via `scripts/install-contract-deps.sh` (git + pinned zips, no soldeer)

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev:db
pnpm db:migrate
pnpm dev             # migrations, Anvil deploy, worker, API, indexer
```

Without Foundry/Docker, run DB-level tests only after starting Postgres manually:

```bash
pnpm dev:db && pnpm db:migrate && pnpm test
```

## Chain E2E flow (manual)

Test addresses (Anvil default mnemonic):

| Role | Account | Address |
|------|---------|---------|
| Indexer / worker | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Token deployer | #8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` |
| Alice (sender) | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Bob (recipient) | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

`CONTRACT_ADDRESS` and `UNDERLYING_ADDRESS` in `.env` (and the same wrapper address in `apps/indexer/config.yaml`) are **fixed** for local dev. `pnpm dev` deploys to those CREATE addresses using account #8 on a fresh Anvil; it does not rewrite config files.

With `pnpm dev` running:

```bash
pnpm fund --address 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --amount 10
pnpm fund --address 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --amount 10

# 1 — transfer (indexer is neither party)
pnpm send --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --to 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --amount 1

# 2 — worker logs acl_denied until grant
curl localhost:3000/v1/indexer/status
curl "localhost:3000/v1/addresses/0x90F79bf6EB2c4f870365E785982E1f101E93b906/transfers?direction=in"

# 3 — Alice delegates decrypt to indexer
pnpm grant --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

# 4 — worker backfill decrypts pending row

# 5 — repeat transfer
pnpm send --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --to 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --amount 1 --wait
```

## CLI scripts

| Command | Purpose |
|---------|---------|
| `pnpm fund --address <addr> --amount <decimal>` | Mint underlying ERC-20 + shield to confidential balance |
| `pnpm send --from <A> --to <B> --amount <decimal>` | Confidential transfer (decimal, not wei) |
| `pnpm grant --from <sender>` | ACL delegation from sender to indexer EOA |

## Services

| Service | Path | Port |
|---------|------|------|
| Read API | `apps/api` | 3000 |
| Decrypt worker | `apps/worker` | — |
| Envio indexer | `apps/indexer` | — |
| Postgres | docker `postgres:18` | 5432 (`envio` + `zama` DBs) |

## API

- `GET /v1/indexer/status`
- `GET /v1/addresses/:address/balance`
- `GET /v1/addresses/:address/transfers`

## Tests

```bash
pnpm dev:db && pnpm db:migrate
pnpm test
pnpm lint && pnpm typecheck && pnpm fallow
```

## Troubleshooting

### Clean slate (like a fresh clone)

```bash
# stop services
pkill -f "anvil --chain-id" 2>/dev/null || true
pkill -f "envio dev" 2>/dev/null || true
docker compose down -v

# remove artifacts created by pnpm dev
rm -rf vendor contracts/dependencies contracts/cache contracts/broadcast

cp .env.example .env   # if you need a fresh .env
pnpm install
pnpm dev
```

### Contract / forge-fhevm dependencies

`pnpm dev` runs `scripts/install-contract-deps.sh` and `scripts/install-forge-fhevm-deps.sh` (git clones + pinned Soldeer S3 zips). No `forge soldeer` required.

Manual reinstall:

```bash
pnpm contracts:deps
bash scripts/install-forge-fhevm-deps.sh   # after vendor/forge-fhevm exists; inits git submodules + remappings
```

### `forge soldeer install` fails (corrupt zip / `Could not find EOCD`)

This project no longer uses `forge soldeer` for local dev. If you still run it manually, remove broken zips and use the scripts above instead:

```bash
rm -rf contracts/dependencies contracts/cache
pnpm contracts:deps
```

### Token deploy fails (`CONTRACT_ADDRESS mismatch` / deployer nonce)

Contracts deploy to the addresses in `.env` via Anvil account **#8** (`TOKEN_DEPLOYER_PRIVATE_KEY`) at CREATE nonces 0 and 1. If that account already sent transactions on the running Anvil, addresses will not match — restart Anvil or run the clean-slate steps below. `dev.sh` skips deploy when bytecode already exists at `CONTRACT_ADDRESS`.

### Envio indexer lags behind Anvil

On local Anvil, Envio realtime sync can stall (`indexed_block` behind chain tip). Restart the indexer process started by `pnpm dev`, or run `envio dev` again in `apps/indexer`. After wiping Anvil and redeploying, restart Envio if ingest stops.

### `pnpm fund` / `pnpm send` errors after redeploy

Ensure `.env` still has the canonical `CONTRACT_ADDRESS` / `UNDERLYING_ADDRESS` from `.env.example`. Restart `pnpm dev` (or at least worker + API + indexer) after a clean redeploy. If `shield` fails once, retry `pnpm fund`.

## Architecture

See [DECISIONS.md](./DECISIONS.md) and [plans/local-e2e-scripts/plan.mdx](./plans/local-e2e-scripts/plan.mdx).
