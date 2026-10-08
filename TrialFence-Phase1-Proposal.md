# TrialFence

**A privacy-preserving Web3 enrollment gate for multi-site clinical trials**

Zero-knowledge membership proofs · Protocol-scoped nullifiers · Polygon Amoy

HACKSPHERE 2026 · COMPSPHERE 12 · THEME: WEB3 INNOVATION — Phase 1: Idea Proposal

---

## Team Identity

| | |
|---|---|
| **Team Name** | TrialFence |
| **Team Category** | International (All Members) |
| **Sector** | Healthcare — clinical research integrity |

### Team Leader — Syed Saad
- **Status:** Undergraduate Student
- **Email:** syesaad159@gmail.com
- **Country:** Pakistan
- **Institution:** Hamdard University

### Member 1 — Duddekuntla Lidiya
- **Status:** Third-year B.Tech Artificial Intelligence and Data Science student
- **Email:** duddekuntlalidiya@gmail.com
- **Country:** India
- **Institution:** Dhanalakshmi Srinivasan University

### Member 2 — Krishna Kumar
- **Status:** B.Tech Artificial Intelligence and Machine Learning student
- **Email:** krishn.inbox404@gmail.com
- **Country:** India
- **Institution:** Government Engineering College, Munger

> Conceptual proposal. No code has been written; the MVP will be built during the official 24-hour Phase 2 marathon.

---

## 1. Executive Summary

Multi-site clinical trials have a quiet integrity problem: the same person can enroll in the same study at two different sites, or join a new trial while still inside another trial's washout period. Published estimates put duplicate subjects at 2% to 12% of participants depending on indication, and the problem is worst in pain, psychiatry and substance-use studies, where endpoints are subjective. Duplicates dilute efficacy signals, hide safety events and can push a trial toward failure.

Today's fix is a centralized subject registry: every site uploads identifiers into one vendor database that competing sponsors must trust. That concentrates exactly the kind of health-linked identity data attackers target — in 2024 alone, more than 276 million U.S. healthcare records were breached.

TrialFence removes the central list. After an authorized issuer verifies a participant once, the participant's browser creates a Semaphore identity and keeps the secret locally. At any participating site, the browser proves verified group membership with a zero-knowledge proof — without revealing the participant's identity to the smart contract. A Polygon Amoy contract binds that proof to one study protocol and accepts the resulting nullifier only once. If the same verified identity attempts to enroll again for that protocol at another site, the contract rejects it.

Names, ID images, screening answers and medical records stay off-chain. Independent sites get one shared, inspectable enforcement rule — auditable by sponsors and IRBs, with no pooled identity database anywhere.

---

## 2. Data-Driven Problem Statement

### Duplicates are common and measurable

| Figure | Source |
|---|---|
| **2–12%** of trial participants are duplicate subjects, depending on indication, trial size and location | [1] |
| **3.45%** exact-duplicate prescreens / **7.78%** broader matching records in a Southern California CNS registry study of 1,132 subjects | [2] |
| **75%** of experienced research subjects admit concealing health information to avoid exclusion | [3] |

An Astellas fibromyalgia protocol filed on ClinicalTrials.gov summarises the industry picture: 6–11% of people seeking entry are either in another trial's lock-out period or trying to enter at a second facility, and dual enrollment per trial ranges from 2% to 10% by therapeutic area and phase. In one small proof-of-concept study the sponsor found 3% of subjects had screened at two different sites [4].

Deception makes screening questionnaires unreliable. In a survey of experienced subjects, 32% had concealed health problems, 28% prescribed medications and 20% recreational drug use; a quarter had exaggerated symptoms and 14% had pretended to have a condition to qualify [3]. A 2021 follow-up found that subjects who conceal information do so in about two-thirds of the trials they join [5]. Sponsors respond by writing duplicate-subject exclusions into protocols and removing confirmed duplicates from efficacy analyses because their data are unreliable [6].

**Scope of our claim:** we focus on one narrow bottleneck — among participating sites and people issued one verified credential, the same person must not pass the enrollment gate twice for the same protocol. We do not claim to detect every fake identity, every undisclosed concurrent trial, or any activity at sites that do not use the gate.

### The current fix creates a new privacy risk

The standard remedy is a commercial subject registry such as CTSdatabase or Verified Clinical Trials. Sites enter authorized subject identifiers at screening and receive a match report [7]. This works, but it means a single vendor holds a cross-sponsor list of people who have sought treatment for depression, schizophrenia, pain or addiction. That is highly sensitive data, and healthcare is the most breached sector:

- **276.8M** U.S. healthcare records breached in 2024 — the worst year on record [8]
- **190M** records exposed in the single Change Healthcare breach [8]
- **725** large (500+ record) healthcare breaches reported to HHS in 2024 [9]

The problem is also growing: decentralized and hybrid trials reduce face-to-face contact with the site, which the registry industry itself says raises duplicate-enrollment risk [1].

### Why existing approaches fall short

| Approach | Stops cross-site duplicates? | Privacy | Trust model |
|---|---|---|---|
| Self-report + site checks | No — relies on honesty (75% conceal [3]) | Good | Each site alone |
| Centralized subject registry | Yes, if all sites join | Weak — one database of identifiers and trial history | Everyone trusts one vendor |
| **TrialFence** | **Yes, enforced by contract** | **Strong — no PII on-chain, unlinkable across protocols** | **Public, verifiable code** |

---

## 3. Proposed Solution & Value Proposition

### How TrialFence works

1. **Identity check (off-chain, once).** A trained coordinator verifies the volunteer's government ID through our Issuer service. The service computes a keyed hash, `HMAC(normalised ID number)`, and refuses to register a second identity for the same person. The ID document itself is then discarded.
2. **Anonymous identity.** The volunteer's browser creates a Semaphore identity. Only its public commitment is added to the consortium's on-chain group. The secret never leaves the device.
3. **Enrollment proof.** To enroll in protocol P at any site, the browser produces a zero-knowledge proof: "I am a member of the verified group", plus a nullifier derived from P's scope and the volunteer's secret.
4. **On-chain gate.** `TrialFence.sol` verifies the proof. A new nullifier means the enrollment is accepted and recorded. A reused nullifier means the same person already enrolled in P, so the transaction is rejected, at any site.
5. **Audit.** Sponsors and IRBs see accepted and rejected attempts per protocol and site as public events, with no personal data. A relayer pays gas, so the volunteer needs no wallet.

Rejected checks are stored as signed site audit records, because a reverted blockchain transaction cannot create a persistent rejection event.

**Trust boundaries we accept:** the issuer remains a real trust and privacy boundary; we will constrain access, retention and key handling rather than claim full decentralization.

### Why Web3 is necessary here, not decorative

A normal database could store nullifiers, but then someone has to run it, and every sponsor must trust that operator not to edit records, quietly admit a duplicate, or leak the table. Competing pharma companies and CROs rarely agree on one trusted operator. A public smart contract gives them a neutral rule that nobody can change after deployment, and an append-only record anyone can check. Zero-knowledge proofs are what make that public record safe: the chain proves uniqueness without learning who anyone is.

### Value for each stakeholder

| Stakeholder | Value |
|---|---|
| Sponsors & CROs | Cleaner efficacy data, fewer protocol deviations, a tamper-evident audit trail across all sites and vendors |
| Trial sites | A simple accept / reject answer at screening, before costly procedures begin |
| Volunteers | Identity and medical history never pooled in a shared registry; participation in one trial cannot be linked to another |
| IRBs & regulators | Verifiable evidence that duplicate-enrollment rules were enforced, with data minimisation built in |

### What is new (unique selling points)

- **Privacy-first duplicate prevention.** Existing registries detect duplicates by matching identifiers in a central database. TrialFence prevents them cryptographically with no identifier database at all.
- **Protocol-scoped unlinkability.** Each protocol has its own scope, so a volunteer's enrollments in different trials produce unrelated nullifiers. No one can build a trial history.
- **Gasless for volunteers.** A relayer submits transactions, so volunteers need no wallet or crypto.
- **Washout-window extension.** The same mechanism can enforce "one enrollment per therapeutic area per 90 days" by using a scope of `H(area, time window)`, a direct answer to lock-out violations [4].

---

## 4. Minimum Viable Product (MVP) / Key Features

The MVP proves the core claim end to end on a public testnet, using real Semaphore proofs and real Polygon Amoy transactions. Nothing is hardcoded — the UI must display real testnet receipts and contract state.

| # | Feature | What the judges will see | Priority |
|---|---|---|---|
| F1 | Protocol registry | Sponsor creates a protocol; contract stores its id, scope and group | Must |
| F2 | Identity issuance | Coordinator verifies a clearly labelled test ID; HMAC uniqueness check; commitment added to the on-chain group. This demonstrates the issuer boundary — not production government-ID verification | Must |
| F3 | ZK enrollment | Volunteer generates a Semaphore v4 proof in the browser; a Node.js relayer submits it without receiving the proof secret | Must |
| F4 | Duplicate rejection | Same volunteer tries a second site for the same protocol; transaction reverts as a duplicate | Must |
| F5 | Cross-protocol freedom | Same volunteer enrolls in a different protocol; accepted, and the nullifiers are unlinkable | Must |
| F6 | Audit dashboard | Live counts of accepted enrollments and site-signed denial records per protocol and site, read from contract events with Polygonscan links | Should |
| F7 | AI integrity monitor | LLM summarises anomalies (e.g. one site with a spike in rejected duplicates) from PII-free event data | Could |
| F8 | Washout scope | Scope `H(area, window)` enforces one enrollment per area per window | Could |

**Negative tests:** invalid proofs, wrong scopes, repeat issuance, duplicate nullifiers and RPC failure.

### Live demo script (about 3 minutes)

1. Sponsor registers protocol `DEMO-PAIN-01` on Amoy.
2. Coordinator at Site A verifies volunteer V; the commitment appears in the group.
3. V enrolls at Site A: accepted, and the event appears on Polygonscan.
4. V tries again at Site B with the same protocol: rejected on-chain as a duplicate.
5. V tries to get a second identity at Site B: refused by the Issuer's uniqueness check.
6. V enrolls in `DEMO-CNS-02`: accepted. The dashboard shows two unrelated nullifiers.

### 24-hour build plan (team of 3)

| Hours | Member 1 — contracts | Member 2 — backend & AI | Member 3 — frontend |
|---|---|---|---|
| 0–6 | TrialFence.sol on top of Semaphore; Hardhat tests for accept / duplicate | Postgres schema; Issuer API with HMAC uniqueness | Next.js scaffold; identity creation in browser |
| 6–14 | Deploy to Amoy; verify on Polygonscan | Relayer service; event indexer | Proof generation; enrollment flow; coordinator portal |
| 14–20 | Washout-scope variant (stretch) | AI integrity monitor (stretch) | Audit dashboard |
| 20–24 | End-to-end testing | Deploy services | Deploy to Vercel; rehearse demo |

### Explicitly out of scope for the MVP

Real government-ID document verification (we will use a test verification step clearly labelled as such), production key management, mainnet deployment, and integration with sponsors' EDC or IWRS systems. These are post-hackathon work.

**Phase 2 acceptance gate:** if the browser proof, contract verification, duplicate-nullifier rejection and explorer receipts are not genuine, we will not present the flow as functional.

---

## 5. Target Market & Impact Viability

### Who uses and pays for TrialFence

| Segment | Role | Why they adopt |
|---|---|---|
| Pharma & biotech sponsors | Buyer | Failed or repeated trials are expensive; duplicates threaten endpoints in subjective indications [1][2] |
| CROs | Buyer / integrator | Need one enforcement layer across many sites and sponsors |
| Research sites & Phase 1 units | Daily user | Fast yes / no at screening avoids wasted screening costs |
| Volunteers | End user | Participate without joining a shared identity database |
| IRBs / ethics committees | Reviewer | Evidence of enforcement plus data minimisation |

**Beachhead:** healthy-volunteer Phase 1 units and CNS, pain and substance-use trials, where duplicates are most common and registries are already accepted practice [1][2]. Protocols in these areas already include a subject-registry step at screening [7], so TrialFence replaces an existing workflow rather than adding a new one. A second early market is Alzheimer's research, where duplicates are documented but registries are rarely used [10].

**Business model:** per-protocol licence paid by the sponsor (covers all sites in that protocol); per-verification fee for identity issuance (covers relayer gas); consortium tier for CRO networks sharing one volunteer group across many sponsors.

### Impact

- **Scientific:** fewer contaminated data points in trials whose results decide which treatments reach patients.
- **Safety:** volunteers cannot receive two investigational drugs at once, protecting them from untested interactions.
- **Privacy:** removes the need for a central database linking people to psychiatric or addiction trials, in a sector that suffered record breaches in 2024 [8].

### Pilot metrics

Verified duplicate attempts stopped across participating sites, added screening time, false denials, proof-completion rate and issuer operating cost.

### Risks and limits

Adoption depends on informed consent, issuer governance, regulatory review and participation by multiple sites. TrialFence cannot protect a protocol when sites do not join or when the issuer fails to distinguish two identities.

### Scalability & sustainability

- **Cost:** Polygon's low fees make each enrollment cheap; proof generation runs on the volunteer's device, not our servers.
- **Scale:** Semaphore groups are incremental Merkle trees, so a single group can hold very large numbers of members, and multiple consortium groups can run in parallel.
- **Global:** the on-chain layer is jurisdiction-neutral; only the off-chain identity check is localised per country.

**Roadmap after the hackathon:** real ID-verification partners, multiple independent issuers, mainnet or a permissioned L2, and EDC / IWRS integration.

---

## 6. Tech Stack & System Architecture

### Architecture

```
(1) Site invites volunteer
(2) Issuer verifies test ID → HMAC uniqueness check
(3) Issuer adds identity commitment to on-chain Semaphore group
(4) Volunteer's browser generates ZK proof → sends to relayer
(5) Relayer calls TrialFence.sol → contract verifies proof, stores nullifier
(6) Public events feed audit dashboard and AI monitor
```

```
Participant Browser ── secret + proof ──▶ Authorized Issuer (identity check + keyed index)
        │                                          │
        │                                   Semaphore Group (verified commitment)
        ▼
Participant Browser ── protocol-scoped proof ──▶ Gas Relayer ──▶ Polygon Contract
                                                                          │
Site Audit Log ◀── signed denial record ◀── Contract Outcome ◀────────────┘
                        (accepted or denied) ──▶ Sponsor View (verified success events)
```

**Data placement:** on-chain — group reference, protocol scope, proof result and one-time nullifier. Off-chain — names, ID images, screening answers, medical records and the participant secret. The issuer alone receives test identity input; the contract receives a proof, group reference, protocol scope and nullifier, but no name or medical data.

### Tech stack

| Layer | Technology | Why this choice |
|---|---|---|
| Smart contracts | Solidity, Hardhat | Industry-standard EVM tooling with local tests and one-command deployment |
| ZK layer | Semaphore v4 (`@semaphore-protocol`) | Audited, well-documented group membership and nullifier scheme [11]; Groth16 proofs verified on-chain |
| Network | Polygon Amoy testnet | Low fees, EVM-compatible, public explorer for judges to verify |
| Frontend | Next.js, TypeScript | Browser-side proof generation; one codebase for volunteer, coordinator and audit views |
| Off-chain data | Postgres | Site accounts, protocol metadata, keyed identifier digests and signed denial logs |
| Relayer | Node.js / TypeScript + ethers | Gasless enrollment; hides volunteer wallet activity; never receives the proof secret |
| AI (stretch) | LLM via API | Plain-language anomaly alerts from aggregated, PII-free event data |

### Security & threat model

| Threat | Mitigation |
|---|---|
| Same person enrolls twice in one protocol | `nullifier = H(scope, secret)` is identical both times; the contract rejects the second proof |
| Same person obtains a second identity | Issuer stores `HMAC(normalised ID)` and refuses a second commitment; the HMAC key is server-side only |
| Linking a volunteer across trials | Different scopes give unrelated nullifiers; no PII on-chain |
| Tracing the transaction sender | Relayer submits all enrollments, so no volunteer wallet is exposed |
| Lost device / lost secret | Coordinator re-verifies; the old commitment is removed from the group and a new one added |
| Malicious or compromised issuer | Issuer role limited by contract; future: multiple independent issuers and audit of every group change on-chain |

### Feasibility

Every component uses mature, open-source tooling with public documentation. Semaphore already provides the on-chain verifier, group contracts and JavaScript proof libraries [11], so our 24-hour effort goes into the enrollment logic, the issuer's uniqueness check, the relayer and the user flows — realistic for a team of three.

---

## References

1. Verified Clinical Trials. *Duplicate Subjects in Clinical Trials Proactively Detected and Prevented*, 2022. verifiedclinicaltrials.com
2. Shiovitz T. et al. *CNS Sites Cooperate to Detect Duplicate Subjects with a Clinical Trial Subject Registry.* Innov Clin Neurosci, 2013. pmc.ncbi.nlm.nih.gov/articles/PMC3615509
3. Devine E.G. et al. *Concealment and fabrication by experienced research subjects.* Clinical Trials 10(6):935–48, 2013. doi:10.1177/1740774513492917
4. Astellas Pharma. Protocol NCT03056690 (ASP0819 in fibromyalgia), rationale for duplicate-subject checking, 2016. ClinicalTrials.gov
5. Devine E.G. et al. *Frequency of concealment, fabrication and falsification of study data by deceptive subjects.* Contemp Clin Trials Commun, 2021. PubMed 33604482
6. Alkermes. Statistical Analysis Plan NCT03188185, section on duplicate subjects. ClinicalTrials.gov
7. Biohaven. Protocol NCT04571060, section 6.7 Clinical Trial Subject Database. ClinicalTrials.gov
8. The HIPAA Journal. *The Biggest Healthcare Data Breaches of 2024.* hipaajournal.com
9. The HIPAA Journal. *2024 Healthcare Data Breach Report*, January 2025. hipaajournal.com
10. *The Patient in Your Alzheimer's Disease Study May Be in Another.* J Prev Alzheimers Dis. sciencedirect.com
11. Semaphore Protocol documentation: Proofs and Glossary. docs.semaphore.pse.dev
