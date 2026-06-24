# Confidential ERC-7984 Indexer

Local fhEVM indexer + decrypt worker + partner read API for ERC-7984 confidential tokens.

## Prerequisites

- Node.js ≥ 24, pnpm 11
- Docker (Postgres 18) — OrbStack, Docker Desktop, or equivalent
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`anvil`, `forge`)
- [forge-fhevm](https://github.com/zama-ai/forge-fhevm) cloned to `vendor/forge-fhevm` for local FHE host deploy

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev:db          # starts Postgres 18 (databases: envio + zama)
pnpm db:migrate
pnpm dev             # migrations, optional Anvil deploy, worker, API, indexer
```

Without Foundry/Docker, run DB-level tests only after starting Postgres manually:

```bash
pnpm dev:db && pnpm db:migrate && pnpm test
```

Contract deploy (optional, requires Foundry + fhEVM):

```bash
cd contracts && forge soldeer install
forge script script/DeployConfidentialToken.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
# set CONTRACT_ADDRESS in .env and apps/indexer/config.yaml
```

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

## Architecture

See [DECISIONS.md](./DECISIONS.md) and [plans/confidential-indexer/plan.mdx](./plans/confidential-indexer/plan.mdx).
