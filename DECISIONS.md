# DECISIONS.md

Engineering decisions for the confidential ERC-7984 indexer. Each implementation step appends dated entries here — this file is the submission artifact, not a changelog of the planning chat.

## How to use this file

- Record a decision when it is **made**, not when it is merely proposed.
- Format: **Decision**, **Context**, **Choice**, **Alternatives considered**, **Consequences**.
- Link to the plan step (`plans/confidential-indexer/steps/...`) when the decision was made during that step.

---

## Planned decisions (to be resolved during implementation)

The master plan recommends the following; each will be confirmed or revised as we implement.

| Topic | Proposed choice | Step |
| --- | --- | --- |
| Monorepo layout | `apps/` (api, indexer, worker) + `packages/` (db, decrypt) | step-0 |
| Chain environment | Local **forge-fhevm** + Anvil (chain id 31337) for dev/test; Sepolia deferred | step-0 |
| Indexing library | **Envio HyperIndex v3** — ingest only, no SDK in handlers | step-3 |
| Partner database | **Postgres 18**, database `zama` on shared server + **Drizzle ORM** | step-2 |
| Envio internal DB | Same **Postgres 18** server, database `envio` (via `ENVIO_PG_*`) | step-2 |
| Decryption (v1) | **`apps/worker`** poll loop + `packages/decrypt` | step-4 |
| Decryption (production) | **Event-driven** — trigger decrypt on ingest, not poll | future |
| HTTP server | **Fastify** in `apps/api` (`/v1/...`) | step-5 |
| SDK | `@zama-fhe/sdk@alpha` (prerelease docs) | step-4 |
| Undecryptable events | Persist with `amountStatus: pending_decryption`; never drop | step-3 |
| ACL backfill | Worker re-polls pending rows when delegation arrives | step-4 |
| Test ERC-7984 token | **OpenZeppelin `openzeppelin-confidential-contracts`** (`ERC7984ERC20Wrapper`) | step-1 |
| v1 scope | **Full scope** — all events, balances table, worker backfill, tests | plan review |

---

## Decision log

### 2026-06-23 — Decryption trigger: poll worker for v1, event-driven in production (plan review)

**Decision:** Run decryption in a separate Node.js `apps/worker` process using a simple database poll loop for v1. In production, move to event-driven decryption triggered at ingest time.

**Context:** Envio handlers must stay fast — network-bound Zama SDK KMS calls cannot block indexing. We need a clear separation between ingest (write `pending_decryption` rows) and decrypt (upgrade to cleartext). For a take-home submission, operational simplicity and crash-safe retry matter more than sub-second decrypt latency.

**Choice (v1):** `apps/worker` polls Postgres every ~2 s for rows with `amount_status = pending_decryption` (batch LIMIT 50), calls `packages/decrypt.tryDecrypt`, updates cleartext, refreshes balances. Same loop handles ACL backfill when delegation arrives later. Configurable via `WORKER_POLL_INTERVAL_MS` and `WORKER_BATCH_SIZE`.

**Choice (production target):** Event-driven decryption — enqueue a decrypt job when the indexer inserts a pending row (e.g. Postgres `LISTEN/NOTIFY`, a message queue, or an outbox table consumed by a worker). Decrypt runs immediately on ingest instead of waiting for the next poll. The worker process can remain, but it reacts to events rather than scanning on a timer.

**Alternatives considered:** Inline decrypt in Envio Effect API (blocks throughput, replay risk); decrypt loop inside `apps/api` (couples read and write paths); manual CLI backfill only (no automatic ACL retry).

**Consequences:** Partners may see `pending_decryption` for up to one poll interval (~2 s) after ingest — surfaced via `/v1/indexer/status` `pendingDecryptions`. v1 code stays small and testable; production path is documented here so the submission does not over-engineer queuing prematurely.

### 2026-06-23 — v1 scope (plan review)

**Decision:** Ship full scope as planned; no deferrals.

**Context:** Plan offered optional cuts (unwrap events only, no balances table, manual backfill CLI) to reduce step 1–6 work.

**Choice:** Implement all four event types, `balances` via `balanceOf`, `apps/worker` ACL backfill, and full E2E test suite across steps 0–7.

**Alternatives considered:** Defer unwrap events; compute balance from transfer sums only; ship manual backfill before worker loop.

**Consequences:** Step 1 fixtures cover wrap + unwrap paths; step 3 indexes all OZ events; no scope shortcuts in submission.

### 2026-06-23 — Test token package (plan review)

**Decision:** Use OpenZeppelin `openzeppelin-confidential-contracts` for the local ERC-7984 test token.

**Context:** Need a wrapper contract on local fhEVM that emits spec-aligned events (`ConfidentialTransfer`, `Wrap`, `Unwrap*`) for indexer fixtures.

**Choice:** Vendor `ERC7984ERC20Wrapper` from OpenZeppelin confidential contracts as a Foundry git dependency.

**Alternatives considered:** Zama `fhevm-foundry-template` (minimal, would need extension); contract from `zama-ai/sdk` examples (SDK-coupled, maturity unknown).

### 2026-06-23 — Monorepo layout and Postgres topology (step 0)

**Decision:** `apps/*` + `packages/*` workspace; one Postgres 18 container with databases `envio` and `zama`.

**Context:** Need clean pnpm boundaries between runnable services (api, indexer, worker) and shared libraries (db, decrypt).

**Choice:** `pnpm-workspace.yaml` globs `apps/*` and `packages/*`. Docker `init.sql` creates both databases on first boot. Partner data lives in `zama`; Envio sync tables in `envio`.

**Alternatives considered:** Flat `src/api` + `indexer/` at root (awkward tsconfig); PGlite (rejected — need real Postgres for Envio + Drizzle parity).

**Consequences:** `DATABASE_URL` points at `zama`; `ENVIO_PG_*` points at `envio`. Migrations run only against `zama`.

### 2026-06-23 — Envio ingest writes partner Postgres directly (step 3)

**Decision:** Envio handlers call `@zama-indexer/db` query helpers; no Zama SDK in handlers.

**Context:** Indexing must stay fast and replay-safe. Decryption is network-bound.

**Choice:** `apps/indexer/src/handlers/confidential-token.ts` inserts `pending_decryption` rows (or `decrypted` for `UnwrapFinalized` cleartext). `from == 0x0` classified as `kind: wrap` (OZ has no `Wrap` event).

**Alternatives considered:** Envio GraphQL entities only (would duplicate schema); inline decrypt in handlers (blocks throughput).

**Consequences:** Handler file is a manual fallow entry point. Envio `schema.graphql` is minimal stub — partner tables are Drizzle-owned.

### 2026-06-23 — Zama SDK decrypt path (step 4)

**Decision:** `packages/decrypt` wraps `@zama-fhe/sdk@3.1.1-alpha.3` with viem clients and `cleartext()` relayer for local Anvil.

**Context:** Alpha SDK API surface differs from stable docs; need server-side decrypt without browser.

**Choice:** `sdk.decryption.decryptValues()` on transfer handles; `token.balanceOf()` for balance refresh. Worker polls pending rows.

**Alternatives considered:** `decryptHandle` (not exposed on current alpha build); KMS HTTP calls directly (too low-level).

**Consequences:** Full fhEVM ACL/delegation flow not fully exercised in CI without `forge-fhevm` + deployed contract — see reflection below.

---

## Reflection (submission)

### Least confident piece

End-to-end decrypt against a live fhEVM host. The worker and SDK wiring are in place, but verifying `decryptValues` + ACL delegation requires Foundry, `vendor/forge-fhevm`, and a deployed OZ wrapper on Anvil — not runnable in this environment without Docker + Foundry installed. The E2E tests validate API/DB contract with seeded rows instead of a full chain loop.

### What was cut or deferred

- **Sepolia / testnet** — local Anvil only.
- **Event-driven decrypt queue** — v1 uses poll loop (documented above).
- **REST authentication** — open `/v1/*` for local dev.
- **Full chain E2E in CI** — DB-level E2E only; chain fixtures documented in README.
- **Hasura / Envio TUI** — disabled via `ENVIO_HASURA=false`.

### SDK feedback (`@zama-fhe/sdk@alpha`)

- **Positive:** Viem `createConfig` with `cleartext()` relayer is straightforward for local Anvil.
- **Friction:** Prerelease blocked by pnpm `minimumReleaseAge` — needed an exclude entry.
- **Friction:** API naming drift (`decryptValues` vs docs mentioning `userDecrypt` / `decryptHandle`) — had to read generated `.d.ts` files.
- **Missing:** A minimal "indexer EOA decrypt transfer amount" recipe in repo examples without browser wallet flow.

### AI assistance

Planning and scaffolding were pair-programmed with Cursor (visual plan → approved MDX → incremental implementation). AI generated initial monorepo layout, Drizzle schema, Envio handlers, worker loop, and API routes. Human decisions (Postgres over PGlite, `apps/worker` poll model, OZ token choice) were captured in `DECISIONS.md` during review. AI fixed TypeScript strict env access, fallow entry points, and handler deduplication in a follow-up pass.

