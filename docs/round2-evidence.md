# Round 2 evidence log (tracker: issue #1)

This file records code provenance, commit dates, baselines and per-task
evidence for the TrialFence round-2 review. History is NOT rewritten to satisfy
the coding window — actual dates are recorded below (issue #2).

## Code provenance (no history rewrite)

All dates are author dates in +0530 (Pakistan time, UTC+5).

| Commit | Date (+0530) | Subject |
|---|---|---|
| `e255a12` | 2026-10-08 11:44 | TrialFence: zk duplicate-enrollment gate (initial scaffold) |
| `2815015` | 2026-10-08 11:50 | fix(sponsor): normalize protocol/site ids to strings |
| `096f331` | 2026-10-08 12:12 | Render single-service deploy (proxies + start script) |
| `f188fb6` | 2026-10-08 12:13 | README Render deploy section |
| `a71519d` | 2026-10-08 12:13 | `.env.example` proxy defaults |
| `0b1a491` | 2026-10-08 14:40 | fix(build): vendor browser bundles |
| `fix/round2-issues` head | 2026-10-11 | issues #4–#8 fixes (this branch) |

Coding-window note (issue #2): the published window is 10 Oct 08:00 – 11 Oct
08:00 PKT. The commits dated 8 Oct predate it. They are recorded as-is; written
organizer clarification on existing code / permitted preparation is still
required from the team (external action — cannot be produced in-repo). The
review baseline `0b1a491` and the round-2 work on `fix/round2-issues`
(2026-10-11, inside the window) are the eligible build baselines.

## Environment used for verification

- Node v22 (`.nvmrc`), npm workspaces, clean `npm ci` + `node scripts/fix-zk-deps.mjs`
- Local Hardhat automining chain (chainId 31337), fresh `server/data` per run
- `contracts/deployments/localhost.json` regenerated per run (includes `deploymentBlock`)

## Per-task status and evidence

### #3 — Fix frontend and API response mismatches (P0)
Covered by draft PR #10 (`fix/api-ui-2` → `main`), which solves #3.
Not touched by this branch.

### #5 — Require registered sites and verify revocation (P1) — code complete
- `TrialFence.enroll` now reverts `TrialFence__SiteNotFound(siteId)` for
  unregistered sites, checked before scope/message/nullifier/proof.
- `registerProtocol` is now `onlyOwner`, matching the sponsor dashboard
  wording; relayer `POST /protocol` signs with the owner key.
- Contract tests (21 passing, real Groth16 proofs): unregistered-site
  rejection with a *valid* proof, owner-only protocol registration, unknown-tree
  rejection, in-flight pre-revocation acceptance inside the grace window,
  expiry after the window.
- HTTP e2e: `SITE_NOT_FOUND` denial recorded for a valid proof at site 99.

### #6 — Prevent concurrent repeat issuance and repair state (P0) — code complete
- `POST /register`: duplicate checks, chain reads, pre-flight, transaction and
  persistence all run inside `withWriteLock`; inserts are idempotent
  (`ON CONFLICT DO NOTHING`).
- Crash-recovery: if the chain already holds the commitment, the leaf index is
  derived from `indexOf` and the rows are backfilled — retry returns 409
  `ALREADY_MEMBER`, never a second leaf (proven: wiped leaf #3 from SQLite,
  restarted issuer → `restored=1`, retry → 409, `memberCount` unchanged at 4).
- Issuer startup reconciliation replays `MembershipIssued` events from
  `deploymentBlock` and warns on chain/DB drift and identity-less members
  (HMACs are unrecoverable from chain data by design).
- HTTP e2e: 5 parallel same-document registrations → exactly one 201.
- Privileged routes gated: `ISSUER_API_KEY` (issuer `/register`, pre-existing)
  plus new `RELAYER_API_KEY` for relayer `POST /protocol` and `POST /site`;
  bearer keys stay server-side; `POST /enroll` and GETs stay public.

### #7 — Verify denial reasons and correct privacy labels (P1) — code complete
- `/enroll` separates: malformed → 400 (no record); transport/undecodable
  failures → 503 `RPC_FAILURE` (no record); classified reverts → signed denial.
- `DUPLICATE` reverts are re-checked with a standalone SNARK validity view
  call against the on-chain verifier: valid → `DUPLICATE` (verified duplicate),
  garbage → `INVALID_PROOF`. HTTP e2e covers the fabricated-nullifier case.
- `GET /denials/:id/verify` recomputes the canonical digest and recovers the
  signer — tamper-evident; e2e proves a modified field breaks recovery.
- Records labelled relayer-signed (`signerRole: "relayer"`), never site-signed.
- UI copy corrected: secrets on-device (no "trapdoor/nullifier" v3 terms),
  commitments public once on-chain, issuer stores HMAC digests only, monitor
  flags labelled deterministic vs LLM (`sources` field in the API).

### #4 — Deploy on Amoy and preserve audit data (P0) — code complete, deployment pending
- `scripts/render-start.mjs` has an explicit HOSTED mode: with a non-loopback
  `RPC_URL` or non-localhost `DEPLOYMENT_FILE` it never starts a local chain
  and never deploys — it fails fast if the deployment file is missing.
- `deploy.ts` records `deploymentBlock`; `/events` starts there and paginates
  (`fromBlock`/`limit`/`offset`); issuer + relayer `/health` report
  contract/network/chainId; `DB_FILE` is configurable.
- SQLite→Postgres decision documented in README (schema, digest scheme and
  reconciliation carry over; only the `db.ts` driver changes).
- Still needs human action: funded Amoy deployment (`npm run deploy:amoy`),
  explorer links, hosted-UI receipts. No secrets or funds are available in
  this environment, so no Amoy transaction was made here.

### #8 — Record browser tests, testnet evidence and final demo (P0) — partially complete
- Added `.github/workflows/ci.yml`: clean install → zk-dep repair → compile →
  21 contract tests → server typecheck → web build → boot stack → 32-check e2e.
- Local evidence on `fix/round2-issues`: `tsc` clean, 21/21 contract tests,
  `next build` green, 32/32 e2e checks, plus the restart/reconcile proof above.
- Still needs human action: genuine browser proof-generation recording, Amoy
  receipts, hosted-app browser flow, pitch rehearsal, final links.

### #2 — Coding-window rules (P0) — awaiting organizer clarification
In-repo action done: provenance table above, no history rewrite, eligible
baselines recorded (`0b1a491` review baseline; round-2 code on
`fix/round2-issues`). Written clarification must come from the organizers.

### #1 — Tracker (this file)
Status per task above. Close tasks only after the linked evidence is reviewed;
browser/Amoy items remain open pending human-produced evidence.
