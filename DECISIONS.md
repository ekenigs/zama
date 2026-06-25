# Decisions

Important choices for this project.

## Local chain instead of Sepolia

Run everything on local Anvil + forge-fhevm (chain id 31337), not Sepolia.

Local setup gives more flexibility and is easier to test end-to-end. A similar stack could run in CI if this were a real product. For a coding challenge, Sepolia might have been simpler.

The cost is complexity. `scripts/dev.sh` orchestrates Foundry, Postgres, the indexer, worker, and API. It works but is heavy and sometimes flaky.

## No CI, limited tests

No GitHub Actions or automated chain tests.

Chain E2E needs Foundry, fhEVM, Docker, and several processes. Setting that up in CI is a lot of work for a take-home. The full flow is checked manually (`pnpm fund`, `pnpm send`, `pnpm grant`).

Test coverage is thin on purpose, to save time. The only automated test is `tests/e2e/api.test.ts`, which hits the API against seeded DB rows. There are no unit tests. There is no automated test for the chain flow (indexer ingest, decrypt, ACL grant, backfill).

## Index first, decrypt in the worker

The indexer only ingests chain events. Decryption runs in a separate worker.

Envio handlers write to the `zama` database. No Zama SDK in handlers. Indexing must stay fast and must not block on KMS calls.

Undecryptable amounts are stored as `pending_decryption`, never dropped. `UnwrapFinalized` cleartext is stored as decrypted on ingest.

Transfers from `0x0` are classified as wrap (OpenZeppelin has no separate `Wrap` event).

`apps/worker` polls Postgres every ~2 s for `pending_decryption` rows and calls `packages/decrypt`. Same loop retries when ACL delegation arrives later.

Production would trigger decrypt on ingest (queue, `LISTEN/NOTIFY`, or outbox) instead of polling.

For normal transfers (Alice → Bob), the indexer is not a party to the transaction. The sender must run `pnpm grant` so the worker can decrypt the amount. Wrap and burn skip this because the indexer can decrypt those directly.

## Monorepo layout

Split runnable services from shared libraries: `apps/` (api, indexer, worker) and `packages/` (db, decrypt). pnpm workspace, no Turborepo.

Three processes share db and decrypt code but run independently (different entry points, different toolchains). Envio owns the indexer lifecycle; the API and worker are plain Node apps. Giving each its own `package.json` makes that split obvious and lets pnpm start or typecheck one service at a time (`pnpm --filter @zama-indexer/api dev`).

Skipped Turborepo. The repo is small (three apps, two shared packages) and this is a coding challenge. pnpm workspaces and `scripts/dev.sh` are enough. A task runner would add config and learning cost for little gain here.

A `shared/` folder with direct imports would also work here and could mean less config (one tsconfig, path aliases, no workspace packages). I went with `apps/` + `packages/` because it matches a common multi-service repo shape and encodes dependencies in `package.json` (e.g. indexer imports `db` but not `decrypt`). For a challenge this size, that is mostly convention, not a hard technical need.

## Postgres in Docker (one container, two databases)

First idea was PGlite. It is simple but in-memory, and several processes need the same data (API, worker, indexer, Envio). PGlite was not a fit for that.

Envio also requires Postgres for its sync tables. So the app needs real Postgres too, for transfers and balances in `zama` (Drizzle).

The AI agent suggested two Postgres instances in Docker: one for our app, one for Envio. I picked a simpler setup: one Postgres 18 container, two databases (`zama` and `envio`, created in `docker/postgres/init.sql`). Less to run locally. Migrations apply only to `zama`.

## Test token: OpenZeppelin confidential contracts

Use OpenZeppelin `ERC7984ERC20Wrapper` from `openzeppelin-confidential-contracts` as the local test token.

The indexer needs a contract that emits the right ERC-7984 events (`ConfidentialTransfer`, unwrap events, etc.). The OZ wrapper already does that. Writing a custom wrapper or starting from Zama's minimal Foundry template would mean more Solidity work for little gain in a TypeScript-focused challenge.

## Local dev addresses

Hardcode `CONTRACT_ADDRESS` and `UNDERLYING_ADDRESS` in `.env` and `apps/indexer/config.yaml`. Deploy with Anvil account #8 so CREATE nonces land on those same addresses every time.

Main reason: keep testing simple. Scripts, README examples, and manual checks always use the same known addresses. No looking up what got deployed last run.

That also avoids rewriting config on every `pnpm dev`. Envio watches a fixed contract address in `config.yaml`. Fund scripts read a fixed underlying token from `.env`. If addresses changed on each deploy, those files would drift and the indexer would need restarts more often. Trade-off: after a wipe/redeploy, restart Envio if ingest lags.

# Reflection

## Least confident under partner load

The worker decrypt loop in `apps/worker/src/loop.ts`.

It processes pending rows one at a time. After each decrypt it also refreshes both balances on chain. A burst of transfers would fill the queue faster than the worker clears it. Partners would see amounts stuck as `pending_decryption`.

Rows that fail with `acl_denied` get retried every poll with no pause. That adds load without helping until someone runs `pnpm grant`.

The read API is not my main worry. Those routes are simple DB reads. The worker is the bottleneck.

**How to prove it:** Run many transfers in a row. Watch `pendingDecryptions` on `/v1/indexer/status` and how long rows stay pending in the DB.

**Likely fix:** Move from a poll loop to a job queue. Decrypt with a small concurrency limit. Back off on `acl_denied`. Refresh balances less often instead of after every row.

## What I cut, and four more hours

**Cut or deferred:**

- Sepolia / public testnet
- CI and automated chain E2E (manual `fund` / `send` / `grant` flow instead)
- Unit tests (only `tests/e2e/api.test.ts` against seeded DB rows)
- Event-driven decrypt queue (poll loop only)
- REST auth on `/v1/*`
- Polishing `scripts/dev.sh` and Envio/Anvil restart ergonomics

**With four more hours:**

1. Add one automated chain test: `fund`, `send`, `grant`, then check the API shows a decrypted transfer. That covers the main loop end to end.
2. If time left: improve the worker (parallel decrypt, backoff on `acl_denied`).

## SDK feedback (`@zama-fhe/sdk`)

Version: `3.1.1-alpha.3`. I checked the [v3 migration guide](https://docs.zama.org/protocol/sdk/alpha/migration/migrate-v2-to-v3) and alpha docs. Local setup (`createConfig`, `cleartext()`), `createToken` vs `createWrappedToken`, and `delegateDecryption` are already documented. We should have started there.

Three things I would still ask for, in priority order:

1. A Node guide for indexers that decrypt **transfer event handles**. Migration mentions building your own indexer with `decryptValues`, and the delegated decryption guide covers `decryptBalanceAs` for balances. We needed `decryptValues` for wrap/burn and `delegations.delegateDecryption` + `decryption.delegatedDecryptValues` when Alice sends to Bob. That full path is not written down anywhere I found.

2. A server-side example for `sdk.decryption.decryptValues` and `sdk.decryption.delegatedDecryptValues`. The encrypt/decrypt guide is React-first (`useDecryptValues`). Our worker calls the decryption namespace directly. The APIs work, but we found them by reading types, not docs.

3. Clearer docs on ACL denial via `null`. When delegation is missing, `decryptValues` and `delegatedDecryptValues` usually resolve with `null` for the handle instead of throwing `DecryptionFailedError` or another typed error. We map that to `acl_denied` in `try-decrypt.ts`.

## AI assistance

I used Cursor for planning, scaffolding, and incremental implementation.

**Process:** First I set up guardrails: strict TypeScript, Biome, and fallow. Then I added Cursor rules and skills. Only after that did I start with visual plans, approve them as MDX, and build step by step (monorepo layout, Drizzle schema, Envio handlers, worker loop, API routes, local E2E scripts). Having those checks in place before implementation helped a lot. The AI still drafted most of the boilerplate, but lint, typecheck, test, and fallow caught bad output early. I chose stack decisions (Postgres over PGlite, poll worker, OpenZeppelin token).

**Where the agent got it wrong:** There were quite a few issues, not all subtle.

Architecture: an early suggestion was two Postgres Docker containers (one for our app, one for Envio). I kept one container with two databases instead.

Code style: by default the agent wrote outdated or unnecessary code. It used `new Promise` + `setTimeout` for delays instead of `node:timers/promises`. I added a Cursor rule for that (see [timers-promises rule](ed0f0974-97b9-4407-82b5-5e68faf33e2f) and `.cursor/rules/timers-promises.mdc`).

Unnecessary abstractions: it added `scripts/lib/sdk.ts` with a `Map` caching SDK instances by private key. For this project that was pointless; we call `createSdk` from `packages/decrypt` directly. It also wrote custom helpers (e.g. decimal-to-wei conversion) instead of using viem's `parseUnits`, which we use in `fund.ts` and `send.ts` now.

Bootstrap: early plans rewrote contract addresses on every `pnpm dev`. I moved to fixed CREATE addresses so testing stays predictable.