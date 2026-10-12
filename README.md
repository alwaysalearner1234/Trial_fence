# TrialFence

Privacy-preserving **duplicate-enrollment gate** for multi-site clinical trials.

A participant cannot enroll in the same protocol at two participating sites without being detected — while
everything that touches the blockchain is **de-identified**. The site coordinator verifies physical ID
documents off-chain; public identity commitments and **Semaphore membership proofs** reach the chain. Names and raw document numbers do not. The issuer can link its keyed identifier digest to the issued commitment; protocol-scoped nullifiers do not identify that commitment by themselves.

```
  Volunteer                  Coordinator (issuer)                  Relayer                  Blockchain
 ┌──────────┐   commitment   ┌──────────────────┐  register     ┌───────────────┐ submit   ┌───────────────────┐
 │ Identity │───────────────►│ verify physical  │  protocol/site│               │ proof,   │  TrialFence.sol   │
 │ (secret) │  + group proof │ ID (HMAC dedupe) │  tx (owner)   │  pay gas, sign│ bind     │  SemaphoreGroups + │
 └────┬─────┘                └──────────────────┘               │  denials      ├─────────►│  nullifier registry│
      │   enroll(protocol,site)      (no PII anywhere)          └───────────────┘          └───────────────────┘
      └──────────────────────────────────────────────────────────────────────────────────►  public: scope,
                                                                                              nullifier, root
```

## Why this works

- **Membership is single ad-hoc group** (`GROUP_ID = 1`) on `TrialFence.sol` (inherits SemaphoreGroups).
  Only the issuer can `issueMembership` / `removeMembership`.
- **The proof binds three things** the smart contract independently verifies:
  - **scope** — `keccak256("TrialFence-Protocol-v1:" ‖ protocolId)` (mirrored in `server/src/scope.ts`,
    `web/src/lib/scope.ts`). If the proof was built for another protocol it is rejected on-chain.
  - **siteId** — the proof's `message`; a mismatch reverts with `TrialFence__SiteMismatch`.
  - **verifier** — the Groth16 proof must verify against the on-chain SemaphoreVerifier.
- **Duplicates are blocked by the nullifier.** The contract keeps `enrolled[protocolId][nullifier]`. The
  nullifier is derived from the identity secret *and* the scope, so the same person enrolling at a second
  site in the same protocol produces the identical nullifier → `TrialFence__DuplicateEnrollment`. Because
  it is scope-bound, the same person **can** legitimately take part in a different protocol, and the nullifiers alone
  do not link their enrollments across protocols. Timing and other side information are outside this cryptographic guarantee.
- **Stale roots expire.** A merkle root older than `MERKLE_TREE_DURATION` (1 hour, per sync window) is
  rejected. Revocation is not immediate: a proof against a recently superseded root can still succeed during that window.
- **No PII on-chain.** Only `scope`, `nullifier`, `siteId`, `root`, and the proof live in events. The
  issuer stores only **HMAC keyed-digests** of document numbers (never the numbers, never names) and adds
  the volunteer's `commitment` — which is a one-way hash.

## Repo layout

```
contracts/   Solidity + Hardhat (compile, tests, deploy scripts, deployments/)
server/      Two Express services
  src/issuer     PORT 4001 — physical ID verification, HMAC uniqueness check, group membership issuance
  src/relayer    PORT 4002 — protocol/site registry, /enroll (staticCall preflight, gas payment, signed denials)
  src/monitor    anomaly flags + optional LLM narrative for the sponsor view
web/         Next.js 15 app — Volunteer / Coordinator / Sponsor&IRB flows
scripts/e2e.mjs   full-stack smoke test (real proofs over HTTP → on-chain)
```

## Prerequisites

- Node.js ≥ 22 (tested on 24.x)
- npm ≥ 10

## Run it locally

```powershell
npm install                      # installs all three workspaces

# 1. Start a local chain (terminal 1)
npm run node -w contracts

# 2. Deploy (terminal 2) — writes contracts/deployments/localhost.json
npm run deploy:local -w contracts

# 3. Start the API services (terminal 2)
npm run issuer -w server         # 4001
npm run relayer -w server        # 4002

# 4. Start the app (terminal 3)
npm run web                      # http://localhost:3000
```

> Hold a key: proof artifacts are a few MB and proof generation is a second or two. The volunteer page
> downloads snark files on first proof generation.

## Render deployment (single service)

A free Render **Web Service** can run the whole demo in one container
(`scripts/render-start.mjs` boots the chain → deploys contracts → starts
issuer/relayer → serves the web app on `$PORT`). The Next.js app proxies
`/api/relayer/*` and `/api/issuer/*` to the internal ports, so no extra ports
need to be opened.

| Field | Value |
|---|---|
| Root directory | `/` |
| Runtime | Node 22 (`.nvmrc`) |
| Build command | `npm ci && npm run compile && npm run build -w web` |
| Start command | `npm run start:render` |

Env vars (dev values fine for a demo): `OWNER_PRIVATE_KEY`,
`ISSUER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `HMAC_SECRET`, optional
`ISSUER_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`. `PORT` is injected by
Render; `NEXT_PUBLIC_RELAYER_URL`/`NEXT_PUBLIC_ISSUER_URL` are optional since
the defaults point at the same-origin proxy.

> The chain and `server/data` sqlite are ephemeral (reset on each deploy).
> For a persistent deployment use a managed chain (e.g. Polygon Amoy,
> `npm run deploy:amoy`) plus a real database.

## Demo script (2 minutes)

Use the **Sponsor** tab to register protocol `1` ("TrialFence-01") and sites `1` and `2`.

1. **Volunteer tab** — your anonymous identity (commitment) is created in the browser and stored in
   `localStorage`. Copy the commitment. _You are not in the group yet_ — the button stays disabled.
2. **Coordinator tab** — the commitment auto-fills from the same browser. Enter a demo document number
   (e.g. `AB1234567`) + name and click *Verify ID & issue membership*. The registry dedupes on the
   document digest, so the *same* physical credential can only be registered once.
3. **Volunteer tab** — pick protocol `1` site `1`, click *Generate proof & submit*. → **accepted**, and
   the on-chain event/tx appears on the Sponsor audit table.
4. Go back and enroll again at **site 2** (same protocol). → **denied (DUPLICATE)**, with a signed,
   PII-free denial record on the Sponsor tab. The same protocol nullifier at two sites; no participant name in the audit records.
5. Register protocol `2` and enroll site `1`: **accepted again** — the same person may join a different
   protocol, and the cross-protocol nullifiers don't link.

Optional: `npm run test -w contracts` runs the 22 contract tests (real Groth16 proofs). `node scripts/e2e.mjs`
runs the smoke test end-to-end over HTTP.

## Configuration

Copy `.env.example` to `.env` (or rely on the defaults baked into `server/src/config.ts`). The default
dev keys are the well-known Hardhat test accounts. See `.env.example` for testnet (Polygon Amoy) and the
optional `OPENAI_API_KEY` used by the AI monitor.

## Threat model (what is / isn't protected)

- A **duplicate enrollment** by a verified member is detected deterministically (nullifier registry).
- Revocation prevents proofs against the current group; old-root proofs remain usable for the documented one-hour grace period, then expire.
- An unverified person cannot enroll (must be in the group).
- **What TrialFence does not prevent:** a coordinator fabricating a membership, a participant using two
  different physical credentials at two different sites, or a site running its own client. Those are
  operational/physical controls, handled outside this system.

## Production notes / TODOs

- Deploy to a public testnet (Amoy) using the documented env vars; then mainnet after an audit.
  `npm run deploy:amoy -w contracts` writes `contracts/deployments/amoy.json` (including
  `deploymentBlock`); point `DEPLOYMENT_FILE` at it and `RPC_URL` at an Amoy endpoint and the
  hosted stack uses it as-is — it never starts a local chain or deploys in that mode.
- **SQLite vs Postgres (issue #4 decision):** the demo persists issuer/relayer mirrors and
  denial records in SQLite (`DB_FILE`, default `server/data/trialfence.db`). For production, swap
  the `node:sqlite` driver in `server/src/db.ts` for `pg` — the schema (UNIQUE hmac/commitment/
  leaf_index, additive migrations), the keyed-HMAC digest scheme and the startup reconciliation
  from `MembershipIssued` events are backend-agnostic and carry over unchanged. Denial digests
  and signatures verify identically regardless of store.
- The relayer currently submits without fee tiers or rate limiting; add per-site quotas + nonce
  management before production.
- The issuer should sit behind mTLS / a VPN between sponsor sites (not open like the demo).
- Key custody: owner/issuer/relayer keys should live in a KMS (e.g. GCP KMS, AWS KMS) instead of env.
- Consider a second-layer gating flow: a signed membership *credential* issued to the volunteer so the
  coordinator never sees commitments either (currently coordinator sees the commitment by design).
- `openai` call is optional and disabled unless an API key is present.

## Reviewed repairs and acceptance gate (11 October 2026)

The authoritative submission is the three-page `TrialFence-TrialFence-INTL (1).docx`.
The longer `TrialFence-Phase1-Proposal.md` is earlier background material and includes
claims and a chronology that need reconciliation; it is not the submitted document.
See `docs/TEAM_HANDOFF_2026-10-11.md` for proposal alignment, remaining evidence,
and the testnet checklist. Preserve the original submission and repository history.

`npm run test:integration` starts an isolated local chain and temporary issuer
database, then checks genuine proofs, repeat issuance, concurrent requests, denial
signatures and RPC outages. Close other local services on ports 8545, 4001 and 4002
before running it. This is local evidence, not an Amoy deployment certificate.

Issuer authentication protects `POST /register`; public group reads stay usable
by proof-generating browsers. Enter the issuer token in the coordinator form when
required. A reverse proxy alone does not protect a public API. The owner-backed
site-registration API still needs sponsor authentication before public use.

Current denials are **relayer-signed**, not independently site-signed. SQLite is a
local prototype store, not the Postgres/site-account layer proposed for deployment.
Do not claim those proposal requirements are complete.

## Integration review, 12 October 2026

See `docs/PR10_REVIEW_2026-10-12.md`. PR #10 contains the original five frontend/proxy commits, while PR #9 adds the response fixes. The combined review preserves both and the newer backend work. Protocol registration is now owner-only. Enter the dedicated `RELAYER_API_KEY` in the sponsor page to register protocols/sites and `ISSUER_API_KEY` in the coordinator page to issue membership; wallet private keys stay server-side.

Run `npm ci`, `npm test`, `npx tsc --noEmit -p server/tsconfig.json`, `npm run build -w web` and then `npm run test:integration`. The integration runner uses a temporary database and verifies genuine Node-generated proofs through the production Next proxy. This is not evidence of browser proof generation or an Amoy deployment. Membership revocation reconciliation, lost-HMAC recovery, multiple issuer instances and persistent site account storage need further backend work.
