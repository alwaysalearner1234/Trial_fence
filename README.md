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

`package-lock.json` is committed, so `npm ci` works on CI and on Render.

### Render environment variables

The single-service demo works with **no environment variables**: leave `RPC_URL`
and `DEPLOYMENT_FILE` unset so `render-start.mjs` stays in local demo mode
(in-memory Hardhat chain, redeployed on every restart). `PORT` is injected by
Render.

| Variable | Required? | What it does / what to do if you set it |
|---|---|---|
| `OWNER_PRIVATE_KEY` | Optional | Key that deploys/owns the contract and signs protocol/site registration. In local demo mode `deploy.ts` deploys from this key (and funds it automatically via `hardhat_setBalance`). If you set it, use a key you control; the relayer logs the contract owner and the signer address at startup. |
| `ISSUER_PRIVATE_KEY` | Optional | Key that issues group memberships. In local demo mode the deploy script sets the contract issuer to this key's address (falling back to `ISSUER_ADDRESS`, then Hardhat #1), so issuance does not revert with `NotIssuer`. |
| `RELAYER_PRIVATE_KEY` | Optional | Key that submits enrollments and signs denial records. |
| `HMAC_SECRET` | Optional locally, **required** for a public network | Keyed HMAC digest for document numbers. Use a dedicated random value for any non-local deployment. |
| `ISSUER_API_KEY` | Optional | If set, `POST /register` requires `Authorization: Bearer <value>`. Enter the same value in the coordinator page's **Issuer Authorization Token** field. If you do not want auth, leave it unset. |
| `RELAYER_API_KEY` | Optional | If set, `POST /protocol` and `POST /site` require `Authorization: Bearer <value>`. Enter the same value in the sponsor page's **Sponsor / Registry Bearer Token** field. If you do not want auth, leave it unset. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional | Enables the optional LLM narrative in the sponsor integrity monitor. Rule-based flags work without it. |
| `EXPLORER_URL` | Optional | Adds block-explorer links to transaction hashes. |
| `NEXT_PUBLIC_RELAYER_URL`, `NEXT_PUBLIC_ISSUER_URL` | Optional | Default to the same-origin Next proxy; only set them if you split the services onto separate hosts. |
| `RPC_URL`, `DEPLOYMENT_FILE` | Optional | Leave unset for the single-service local demo. A non-loopback `RPC_URL` (or a non-`localhost.json` deployment file) switches `render-start.mjs` to hosted mode: it will **not** start a chain or deploy, and it exits if the deployment file is missing. |

> The chain and `server/data` sqlite are ephemeral (reset on each deploy).
> For a persistent deployment use a managed chain (e.g. Polygon Amoy,
> `npm run deploy:amoy`) plus a real database.

## Demo script (2 minutes)

Use the **Sponsor** tab to register protocol `1` ("TrialFence-01") and sites `1` and `2`.
If the server sets `RELAYER_API_KEY`, paste it into the sponsor page's registry-token field first.

1. **Volunteer tab** — your anonymous identity (commitment) is created in the browser and stored in
   `localStorage`. Copy the commitment. _You are not in the group yet_ — the button stays disabled.
2. **Coordinator tab** — the commitment auto-fills from the same browser. If the server sets
   `ISSUER_API_KEY`, paste it into the issuer-token field. Enter a demo document number
   (e.g. `AB1234567`) + name and click *Verify ID & issue group membership*. The registry dedupes on the
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

`ISSUER_API_KEY` and `RELAYER_API_KEY` are optional. When set, the issuer and
relayer log a startup warning and the corresponding UI field must contain the
token; local demo mode works with both unset.

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
- **Denials are relayer-signed audit records, not site attestations.** The signature proves
  the relayer produced the record and that it was not edited afterwards; it does not prove a
  site independently attested the decision. Site-controlled signing and site accounts are
  future work.
- The relayer currently submits without fee tiers or rate limiting; add per-site quotas + nonce
  management before production.
- The issuer should sit behind mTLS / a VPN between sponsor sites (not open like the demo).
- Key custody: owner/issuer/relayer keys should live in a KMS (e.g. GCP KMS, AWS KMS) instead of env.
- Consider a second-layer gating flow: a signed membership *credential* issued to the volunteer so the
  coordinator never sees commitments either (currently coordinator sees the commitment by design).
- `openai` call is optional and disabled unless an API key is present.

## Verification

Reproduce from the repository root:

```sh
npm ci                                      # clean install from the committed lockfile
npm test                                    # 22 contract tests, genuine Groth16 proofs
npx tsc --noEmit -p server/tsconfig.json
npm run build -w web
npm run test:integration                    # isolated chain + services + Next proxy
```

`npm run test:integration` boots a temporary Hardhat chain and a temporary database,
then checks genuine proofs, repeat issuance, concurrent requests, denial signatures
and RPC outages through the production Next proxy. Close other local services on
ports 8545, 4001 and 4002 first, and set `TEST_WEB_PORT` if 3000 is already taken.

What that evidence does and does not cover:

- It is **local** evidence — not an Amoy deployment certificate.
- The proofs in the integration run are generated by **Node**, not a browser.
  Genuine in-browser proof generation is a separate acceptance item; the demo flow
  that exercises it is scripted in `VIDEO-PLAN.md`.
- Issuer authentication protects `POST /register`; public group reads stay usable by
  proof-generating browsers. A reverse proxy alone does not protect a public API, so
  set `ISSUER_API_KEY` / `RELAYER_API_KEY` for anything reachable. Wallet private
  keys stay server-side.
- Denials are relayer-signed, and SQLite is a local prototype store — see Production
  notes above. Do not claim those proposal requirements are complete.
