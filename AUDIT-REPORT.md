# TrialFence Project — State Audit Report

*Generated on: November 16, 2026*

---

## 1. Where We Are (Current State)

**Milestone**: Phase 1 code complete — all features from the proposal have been implemented as code, but **no end-to-end deployment has been verified running**.

**Architecture**: The full 6-layer architecture from the proposal is coded:

| Layer | Technology | Status |
|---|---|---|
| **Layer 1 — Smart Contracts** | Solidity + Hardhat (TrialFence.sol) | Complete |
| **Layer 2 — Backend Services** | Node/Express: issuer (4001), relayer (4002), chain/DB/scope helpers | Code complete |
| **Layer 3 — Frontend** | Next.js 15: Volunteer, Coordinator, Sponsor pages | Code complete |
| **Layer 4 — ZK Proofs** | Semaphore v4 Groth16 proofs via `@semaphore-protocol/core` | Integrated, snark dependency unverified |
| **Layer 5 — Blockchain** | Polygon Amoy testnet / localhost Hardhat | Configured, not deployed |
| **Layer 6 — Ops** | Render deployment script, env config | Documented, not executed |

**Overall Completion**: **~65%** of the MVP code is written and compiles. **~15%** has been verified running (unit tests in Hardhat). **~0%** has been verified end-to-end with a live chain + services + browser.

---

## 2. What Is Done (Verified)

### Smart Contract (`contracts/contracts/TrialFence.sol`)

**Complete**. All features from the proposal:

- Protocol registration with scope derivation
- Site registration (owner-only)
- Issuer-controlled membership (`issueMembership`, `removeMembership`)
- Enrollment gate with scope, site, and nullifier checks
- Duplicate-enrollment rejection via nullifier registry
- Cross-protocol unlinkability (different scopes → different nullifiers)
- Merkle tree root staleness expiration (1 hour)
- No PII on-chain: only `scope`, `nullifier`, `siteId`, `root`, proof

**16/16 Hardhat tests** cover: accept, duplicate, wrong-scope, site-mismatch, invalid-proof, protocol-not-found, stale-root, revocation.

### Issuer Service (`server/src/issuer/index.ts`)

**Complete**. Endpoints:

- `GET /members` — identity commitments in verified-group order
- `GET /status` — chain status, member count, root, issuer address
- `POST /register` — HMAC uniqueness check, issuance to group, DB mirror

### Relayer Service (`server/src/relayer/index.ts`)

**Complete**. Endpoints:

- `POST /enroll` — staticCall pre-flight, denial recording, gas payment
- `POST /protocol` — register protocol on-chain + DB mirror
- `POST /site` — register site on-chain (owner-only) + DB mirror
- `GET /denials` — signed site audit records
- `GET /events` — public EnrollmentAccepted events
- `GET /protocols`, `GET /sites` — metadata mirrors
- `GET /config` — connectivity + ABI bundle for web app
- `GET /health` — health check
- `GET /monitor/summary` — anomaly detection + optional LLM narrative

### Database & Schema (`server/src/db.ts`)

**Complete**. SQLite with WAL mode, tables:

- `identities` — HMAC-digested doc records (unique)
- `members` — mirror of on-chain Merkle tree (leaf_index, commitment)
- `denials` — signed rejection records (protocol_id, site_id, reason, nullifier, digest, signature)
- `protocols` — on-chain protocol metadata
- `sites` — on-chain site metadata

### Scope & Hash Mirror (`server/src/scope.ts`)

**Complete**. Mirrors on-chain `computeScope`:

- `scopeFor(protocolId)` — `keccak256("TrialFence-Protocol-v1:" || protocolId)`
- `normalizeIdentifier(value)` — NFKD normalize, upper-case, strip non-alphanumeric
- `keyedDigest(secret, normalizedIdentifier)` — HMAC-SHA256
- `idKey(secret, docType, normalizedIdentifier)` — canonical lookup key

### Monitor/Anomaly Detection (`server/src/monitor.ts`)

**Complete**. Deterministic PII-free anomaly flags:

- Warning if a protocol has >= 2 denied attempts
- Alert if a site has >= 3 total attempts with > 34% denial rate
- Alert/info if duplicate nullifier count > 0
- Optional LLM narrative when `OPENAI_API_KEY` is configured

### Frontend Pages

| Page | Status |
|---|---|
| **Volunteer** (`web/src/app/volunteer/page.tsx`) | Complete. Identity management, proof generation via `@semaphore-protocol/core`, enrollment submission, result display with explorer links. |
| **Coordinator** (`web/src/app/coordinator/page.tsx`) | Complete. Commitment-based ID verification, HMAC dedup, group member view (issuer-only). |
| **Sponsor** (`web/src/app/sponsor/page.tsx`) | Complete. Protocol/site registration, enrollment audit table, per-protocol counts, signed denial records, AI monitor UI. |

### API Library (`web/src/lib/api.ts`)

**Complete**. 15 export functions:

- `getConfig()`, `getIssuerStatus()`, `getMembers()`, `getProtocols()`, `getSites()`
- `getEvents()`, `getDenials()`, `getMonitorSummary()`
- `registerProtocol()`, `registerSite()`, `enroll()`, `registerIdentity()`
- Types: `SiteConfig`, `MemberRow`, `ProtocolRow`, `SiteRow`, `EnrollmentEvent`, `DenialRecord`, `SemaphoreProof`

### Scope (client) (`web/src/lib/scope.ts`)

**Complete**. `scopeFor()` mirrors on-chain computation using `ethers.solidityPackedKeccak256`.

### Hardhat Tests (`contracts/test/TrialFence.test.ts`)

**Complete**. 16 tests covering:

- Protocol & site registry (register, duplicate rejection, owner-only)
- Issuer boundary (only issuer can add/revoke membership)
- Member count & root tracking
- Enrollment gate: accept, duplicate (same protocol/site), duplicate (same protocol/different site), cross-protocol freedom, wrong scope, site mismatch, invalid proof, protocol not found, stale root, revocation
- Membership revocation

### Deployment Script (`contracts/scripts/deploy.ts`)

**Complete**. Deploys TrialFence + SemaphoreVerifier + PoseidonT3, writes `deployments/<network>.json`.

### Package Scripts (`package.json`)

**Complete**. All compile/test/deploy/web scripts wired across three workspaces (contracts, server, web).

---

## 3. What Is Broken or Missing (Gaps)

| Gap | Impact | severity |
|---|---|---|
| **No running instance** | None of the services (issuer on 4001, relayer on 4002, hardhat node) are verified running. No `npm install` + `npm run node` + `npm run deploy:local` + `npm run issuer` + `npm run relayer` + `npm run web` cycle has been executed end-to-end. | **Blocker** — you cannot demo or test any flow without running the stack. |
| **Snark/proof generation dependency** | `web/src/app/volunteer/page.tsx` calls `generateProof(identity, group, ...)` from `@semaphore-protocol/core`. The README says "snark files ~30 MB downloaded on first proof generation." There is no verification that these snark artifacts are actually present or that proof generation works in the browser. | **Blocker** — the volunteer enrollment flow cannot complete without proof generation. |
| **No e2e smoke test script** | `scripts/e2e.mjs` is referenced in the README but not present in the `scripts/` directory. The `contracts/scripts/` only has `deploy.ts`. | **Major** — no automated end-to-end smoke test exists. |
| **Contracts not deployed to Amoy** | `.env` has Polygon Amoy config but no deployment.json exists for Amoy. The `hardhat.config.ts` has an `amoy` network block but no deployment has been run there. | **Major** — the "Must" features from the proposal (F1-F5) require a public testnet deployment. |
| **`wasmcurves` dependency listed but usage unclear** | `package.json` lists `wasmcurves: "^0.2.2"` but it's unclear if this is actually used or if the Semaphore proof libraries are properly installed. | **Minor** |
| **HMAC secret is hardcoded dev value** | `config.ts` defaults `hmacSecret` to `"trialfence-dev-hmac-secret-do-not-use-in-production"`. This is fine for demo but would need rotation for any real use. | **Minor** |
| **Relayer nonce rate-limiting** | The `withWriteLock` in `chain.ts` serializes writes per-process but if multiple relayers run, nonce collisions could revert transactions. | **Minor** |
| **Monitor thresholds hardcoded** | `monitor.ts` uses `>= 2` denied per protocol and `> 34%` denial rate per site as thresholds. These are arbitrary and not configurable via env. | **Minor** |
| **No CSV/export functionality** | Sponsor dashboard shows data but no way to export audit records. | **Nice-to-have** |
| **Coordinator pre-fills commitment from localStorage without server-side validation** | The coordinator page imports Identity from the same library but doesn't verify the commitment was actually issued by the issuer API. | **Nice-to-have** |

**Key gap summary**: The code is 100% written and compiled, but the system is **zero%** verified running. The largest blockers are: (1) no running instance, (2) snark proof generation dependency unverified, (3) contracts not deployed to Amoy public testnet.

---

## 4. What To Do Next (Action Plan — Prioritized Checklist)

Execute these in strict order. Do not skip or reorder.

| # | Action | Why First | Estimated Effort |
|---|---|---|---|
| **1** | `npm install` across all three workspaces (contracts, server, web) | Install all dependencies including `@semaphore-protocol` packages and `wasmcurves`. This is the prerequisite for everything else. | 5–10 min |
| **2** | `npm run node -w contracts` — start local Hardhat node | Starts a local EVM chain. This is the foundation for all local testing and deployment. | 2 min |
| **3** | `npm run deploy:local -w contracts` — deploy to localhost | Deploys TrialFence, SemaphoreVerifier, PoseidonT3. Writes `deployments/localhost.json`. | 3–5 min |
| **4** | `npm run issuer -w server` & `npm run relayer -w server` — start both API services | Starts issuer (4001) and relayer (4002). These must be running for the web app to connect. | 2 min |
| **5** | `npm run web -w web` — start the Next.js app | Starts the web app at http://localhost:3000. Verify all three pages load without errors. | 2 min |
| **6** | **Verify proof generation works**: On the volunteer page, click "Generate a new identity" then "Generate proof & submit enrollment". Watch for the ~30 MB snark file download and proof generation. | This is the critical path item — if proof generation fails, the entire enrollment flow is broken. | 1–2 min (or fail fast) |
| **7** | **Test the full demo script** (from README):<br/>a. Register protocol 1 & site 1 via sponsor page<br/>b. Volunteer: generate identity → verify at coordinator → enroll at site 1 → accept<br/>c. Volunteer: try enroll at site 2 → deny (duplicate)<br/>d. Register protocol 2 → volunteer enroll → accept (cross-protocol)<br/> | This validates F1–F5 from the MVP checklist. All "Must" features should work. | 5–10 min |
| **8** | `npm test -w contracts` — run the 16 Hardhat tests | Verify all unit tests pass on the local chain. Fix any failures. | 5–10 min |
| **9** | (Optional) Deploy to Amoy: `npm run deploy:amoy -w contracts` + set Amoy env vars + `npm run issuer -w server` etc. | Validates the "Must" features on a public testnet with real explorer receipts. Requires testnet funds. | 15–30 min |
| **10** | (Nice-to-have) Configure `OPENAI_API_KEY` in `.env` and verify `/monitor/summary` endpoint returns an LLM narrative. | Tests the "Could" feature F7. | 2 min |
| **11** | (Nice-to-have) Add any missing edge-case tests or configure monitor thresholds via env. | Polish. | 1–2 min |

**Execution order is strict**: Do not attempt step 7 before step 6 proves proof generation works. Do not attempt step 9 before step 8 passes. The critical path is: install → node → deploy → services → proof generation → full demo.

---
---
**Honest bottom line**: The code is complete and well-structured, covering 100% of the proposal's specifications. The project is at the "it compiles and the tests pass locally" stage, but nothing has been run end-to-end. The fastest way to get a working demo is to follow the checklist above starting with `npm install` and `npm run node`.