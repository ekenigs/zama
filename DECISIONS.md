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

**Consequences:** Step 1 adds OZ as `forge install` dependency; `apps/indexer/config.yaml` event list follows OZ ABI exactly.
