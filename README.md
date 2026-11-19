# TrialFence

Privacy-preserving duplicate-enrollment gate for multi-site clinical trials.

One participant cannot enroll in the same protocol at two participating sites without
being detected — while everything that reaches the blockchain is de-identified. The
site coordinator verifies physical ID documents off-chain; only public identity
commitments and Semaphore membership proofs reach the chain. Names and raw document
numbers never do.

```
 Volunteer            Coordinator (issuer)         Relayer                    Blockchain
 ┌──────────┐  commitment  ┌────────────────┐ protocol/site  ┌────────────┐ proof,   ┌──────────────────┐
 │ Identity │─────────────►│ verify physical│ tx (owner)     │ pay gas,   │ bind     │ TrialFence.sol   │
 │ (secret) │  + group     │ ID (HMAC dedupe)│──────────────►│ sign       │─────────►│ SemaphoreGroups +│
 └────┬─────┘  proof       └────────────────┘                │ denials    │          │ nullifier registry│
      │  enroll(protocol, site)   (no PII anywhere)          └────────────┘          └──────────────────┘
      └─────────────────────────────────────────────────────────────────────────────►  public: scope,
                                                                                          nullifier, root
```

## How it works

- **One shared Semaphore group** (`GROUP_ID = 1`) on `TrialFence.sol`, which inherits
  `SemaphoreGroups`. Only the issuer can `issueMembership` / `removeMembership`.
- **The proof binds three things** the contract checks independently:
  - `scope` — `keccak256("TrialFence-Protocol-v1:" ‖ protocolId)`, mirrored in
    `server/src/scope.ts` and `web/src/lib/scope.ts`. A proof built for another
    protocol is rejected (`TrialFence__WrongScope`).
  - `siteId` — carried as the proof message; a mismatch reverts with
    `TrialFence__SiteMismatch`.
  - `verifier` — the Groth16 proof must verify against the on-chain `SemaphoreVerifier`.
- **Duplicates are blocked by the nullifier.** The contract stores
  `enrolled[protocolId][nullifier]`. The nullifier is derived from the identity secret
  and the scope, so re-enrolling in the same protocol at a second site produces the
  identical nullifier → `TrialFence__DuplicateEnrollment`. Across different protocols
  the nullifiers are unrelated, so a participant can join another protocol and the
  enrollments cannot be linked by the nullifier alone.
- **Stale roots expire.** A Merkle root older than `MERKLE_TREE_DURATION` (1 hour) is
  rejected. Revocation is therefore not instantaneous: a proof against a recently
  superseded root can still land during that window.
- **No PII on-chain.** Only `scope`, `nullifier`, `siteId`, `root` and the proof appear
  in events. The issuer stores only HMAC keyed-digests of document numbers (never the
  numbers, never names) plus the participant's one-way commitment.

## Repo layout

```
contracts/   Solidity + Hardhat — TrialFence.sol, tests, deploy scripts, deployments/
server/      Two Express services
  src/issuer    PORT 4001 — physical ID verification, HMAC uniqueness, membership issuance
  src/relayer   PORT 4002 — protocol/site registry, /enroll (preflight, gas, signed denials), monitor
web/         Next.js 15 app — Volunteer / Coordinator / Sponsor flows
scripts/     e2e.mjs (HTTP smoke test), test-stack.mjs (isolated integration runner), render-start.mjs
```

## Prerequisites

- Node.js ≥ 22 (tested on 24.x)
- npm ≥ 10

## Run it locally

```sh
npm ci                           # installs all three workspaces

# terminal 1 — local chain
npm run node -w contracts

# terminal 2 — deploy (writes contracts/deployments/localhost.json)
npm run deploy:local -w contracts

# terminal 2 — API services
npm run issuer -w server         # :4001
npm run relayer -w server        # :4002

# terminal 3 — the app
npm run web                      # http://localhost:3000
```

The Next.js app proxies `/api/issuer/*` and `/api/relayer/*` to the internal ports, so
the browser only ever talks to one origin. No `.env` is required for local use — the
defaults in `server/src/config.ts` point at the local Hardhat chain. Copy
`.env.example` to `.env` to override.

## Demo script (2 minutes)

1. **Sponsor tab** — register protocol `1` ("TrialFence-01") and sites `1` and `2`.
2. **Volunteer tab** — an anonymous identity (commitment) is created in the browser and
   stored in `localStorage`. Copy the commitment (the button stays disabled until the
   identity is in the group).
3. **Coordinator tab** — the commitment auto-fills. Enter a test document number and
   name, click **Verify ID & issue membership**. The registry dedupes on the document
   digest, so the same credential can only be registered once.
4. **Volunteer tab** — pick protocol 1, site 1, **Generate proof & submit** → accepted,
   with the on-chain event/tx on the Sponsor audit table.
5. Enroll again at **site 2**, same protocol → denied (`DUPLICATE`), with a signed,
   PII-free denial record.
6. Register **protocol 2** and enroll site 1 → accepted again (different protocol, and
   the nullifiers do not link the two enrollments).

## Testing

```sh
npm test                          # contract tests with real Groth16 proofs (22 passing)
npx tsc --noEmit -p server/tsconfig.json
npm run build -w web
npm run test:integration          # isolated chain + services + Next proxy end-to-end
```

`npm run test:integration` boots a temporary Hardhat chain, deploys, starts issuer and
relayer, runs `scripts/e2e.mjs` through the production Next proxy, and checks denial
tamper-evidence, concurrency and RPC-outage behaviour. It uses a temporary database and
well-known local test keys — keep other services off ports 8545/4001/4002. Set
`TEST_WEB_PORT` if 3000 is taken.

## Configuration

`.env.example` documents every variable. The important ones:

| Variable | Purpose |
|---|---|
| `RPC_URL` | chain endpoint (default `http://127.0.0.1:8545`) |
| `DEPLOYMENT_FILE` | deployment JSON the services read |
| `DB_FILE` | SQLite file (default `server/data/trialfence.db`) |
| `OWNER_PRIVATE_KEY` / `ISSUER_PRIVATE_KEY` / `RELAYER_PRIVATE_KEY` | service signers |
| `HMAC_SECRET` | keyed digest of document numbers |
| `ISSUER_API_KEY` | optional bearer token for `POST /register` (issuer) |
| `RELAYER_API_KEY` | optional bearer token for `POST /protocol` and `POST /site` (registry) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | optional LLM narrative for the monitor |

When `ISSUER_API_KEY` / `RELAYER_API_KEY` are unset the corresponding routes are open
(dev mode). Set them for anything reachable. `POST /enroll` and all GET routes stay
public — browsers need the public group to build proofs.

## Deploying (single Render web service)

`scripts/render-start.mjs` boots the chain, deploys, starts issuer and relayer, and
serves the web app on `$PORT`. Render settings:

| Field | Value |
|---|---|
| Root directory | `/` |
| Runtime | Node 22 (`.nvmrc`) |
| Build command | `npm ci && npm run compile && npm run build -w web` |
| Start command | `npm run start:render` |

In hosted mode (non-loopback `RPC_URL` or a non-localhost `DEPLOYMENT_FILE`) the
launcher never starts a local chain; it fails fast if the deployment file is missing.
The SQLite store is ephemeral on Render — for persistence, point `DB_FILE` at a volume
or swap the driver (see below).

## Threat model

- A duplicate enrollment by a verified member is detected deterministically (nullifier
  registry).
- Revocation prevents proofs against the current group; old-root proofs stay usable for
  the one-hour grace window, then expire.
- An unverified person cannot enroll (they must be in the group).

**Not prevented:** a coordinator fabricating a membership, a participant using two
different physical credentials at two sites, or a site running its own client. Those are
operational/physical controls outside this system.

## Production notes / TODO

- Deploy to a public testnet (`npm run deploy:amoy -w contracts`, then point
  `DEPLOYMENT_FILE` and `RPC_URL` at it) after an audit.
- Denials are **relayer-signed**, not site-signed. That is a deliberate prototype
  simplification; site-controlled signatures are future work.
- SQLite is a prototype store. For production, swap the `node:sqlite` driver in
  `server/src/db.ts` for `pg` — the schema, keyed-HMAC scheme and startup reconciliation
  are backend-agnostic.
- The relayer submits without fee tiers or rate limiting; add per-site quotas and nonce
  management. The issuer should sit behind mTLS/VPN between sponsor sites.
- Key custody: owner/issuer/relayer keys should live in a KMS instead of env.
- The `OPENAI_API_KEY` narrative is optional and disabled when unset.
