# TrialFence

Privacy-preserving **duplicate-enrollment gate** for multi-site clinical trials.

A participant cannot enroll in the same protocol at two participating sites without being detected — while
everything that touches the blockchain is **de-identified**. The site coordinator verifies physical ID
documents off-chain; only an unlinkable **Semaphore zk-proof** ever reaches the chain.

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
- **Duplicates are blocked by the nullifier.** The contract keeps `enrolled[scope][nullifier]`. The
  nullifier is derived from the identity secret *and* the scope, so the same person enrolling at a second
  site in the same protocol produces the identical nullifier → `TrialFence__DuplicateEnrollment`. Because
  it is scope-bound, the same person **can** legitimately take part in a different protocol, and no site
  can link their two enrollments (different nullifiers, different proofs).
- **Stale roots expire.** A merkle root older than `MERKLE_TREE_DURATION` (1 hour, per sync window) is
  rejected, so a revoked member cannot reuse an old proof.
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

- Node.js ≥ 20 (tested on 24.x)
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
   PII-free denial record on the Sponsor tab. Two nullifiers on two sites, no name anywhere.
5. Register protocol `2` and enroll site `1`: **accepted again** — the same person may join a different
   protocol, and the cross-protocol nullifiers don't link.

Optional: `npm run test` runs the 16 contract tests (real Groth16 proofs). `node scripts/e2e.mjs`
runs the smoke test end-to-end over HTTP.

## Configuration

Copy `.env.example` to `.env` (or rely on the defaults baked into `server/src/config.ts`). The default
dev keys are the well-known Hardhat test accounts. See `.env.example` for testnet (Polygon Amoy) and the
optional `OPENAI_API_KEY` used by the AI monitor.

## Threat model (what is / isn't protected)

- A **duplicate enrollment** by a verified member is detected deterministically (nullifier registry).
- A revoked member cannot re-enroll with old proofs (merkle-root expiration) and cannot re-enroll after
  removal (not in any current root).
- An unverified person cannot enroll (must be in the group).
- **What TrialFence does not prevent:** a coordinator fabricating a membership, a participant using two
  different physical credentials at two different sites, or a site running its own client. Those are
  operational/physical controls, handled outside this system.

## Production notes / TODOs

- Deploy to a public testnet (Amoy) using the documented env vars; then mainnet after an audit.
- The relayer currently submits without fee tiers or rate limiting; add per-site quotas + nonce
  management before production.
- The issuer should sit behind mTLS / a VPN between sponsor sites (not open like the demo).
- Key custody: owner/issuer/relayer keys should live in a KMS (e.g. GCP KMS, AWS KMS) instead of env.
- Consider a second-layer gating flow: a signed membership *credential* issued to the volunteer so the
  coordinator never sees commitments either (currently coordinator sees the commitment by design).
- `openai` call is optional and disabled unless an API key is present.