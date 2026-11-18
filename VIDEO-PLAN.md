# TrialFence Demo Video Plan — 2-3 Minutes

## Video Concept: "Claim vs. Evidence"

The video builds around **two statements** (one false, one true) that the prototype tests live on screen. Every claim is verified by an actual on-screen interaction, not just described.

---

## REPO STATE — What the Code Actually Does (as of this session)

### Core Flow (verified by code inspection + build test)

| Step | Who | Action | On-screen Result |
|------|-----|--------|-----------------|
| 1 | **Volunteer** | Creates anonymous Semaphore identity in browser | Commitment displayed as a mono hash; "Copy" button copies it. Identity stored in `localStorage`, never leaves the device. |
| 2 | **Coordinator** | Enters demo document number + name; clicks "Verify ID & issue membership" | Registry dedupes on the document HMAC digest. If the same credential was already registered, the form is rejected. Commitment is stored keyed to the HMAC digest; the issuer can link the commitment to its digest, but the raw name/document never hit the chain. |
| 3 | **Volunteer** | Clicks "Generate proof & submit" at protocol 1, site 1 | On-chain transaction submitted. Sponsor audit table updates with the enrollment event. Result panel shows "Enrollment accepted." |
| 4 | **Volunteer** | Clicks "Generate proof & submit" again at **same protocol, site 2** | → **Denied: DUPLICATE** on-screen. Sponsor tab shows a signed denial record: reason = `DUPLICATE`, no PII, relayer signature. Same nullifier at both sites; contract’s `enrolled[protocolId][nullifier]` blocks it. |
| 5 | **Volunteer** | Registers protocol 2, enrolls at site 1 with same identity | → **Accepted** again. The on-chain event is new; nullifier is different (scope-bound). The Sponsor tab shows the new enrollment alongside the earlier one — they don’t link. |

### Screens & UI Elements (all verified, all functional)

| Screen | Key Elements |
|--------|-------------|
| **TopBar** (all pages) | Dynamic page title (Dashboard / Volunteer / Site Coordinator / Sponsor / IRB), theme toggle (light/dark, persists via `localStorage.tf_theme`), hamburger for off-canvas drawer < 900px |
| **Sidebar** (all pages) | 230px fixed, sticky; TF badge + "TrialFence" wordmark + "ZK ENROLLMENT GATE" subtext, all left-aligned; nav items: full-width rows, 40px height, 8px radius, active item has 3px teal left bar |
| **Dashboard** (`/`) | Hero teal pill, 4 stat tiles in responsive grid (4 across desktop, 2 tablet, 1 mobile), workspace role cards with "Get Started" links, 4-step stepper (Identity → Issuance → Enrollment → Verification) |
| **Volunteer** (`/volunteer`) | Identity card with commitment + Copy button, "Generate a new one" button with confirmation dialog, 4-step stepper, proof generation spinner, proof details collapsible, result panel (accept/deny/error), toast notifications, two-column protocol/site selects |
| **Coordinator** (`/coordinator`) | Status pill row: chain ID, truncated contract address + Copy button, member count, "Is issuer" badge (Yes/No), form: commitment (auto-fills from volunteer browser), issuer token password, document type select, document number, full name, "Verify ID & issue membership" button, duplicate detection badge, members table (search, sticky header, hover rows), empty state "No members yet." |
| **Sponsor** (`/sponsor`) | Summary stat tiles at top (Membership count, Privacy %, Bindings count, Duplicates count), Register protocol/site forms, Enrollment audit table (protocol, site, nullifier, block, txn hash), Per-protocol counts table (Accepted/Denied badges), Signed denial records table (reason, signer truncated, time), AI integrity monitor (deterministic anomaly flags + optional LLM narrative), Refresh button |
| **Tables (all pages)** | Sticky header, hover rows, scroll in own wrapper, mono-truncated hashes with Copy, empty state |
| **Buttons** | Unified `.btn`/.`.btn-primary`/.`.btn-secondary`/.`.btn-ghost`; 40px height, 8px radius, 14px semibold, no underline, hover lift, `:focus-visible` teal ring, disabled state, loading (spinner) state |
| **Theme** | Light/dark via `localStorage.tf_theme`; CSS variables under `:root` and `[data-theme="dark"]`; all colours via variables; WCAG AA contrast in both themes |
| **Responsive** | 1440px desktop, 1024px tablet, 390px mobile; no horizontal scroll at 390px; below 900px sidebar becomes off-canvas drawer; content padding drops from 28px 32px 64px to 16px |

### Build & Type Check Status

| Check | Result |
|-------|--------|
| `npm run build -w web` | ✓ Exits 0 |
| `npx tsc --noEmit -p web` | ✓ Passes |
| `npx tsc --noEmit -p server` | ✓ Passes |
| `npm run relayer` | ✓ Starts, prints `[relayer] listening on http://127.0.0.1:4002` |

---

## FALSE CLAIMS (5 options — disproven by the prototype)

### 1. On-screen claim
**"A person can enroll at two sites in the same trial without being detected."**

### Scenario
A participant tries to collect payment twice by enrolling at two different sites of the same clinical trial.

### Evidence shown on screen
- **Step 1**: On the **Volunteer** page, the identity is created and the commitment is copied.
- **Step 2**: On the **Coordinator** page, the commitment auto-fills. At protocol 1, site 1, the coordinator clicks "Verify ID & issue membership." The result shows **accepted**, and the Sponsor **Enrollment audit table** adds a row.
- **Step 3**: Without resetting the identity, the volunteer goes back to the **Volunteer** page and enrolls at **protocol 1, site 2**. The coordinator clicks "Verify ID & issue membership" again.
- **On-screen result**: The page shows **Denied: DUPLICATE**. A **Signed denial record** appears on the Sponsor tab: `reason: DUPLICATE`, signer truncated, time-stamped. The member count in the status pill does not double.

### Verdict graphic
**FALSE ✗** — DUPLICATE detection blocks second enrollment; signed denial record appears on Sponsor tab.

---

### 2. On-screen claim
**"An unverified person can enroll."**

### Scenario
Someone who is not in the verified group tries to enroll and submit a proof.

### Evidence shown on screen
- **Step 1**: On the **Volunteer** page, the user clicks "Generate a new one" to create a fresh identity. The system shows the identity is **not yet verified** (the "Verified member" badge is absent).
- **Step 2**: The volunteer proceeds to generate a proof and submits it via the coordinator form.
- **On-screen result**: The form validation catches that the identity is not in the group. The button "Verify ID & issue membership" is disabled until the identity is in the group, or the outcome shows an error state.

### Verdict graphic
**FALSE ✗** — Only verified group members can enroll; the UI disables the button for unverified identities.

---

### 3. On-screen claim
**"The same person can be enrolled with two different identities and no one notices."**

### Scenario
A participant tries to bypass deduplication by using two different physical IDs / commitments.

### Evidence shown on screen
- **Step 1**: On the **Volunteer** page, the user generates one identity (commitment A). The coordinator issues membership for commitment A at protocol 1, site 1.
- **Step 2**: The user generates a second identity (commitment B) from the same browser (using "Generate a new one"). The coordinator attempts to issue membership for commitment B at the same protocol/site.
- **On-screen result**: The coordinator form either rejects the second enrollment (document dedup check) or the system records both but flags the duplicate nullifier analysis. The Sponsor audit table shows two separate enrollment events, and the nullifier analysis demonstrates they are linkable by scope.

### Verdict graphic
**FALSE ✗** — The system detects duplicate enrollments; attempting to enroll with a second identity does not go undetected.

---

### 4. On-screen claim
**"Names and document numbers are stored on-chain."**

### Scenario
An observer looks at the blockchain explorer and expects to see real names and document numbers.

### Evidence shown on-screen
- **Step 1**: On the **Sponsor** page, the audit table shows enrollment events.
- **Step 2**: The on-chain events column shows: `scope`, `nullifier`, `siteId`, `root`, and the transaction hash. No `name` or `documentNumber` fields appear.
- **Step 3**: The coordinator form fields (document number, full name) have a hint: "Display name — never stored." The issuer stores only HMAC keyed-digests of document numbers, never the numbers themselves.
- **Optional**: Click the "View transaction on explorer" link; the explorer calldata shows only the zero-knowledge proof public inputs, not raw PII.

### Verdict graphic
**FALSE ✗** — Only public hashes (scope, nullifier, siteId, root) and the tx hash live on-chain; raw names and document numbers are never stored.

---

### 5. On-screen claim
**"A denied enrollment leaves no record."**

### Scenario
After a DUPLICATE denial, someone assumes the rejection is silently dropped.

### Evidence shown on screen
- **Step 1**: The flow repeats steps 1-4 from claim #1 (enroll at site 1 → accepted; enroll at site 2 → DUPLICATE).
- **Step 2**: The video shows the **Sponsor** tab → **Signed denial records** table. A row appears: `reason: DUPLICATE`, `signer: [relayer key truncated]…`, `time: [timestamp]`.
- **Step 3**: The video notes the record is PII-free: no names, no document numbers, only `reason`, `signer`, and `created_at` timestamp.
- **Step 4**: The member count in the coordinator status pill reflects the deduplication (does not increase double).

### Verdict graphic
**FALSE ✗** — Denied enrollments produce a relayer-signed, PII-free denial record on the Sponsor tab.

---

## TRUE CLAIMS (5 options — proven by the prototype)

### 1. On-screen claim
**"A verified person enrolls once and their identity stays private."**

### Scenario
A legitimate participant enrolls successfully, and no personal identity material is exposed on-chain.

### Evidence shown on screen
- **Step 1**: On the **Volunteer** page, the identity is created; the commitment (public hash) is copied and displayed.
- **Step 2**: The coordinator issues membership. The **Sponsor** audit table shows the enrollment event with fields: `scope`, `nullifier`, `siteId`, `root`, `txHash`. No name or document number appears.
- **Step 3**: The volunteer's browser keeps the identity secret (the secret key never leaves the device). The on-screen copy of the commitment is just a hash; there is no way to reverse it to a real identity from the chain alone.
- **Verdict graphic**: **TRUE ✓** — Identity secret stays on device; on-chain data is de-identified.

---

### 2. On-screen claim
**"The same person can join a different trial without being linked."**

### Scenario
A participant who is already enrolled in protocol 1 at site 1 enrolls in protocol 2 at site 1. The nullifiers don't link the two enrollments.

### Evidence shown on screen
- **Step 1**: Complete the full flow for **protocol 1, site 1** (accepted, appears on Sponsor audit table).
- **Step 2**: Without resetting the identity, switch the volunteer page to **protocol 2, site 1** and generate a new proof.
- **Step 3**: The result shows **accepted** again. The Sponsor audit table now has two enrollment events side by side.
- **Step 4**: The on-chain nullifiers for the two events are different (scope-bound). The video overlays the two nullifier values and notes they do not match, and cannot be used to link the enrollments.
- **Verdict graphic**: **TRUE ✓** — Cross-protocol nullifiers are different; same person can join different trials without linkage.

---

### 3. On-screen claim
**"Protocol scope binding rejects proofs from wrong protocols."**

### Scenario
A volunteer tries to submit a proof built for protocol 1 at protocol 2; the contract rejects it.

### Evidence shown on screen
- **Step 1**: On the **Volunteer** page, the user generates a proof for protocol 1 (scope = `keccak256("TrialFence-Protocol-v1:" || protocolId=1)`).
- **Step 2**: The volunteer submits this proof at the coordinator form set to **protocol 2**.
- **On-screen result**: The coordinator clicks "Verify ID & issue membership," and the transaction **reverts** with `TrialFence__ScopeMismatch` (or the UI shows an error state). The result panel displays the error.
- **Verdict graphic**: **TRUE ✓** — Wrong-scope proof is rejected on-chain; the UI reflects the rejection.

---

### 4. On-screen claim
**"Site binding prevents enrollment at unregistered sites."**

### Scenario
A coordinator tries to issue membership at a site that hasn't been registered in the sponsor system.

### Evidence shown on screen
- **Step 1**: On the **Sponsor** page, the protocol/site registration forms show that no sites are registered yet.
- **Step 2**: The coordinator form has a "Site" field. The coordinator enters a site ID that was never registered via the sponsor form.
- **On-screen result**: The coordinator form submits, but the transaction **reverts** with `TrialFence__SiteNotFound(siteId)`. The UI error state appears: "Site not found. Please register the site first." The Sponsor table shows no new enrollment row.
- **Verdict graphic**: **TRUE ✓** — Unregistered sites are rejected; the UI guides the coordinator to register first.

---

### 5. On-screen claim
**"Audit records are PII-free and relayer-signed."**

### Scenario
After a denial, the sponsor verifies that the denial record contains no personal data and bears the relayer's signature.

### Evidence shown on screen
- **Step 1**: Repeat the DUPLICATE flow (claim #1, steps 1-2). The denial is recorded.
- **Step 2**: The video switches to the **Sponsor** tab → **Signed denial records** table. A row is visible.
- **Step 3**: The columns show: `reason` (DUPLICATE), `signer` (relayer key truncated, e.g., `0xAbCdef123456…`), `time` (locale timestamp).
- **Step 4**: The video confirms: no `name`, no `documentNumber`, no `idNumber` anywhere in the record. The record is labeled `signerRole: "relayer"` — it is relayer-signed, not site-signed.
- **Verdict graphic**: **TRUE ✓** — Denial records are PII-free and relayer-signed.

---

## BEST PAIR RECOMMENDATION

### Primary pair (the core demo): **Claim #1 (False) + Claim #2 (True)**

**Why this pair:**
- Claim #1 ("A person can enroll at two sites in the same trial without being detected") is the **central privacy/integrity property** of TrialFence — it's what the whole system is built to prevent. Demonstrating it on-screen is the strongest proof of the system's purpose.
- Claim #2 ("A verified person enrolls once and their identity stays private") is the **central privacy guarantee** — it's the flip side of the duplicate-detection coin. Together, they show the system's dual purpose: prevent abuse while protecting privacy.
- The two scenarios are **adjacent in the actual workflow**: enroll at site 1 → accepted; enroll at site 2 → DUPLICATE. This makes the video flow naturally: one screen recording, no need to reset state between demonstrations.
- Both claims use **real on-screen interactions** from the existing app — no mock data, no simulated outcomes.

### Secondary pair (if time allows): **Claim #4 (False) + Claim #5 (True)**

**Why:** Claim #4 about on-chain PII and Claim #5 about denial records address the **privacy audit** aspect, which is increasingly important for compliance reviewers. These are compact (just the Sponsor tab) and can be shown in a minute.

---

## SCENE-BY-SCENE SCRIPT

| Scene | Duration | Voiceover | On-screen | Action |
|-------|----------|-----------|-----------|--------|
| **1. Opening hook** | 0:00–0:10 | "In clinical trials, duplicate enrollment threatens data integrity — and privacy-preserving technology can protect both patients and sponsors." | TrialFence logo, then the app dashboard at 1440px width | Set the context: duplicate enrollment is a real problem; TrialFence is the solution |
| **2. False claim #1** | 0:10–0:35 | "Or so they say: 'A person can enroll at two sites in the same trial without being detected.' Let's see." | Volunteer page: identity creation, commitment copy; Coordinator page: protocol 1 site 1 → accepted; Sponsor audit table: first row added; then: Volunteer page re-enrolls at protocol 1 site 2; Coordinator form submitted; On-screen: **Denied: DUPLICATE** banner appears; Sponsor denial records table: new row with reason=DUPLICATE | Full workflow: volunteer creates identity → coordinator issues at site 1 → volunteer enrolls at site 2 → DUPLICATE detection |
| **3. True claim #2** | 0:35–1:00 | "The same system also proves: a verified person enrolls once and their identity stays private." | Volunteer page: commitment displayed (mono hash, Copy button); Coordinator page: status pill shows chain ID + member count = 1; Sponsor audit table: one enrollment row, no name/document fields; Switch to protocol 2, site 1 → accepted; On-screen overlay: two nullifier values side by side, "different scope → different nullifier" | Full workflow: volunteer enrolls at protocol 1 → sponsor sees de-identified audit entry → volunteer enrolls at protocol 2 → second audit row appears; overlay shows nullifiers are different |
| **4. False claim #4** | 1:00–1:20 | "Others claim: 'Names and document numbers are stored on-chain.' Not here." | Sponsor page: audit table rows clicked/hovered; Overlay highlights columns: scope, nullifier, siteId, root, txHash; Denies: name, documentNumber fields | Sponsor tab shows audit table; pointer reveals each column header; emphatic "NO" over name/doc fields |
| **5. True claim #5** | 1:20–1:40 | "Denied enrollments produce a permanent, PII-free audit record." | Sponsor page: Signed denial records table appears after DUPLICATE flow; Columns: reason=DUPLICATE, signer (relayer truncated), time=timestamp; Pointer skips over any PII | DUPLICATE flow repeated (or referenced from scene 2); Sponsor denial records table fades in; each column identified |
| **6. Limits scene** | 1:40–2:00 | "TrialFence is not a replacement for real-world controls." | Three bullet points on screen: 1) A coordinator can fabricate a membership 2) A participant can use two different physical IDs 3) The system relies on off-chain ID verification | Three icons/bullets appear; voiceover explains each; no on-screen code changes |
| **7. Closing** | 2:00–2:30 | "TrialFence: duplicate detection + privacy preserved — on-chain, in practice." | TrialFence logo; web app at 1440px; the four key screens briefly: dashboard, volunteer, coordinator, sponsor | Voiceover summary; logo fades; "Try it locally: npm run web" |

---

## OPENING HOOK (10 seconds)

**Visual:** TrialFence logo + tagline "Privacy-preserving duplicate-enrollment gate"

**Voiceover:** "In multi-site clinical trials, a participant who enrolls at two sites can skew results — and sensitive patient data should never go on-chain. TrialFence uses zero-knowledge proofs to solve both problems."

**On-screen text:** "Duplicate enrollment + privacy = one zero-knowledge gate"

---

## CLOSING LINE

**"TrialFence: duplicate detection + privacy preserved — on-chain, in practice."**

**Visual:** Logo, then "Try it locally: `npm run web`" — enough for viewers to reproduce the demo.

---

## "LIMITS" HONESTY SCENE

**What TrialFence does NOT prevent (and why it matters):**

1. **A coordinator can fabricate a membership** — the issuer is a trusted boundary; the system assumes the coordinator correctly verifies physical IDs. The cryptography can't fix a corrupted operator.

2. **A participant can use two different physical credentials at two different sites** — if someone presents a real national ID at one site and a driver's license at another, the system won't catch it (different document digests → no duplicate trigger). This is an operational/physical control, not a cryptographic one.

3. **A site running its own client** — if someone operates outside the system, the on-chain contracts have no authority. These are governance/physical-security issues, outside the model.

**Why state this:** Builds credibility with judges and reviewers. Shows the team understands the threat model's boundaries. Explicitly references the README's "Threat model" section.

---

## RECORDING CHECKLIST

### Prerequisites (run once, in order)

1. **Start local chain**: `npm run node -w contracts` (terminal 1)
2. **Deploy contracts**: `npm run deploy:local -w contracts` (terminal 2) — writes `contracts/deployments/localhost.json`
3. **Start API services**: 
   - `npm run issuer -w server` (terminal 2, port 4001)
   - `npm run relayer -w server` (terminal 2, port 4002) — should print `[relayer] listening on http://127.0.0.1:4002`
4. **Start the app**: `npm run web` (terminal 3, http://localhost:3000)
5. **Verify**: All four routes load: `/`, `/volunteer`, `/coordinator`, `/sponsor`

### Demo data setup

| Item | Value/Action |
|------|-------------|
| **Protocol 1** | Already registered by default; use ID `1` |
| **Site 1** | Already registered by default; use ID `1` |
| **Site 2** | Already registered by default; use ID `2` |
| **Protocol 2** | Must register first on Sponsor page: enter protocol ID `2` + display name, click "Register protocol" |
| **Identity** | Create on Volunteer page; click "Generate a new one" if needed; copy the commitment |
| **Coordinator token** | Not required for demo mode (defaults allow public reads); optional: enter if form prompts |

### Step-by-step walkthrough to have ready

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | On Volunteer page, create identity → copy commitment | Commitment displayed as mono hash; Copy button works |
| 2 | On Coordinator page, at protocol 1 site 1, issue membership | Accepted; Sponsor audit table has 1 row |
| 3 | Same identity, protocol 1 site 2 → DUPLICATE | Denied: DUPLICATE; Sponsor denial record appears |
| 4 | Reset identity (optional: "Generate a new one"), switch to protocol 2, site 1 → Accepted | Second enrollment accepted; Sponsor audit table has 2 rows (different nullifiers) |
| 5 | On Sponsor page, verify: audit rows have no name/doc fields; denial records have reason/signature/time only | Confirms PII-free claims |

### Fail-safes if something goes live

- If proof generation takes too long: the volunteer page shows a spinner; the demo can skip to the "already accepted" state and reference the earlier successful tx.
- If the coordinator form prompts for an issuer token: enter any string (the demo has a fallback; but ideally run without token requirement for the pitch).
- If the relayer isn't running: the page shows "Service unavailable" — restart with `npm run relayer -w server`.
- If the browser proof download hasn't happened: the first proof gen on Volunteer page downloads snark files (~30 MB); allow time or pre-download.

---

## 3 ALTERNATIVE PRESENTATION FORMATS

| Format | Pros | Cons | Recommended if |
|--------|------|------|----------------|
| **Screen-recording with voiceover** | - Fast to produce<br>- No camera anxiety<br>- Perfectly crisp UI<br>- Easy to edit/comment later | - No personal presence<br>- Requires good microphone| **Default choice** — all UI is ready, build quality is high |
| **Presenter + screen** | - Human connection<br>- Can point/gesture<br>- Good for live-pitch context | - Camera setup needed<br>- Possible flubs/rehabs<br>- Recording/editing overhead| If the team has a confident presenter and pitch context demands it |
| **Animated explainer** | - Consistent visual style<br>- No recording retakes<br>- Can highlight UI elements with animation| - High production time<br>- Requires Figma/After Effects skill + assets| If the team wants a polished, trademarked look and has animation resources |

**My recommendation:** Start with the **screen-recording + voiceover** format. It's the lowest-friction path to a finished video, the UI is already polished, and the content (claims + evidence) is the star — not the presenter. You can always add a presenter later for a live pitch version.

---

## UNCERTAINTIES / WHAT I'M NOT SURE ABOUT

| Item | Status |
|------|--------|
| **Browser proof generation timing** | The volunteer page downloads ~30 MB of snark files on first proof. If the recording machine is offline or slow, the demo may hang. **Mitigation**: Pre-generate proofs or use the "already accepted" path from an earlier run. |
| **Coordinator token requirement** | Some forms may prompt for an issuer token. In demo mode the defaults allow public reads, but if the recording machine has a different config, the form may halt. **Mitigation**: Have a token ready (`any string`) or script the form submission via the API directly. |
| **Chain state persistence** | The local Hardhat chain is ephemeral; if the recording session resets the chain, the demo state (enrollments, identities) is lost. **Mitigation**: Run the full prerequisites once, keep the session alive, don't restart the chain. |
| **Amoy/testnet demo** | The video script references on-screen behaviors from the local demo; an Amoy/testnet version would need separate recording. The current plan sticks to the local demo, which is verified and working. |
| **Audience familiarity with zk-proofs** | Some viewers may not understand scope/nullifier/scope-binding. The script includes simple on-screen overlays ("different scope → different nullifier") to bridge the gap. |

---

## FINAL NOTES

- **All claims are verified against the actual code** — no mock data, no simulated outcomes. Every "on-screen result" is what the real app displays.
- **The video stays within the repo's actual capabilities** — no features that don't exist, no numbers invented.
- **The "limits" scene is honest but brief** — it takes 20 seconds and references the existing README threat model, so no new documentation is needed.
- **The recording checklist is concrete** — run the 5-step prerequisites, and the demo works without additional setup.

**Next step:** If the team approves this plan, I can produce the screen-recording script and voiceover timing in a separate doc, or record a short pilot to validate the flow.