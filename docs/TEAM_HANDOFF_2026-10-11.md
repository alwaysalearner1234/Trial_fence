# TrialFence: verified review and team handoff

Historical review from 11 October. For the latest branch state and integration results, see `PR10_REVIEW_2026-10-12.md`.

Review date: 11 October 2026 (Karachi).

## Message to share with the team

The concept still matches our submitted proposal. The three existing GitHub branches all pointed to the same 8 October commit when checked, so the branch names did not prove that the new local repairs had been pushed. We found and repaired incorrect enrollment success messages, issuer response handling, concurrent repeat issuance, unregistered-site enrollment, environment setup and misleading privacy/audit text. Local contract and API tests passed. The browser-generated proof flow and Polygon Amoy receipts remain unverified. Our next work is to review the repair branch, demonstrate the complete browser flow on Amoy, reconcile site signatures and storage with the proposal, and collect practical user evidence. We must also clarify the organizer's rules about advance coding and permitted assistance.

## What was actually inspected

- Repository: https://github.com/alwaysalearner1234/Trial_fence
- Baseline: `0b1a491a2847bcb0fec093cb70222082c21f65dc`, committed 8 October 2026.
- `main`, `fix/api-ui-2`, and `fix/round2-api-ui` all had that exact head at the start of this review. There were no pull requests or Actions runs returned then.
- Authoritative submission: the current three-page `TrialFence-TrialFence-INTL (1).docx`.
- Organizer source: current ten-page `TECHNICAL MEETING - HACKSPHERE.pdf`.
- Screenshot 1: Lidiya's Amoy funding/RPC/explorer/configuration checklist.
- Screenshot 2: TrialFence home page at `localhost:3000`. It confirms a rendered local page, not a successful proof, an Amoy deployment, or a public demo.
- Teammates' unpushed local directories were not accessible. This review cannot certify their local folders match GitHub.

## Fixes in the review branch

| Issue in baseline | Repair | Verification |
|---|---|---|
| Relayer returned `accepted`, but browser checked `status`; a success could appear denied | Added explicit accepted/denied status and signed-record fields while preserving old API fields | Genuine proof API integration; website build |
| Registration returned an object, but browser expected a number | Typed issuance result and used the actual leaf index and transaction hash | Issuance response checked; website build |
| Two requests could pass document deduplication before the transaction lock | Held one issuer-process lock from uniqueness checks through receipt and atomic database inserts | Simultaneous same-document and different-document requests; mirror root checked against chain |
| Token protection blocked the membership reads required by proof browsers | Restricted issuer token check to registration; added coordinator token input | Unauthenticated writes rejected; public reads succeed |
| Coordinator displayed missing contract/issuer-role fields | Status returns actual contract address and compares configured issuer with contract role | Integration check |
| Contract accepted a proof for an unregistered site | Added a contract-level site gate and rejected empty site names | Regression test with genuine proof |
| Clean install could not run proof tests because `wasmcurves` was absent | Added explicit dependency and updated lockfile | A second clean `npm ci`; contract tests |
| Environment variable names and relative paths did not match the server | Correct names, repository-root path resolution, and root `.env` loading | Backend type check; local stack startup |
| One-signer Amoy deployment could access undefined `issuer.address` | Require a valid explicit issuer address on public networks | Reviewed code; public deployment still untested |
| Outages could be written as participant denials | Unknown chain errors return 503 without a denial record | Chain stopped during an integration request |
| Privacy and audit text claimed commitments were off-chain, issuer could not link them, or denials were blockchain/site events | Corrected UI and README: public commitments, issuer linkage, relayer-signed off-chain denials | Source review and website build |
| Different errors were described as a duplicate-rejection rate | Label all denials as denials; reserve duplicate count for `DUPLICATE` | Source review |
| Local receipts linked to an empty explorer URL | Display local receipt hashes without a bogus explorer link | Website build |
| Success screen prevented immediate same-identity retry | Allow another enrollment at the selected site/protocol; refresh the group before generating the next proof | Website build; manual browser confirmation still needed |
| Public config returned the backend RPC URL, which may include an API token | Removed backend RPC URL from browser config | Backend type check; website build |

These repairs are prototype improvements, not a production security certification. The issuance lock protects a single issuer process. Crash recovery between chain confirmation and database persistence, multiple issuer replicas and revocation-mirror reconciliation remain future work.

The eight open GitHub issues were rechecked during publication. They remain acceptance work, not completed tasks. In particular, a `DUPLICATE` record is the contract's preflight reason, not proof that the rejected request carried a valid membership proof: a fabricated request can reuse a public consumed nullifier. Proof verification before duplicate attribution, canonical digest recomputation from displayed denial fields, tampering tests and chain/database restart reconciliation still need implementation and evidence. The tests below establish genuine duplicate rejection and signature recovery, not those remaining adversarial cases.

## Validation and its limits

- Clean dependency installation completed after the dependency repair.
- 17 contract tests passed with real Groth16/Semaphore proofs, including duplicate rejection, different identity/protocol acceptance, wrong scope, wrong site binding, tampered proof, unknown protocol, unregistered site, old-root expiry and revocation.
- The isolated API integration run passed: protocol/site registration, issuance, repeat-document refusal, real proof submissions, duplicate rejection, signed-denial verification, concurrent issuance and RPC failure without a false denial.
- Next.js production build and server TypeScript check passed.
- Chromium could not launch in this execution runtime. **No completed browser-proof or visual-interaction test is claimed.** The Node proof tests do not replace that acceptance criterion.
- **No Amoy deployment, real public explorer receipt or public application URL was verified.** A local Hardhat receipt is not an Amoy receipt.

Reproduce from the repository root with Node 22 or newer:

```sh
npm ci
npm test
npm run test:integration
npm run build -w web
npx tsc --noEmit -p server/tsconfig.json
```

Close other local services on ports 8545, 4001 and 4002 before the isolated integration run. It uses a temporary database and well-known local test keys. Keep the team database separate.

## Proposal alignment: still pending

| Submitted promise | Current evidence | Next acceptance requirement |
|---|---|---|
| Privacy-conscious duplicate-enrollment gate | Implemented and locally tested | Keep claims limited to participating sites and one issued identity |
| Genuine proof generated in participant browser | Browser code exists; genuine Node proof/contract path passes | Demonstrate browser generation with no mocked outcomes |
| Polygon Amoy contract and real testnet receipts | Deployment script exists; no verified deployment | Record chain ID 80002, contract/verifier/library addresses, and successful receipts |
| Same identity denied at a second site | Contract/API tests pass | Show the same identity in the browser and the same protocol nullifier at both sites |
| Another verified identity succeeds | Contract test passes | Repeat in a second browser profile on the actual deployment |
| Site-signed denial audit records | Current signatures are from the shared relayer | Implement site-controlled signatures/identity verification, or obtain explicit acceptance for a documented relayer-attestation variation |
| Postgres and site accounts | Prototype uses SQLite; site-account layer absent | Add persistent storage and actual role/access handling, or clear the prototype deviation with organizers |
| Sponsor view with accurate sources and explorer links | Accepted events and off-chain denial API exist; labels repaired | Confirm Amoy receipts in the browser; verify denial signatures against the expected authority |
| Data and field evidence | Submitted paper supplies empirical pilot observations | Gather project-specific workflow/need evidence; confirm whether the organizers accept the historical study for their field-evidence criterion |

The long repository file `TrialFence-Phase1-Proposal.md` is older than the submitted three-page document and includes broader claims and a statement that no code has been written. Preserve it as history and use the actual submission as the scope authority. Do not repeat that chronology as current fact.

## Lidiya's screenshot: corrected interpretation

| Screenshot item | What the team needs |
|---|---|
| Deployer needs funding | Dedicated Amoy deployer wallet with faucet test POL; this is testnet gas, not a requirement to buy mainnet tokens |
| Public RPC available | Verify that the configured endpoint responds on chain 80002; existence of a URL is not a successful deployment |
| Explorer verification requires API keys | Source verification and receipt viewing are different steps. A receipt link does not require the app to hold an explorer API key. Polygon also documents browser-based Verify and Publish; automated verification depends on the chosen explorer tooling |
| Issuer needs test POL | Fund issuer for membership operations; fund relayer for enrollment/protocol transactions and owner for site registration too |
| `NEXT_PUBLIC_*` must match deployment | Same-origin `/api/issuer` and `/api/relayer` defaults can remain. Configure their server-side internal targets for the deployed services; use public overrides only when services actually live at separate public URLs |

Polygon's official documentation lists Amoy chain ID 80002, currency POL, public RPC and explorer, and directs developers to faucets for test tokens: https://docs.polygon.technology/tools/dApp-development/common-tools/remix

## Amoy and public-demo checklist

1. Select dedicated team-controlled testnet accounts. `DEPLOYER_PRIVATE_KEY` owns the deployed contract; server `OWNER_PRIVATE_KEY` must represent that owner. `ISSUER_ADDRESS` must match `ISSUER_PRIVATE_KEY`. Relayer needs its own funded signer. Never publish these keys or use the well-known Hardhat keys on Amoy.
2. Use the corrected `.env.example`; root `.env` is read by the backend and deployment config. Set `AMOY_RPC_URL`, `RPC_URL`, `ISSUER_ADDRESS`, all signer keys, a dedicated `HMAC_SECRET`, and `ISSUER_API_KEY`. Set `DEPLOYMENT_FILE=contracts/deployments/amoy.json` and `EXPLORER_URL=https://amoy.polygonscan.com`.
3. Compile, then deploy with `npm run deploy:amoy`. Keep the output addresses and receipts. Source verification is useful for inspection but is not what makes a transaction real.
4. Verify issuer/owner roles against the deployed contract and check chain ID, actual contract code and wallet balances. Enter the issuer access token in the coordinator UI.
5. Keep APIs and data persistent; secure the owner-backed site-registration endpoint with sponsor access control before public exposure. The current proxy does not provide authorization. A dedicated RPC URL may contain a credential; keep it server-side.
6. Run all browser acceptance cases below and retain the proof of results. Capture browser generation time and failure handling. Do not use real identities or medical data for a hackathon demo.
7. Test public-RPC log-query limits. The current audit reader scans from genesis; a testnet indexer should start at deployment and page requests. A persistent testnet deployment also needs database/chain reconciliation after restart.
8. Share the public demo URL, exact commit and deployment addresses together. The current Render launcher always creates a local chain; hosting that launcher alone does **not** satisfy the Amoy promise.

### Browser acceptance cases

| Case | Expected visible outcome and evidence |
|---|---|
| First test credential and browser commitment | One real membership transaction and the correct numeric leaf index |
| Same document, new commitment | Repeat issuance refused; no second group addition |
| Identity A, protocol 1, site 1 | Real browser proof; accepted Amoy receipt and `hasEnrolled` state |
| Identity A, protocol 1, site 2 | `DUPLICATE`; same nullifier; verified off-chain denial signature |
| Identity B in a separate browser profile, protocol 1 | Accepted; different nullifier |
| Identity A, protocol 2 | Accepted; different protocol nullifier |
| Tampered proof / wrong scope / mismatched or unregistered site | Correct refusal, no accepted event |
| RPC unavailable | Retryable service error; no false participant denial |
| Sponsor audit and restart | On-chain receipts and off-chain records remain distinguishable and consistent |

## Meeting requirements and next research

The current briefing says the second international technical meeting is **TBA**. International online finals are 20-21 November, with online pitching on 21 November. International in-person participation follows 21-22 November. Do not invent the second-meeting date.

The sponsor case and optional 5% bonus are to be announced during the second international meeting. Keep the current concept intact until that case is known.

The rules require proposal alignment, empirical problem validation and working AI features or Web3 transactions during the demo. The briefing also prohibits third-party services/ghostwriters and emphasizes independent execution. The submission describes work during the official 24-hour Phase 2 period, while repository history already contains code. Ask organizers specifically what advance preparation, existing code, open-source dependencies, sponsor inference and AI assistance are allowed. Preserve history and disclose preparation accurately.

The submitted 2013 registry study observed 3.45% certain duplicate prescreens and 7.78% broader matches among 1,132 entries at nine CNS sites. These are study-specific prescreen findings, not a worldwide duplicate-enrollment rate. Source: https://pubmed.ncbi.nlm.nih.gov/23556138/ . Its vendor involvement and limited setting should be acknowledged when discussing generalization.

Recommended next research: short interviews with 3-5 coordinators, a sponsor/CRO operations person and a relevant privacy/IRB reviewer. Ask where cross-site checks happen, existing registry use, consent/retention constraints, added screening time, false-denial handling, lost-device recovery and who controls issuance/signing. Keep this as workflow evidence; do not collect patient identities or imply an interview/pilot has already happened.

Measure proof completion rate, browser proof latency, time added to screening, correct duplicate denials, false denials and issuer operating steps. Do not promise a pilot or customer revenue without evidence.

## Confirmed ownership and next steps

Syed Saad confirmed these assignments on 11 October 2026 (Karachi). The team is working on the backend first, then frontend improvements, deployment and demo/pitch practice. Syed primarily observes progress, coordinates the work and supports Lidiya.

| Work | Owner | Done when |
|---|---|---|
| Frontend research, improvements and browser demo | Krishna | Research informs usable screens; correct messages and genuine browser proof demonstrated |
| Backend fixes, site signatures, sponsor access and persistence | Lidiya, supported by Syed Saad | Tested backend; correct authority labels; records survive restart |
| Amoy configuration, signer roles, deployment and receipt capture | Team after backend/frontend acceptance; Syed coordinates | Team can inspect the exact testnet deployment |
| Organizer clarification, proposal/pitch scope and interviews | Syed Saad | Written rule clarification and actual field notes |
| Final end-to-end acceptance and demo rehearsal | All three members | One uninterrupted recorded run; dependencies/artifacts prepared in advance |

Ask each teammate to compare their branch and commit with the shared repository. If they have new local fixes, they must push that actual branch and share its commit hash; a screenshot of localhost cannot establish which code reached GitHub.
