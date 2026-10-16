# Round 2 evidence log (tracker: issue #1)

This file records code provenance, commit dates, baselines and per-task
evidence for the TrialFence round-2 review. History is NOT rewritten to satisfy
the coding window — actual dates are recorded below (issue #2).

## Code provenance (no history rewrite)

The original author timestamps use +05:30. Pakistan time is UTC+05:00, so the table below is now converted to Karachi time. Commit dates do not establish organizer eligibility.

| Commit | Date (Karachi +0500) | Subject |
|---|---|---|
| `e255a12` | 2026-10-08 11:14 | TrialFence: zk duplicate-enrollment gate (initial scaffold) |
| `2815015` | 2026-10-08 11:20 | fix(sponsor): normalize protocol/site ids to strings |
| `096f331` | 2026-10-08 11:42 | Render single-service deploy (proxies + start script) |
| `f188fb6` | 2026-10-08 11:43 | README Render deploy section |
| `a71519d` | 2026-10-08 11:43 | `.env.example` proxy defaults |
| `0b1a491` | 2026-10-08 14:10 | fix(build): vendor browser bundles |
| `58f5238` (`fix/round2-issues`) | 2026-10-11 23:43 | issues #4–#8 fixes (this branch) |

Coding-window note (issue #2): the published window is 10 Oct 08:00 – 11 Oct
08:00 PKT. The commits dated 8 Oct predate it. They are recorded as-is; written
organizer clarification on existing code / permitted preparation is still
required from the team (external action — cannot be produced in-repo). The `58f5238` timestamp converts to 11 October 23:43 Karachi, after that stated window. Neither the baseline nor the later work is confirmed eligible. The current technical-meeting document gives a November international final; the applicable build window and permitted preparation must be clarified with the organizers.

## Environment used for verification

- Node v22 (`.nvmrc`), npm workspaces, clean `npm ci` + `node scripts/fix-zk-deps.mjs`
- Local Hardhat automining chain (chainId 31337), fresh `server/data` per run
- `contracts/deployments/localhost.json` regenerated per run (includes `deploymentBlock`)

## Per-task status and evidence

### #3 — Fix frontend and API response mismatches (P0)
PR #10 packages the five original October 8 commits. At head `0b1a491`, its enrollment and issuance response mismatches remain. PR #9 supplies those repairs. The October 12 integration branch combines them with this backend work; genuine browser acceptance evidence is still pending.

### #5 — Require registered sites and verify revocation (P1) — implementation present, acceptance gaps remain
- `TrialFence.enroll` now reverts `TrialFence__SiteNotFound(siteId)` for
  unregistered sites, checked before scope/message/nullifier/proof.
- `registerProtocol` is now `onlyOwner`, matching the sponsor dashboard
  wording; relayer `POST /protocol` signs with the owner key.
- Contract tests (21 passing, real Groth16 proofs): unregistered-site
  rejection with a *valid* proof, owner-only protocol registration, unknown-tree
  rejection, in-flight pre-revocation acceptance inside the grace window,
  expiry after the window.
- HTTP e2e: `SITE_NOT_FOUND` denial recorded for a valid proof at site 99.

### #6 — Prevent concurrent repeat issuance and repair state (P0) — implementation present, acceptance gaps remain
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
  wallet private keys stay server-side; issuer and registry API tokens are entered by authorized staff in the browser, kept in page memory and forwarded to the matching protected route. `POST /enroll` and GETs stay public.

### #7 — Verify denial reasons and correct privacy labels (P1) — implementation present, acceptance gaps remain
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

### #4 — Deploy on Amoy and preserve audit data (P0) — deployment and persistent storage pending
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
In-repo action done: provenance table above, no history rewrite, actual
baselines recorded (`0b1a491` review baseline; round-2 code on
`fix/round2-issues`). Written clarification must come from the organizers.

### #1 — Tracker (this file)
Status per task above. Close tasks only after the linked evidence is reviewed;
browser/Amoy items remain open pending human-produced evidence.

## Review correction, 12 October 2026

The test counts above are the original branch author's report, not GitHub CI evidence. No workflow runs were returned for `58f5238` when rechecked. The combined review has 22 passing genuine-proof contract tests, a clean npm install, a passing server typecheck and production website build. Its HTTP integration result is recorded in `PR10_REVIEW_2026-10-12.md` after execution.

Reconciliation currently replays issuance events only. It does not rebuild revoked leaves, recreate lost HMAC identity records, or coordinate multiple issuer processes. Those remain acceptance gaps. Event output pagination slices results after one RPC query and does not bound the RPC block range. Postgres, site accounts, site-controlled signatures and a verified Amoy/browser demo remain pending. Do not close #3–#8 based on this document alone.

### Denial verification hardening

New denial records use V2 typed ABI encoding so field boundaries cannot collide. Verification requires the configured relayer address, rather than trusting an editable stored signer. The isolated integration test changes a stored field, forges an otherwise valid signature with a different wallet, restores the original record and checks the verifier responses. Older packed V1 records do not verify as V2 and need explicit legacy review; no audit rows are deleted or re-signed.
