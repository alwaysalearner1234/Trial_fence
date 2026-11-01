"use client";

import { useEffect, useMemo, useState } from "react";
import { Identity, Group, generateProof } from "@semaphore-protocol/core";
import Link from "next/link";
import {
  enroll,
  getConfig,
  getMembers,
  getProtocols,
  getSites,
  type EnrollmentResult,
  type ProtocolRow,
  type SiteRow,
  type SiteConfig,
} from "../../lib/api";
import { scopeFor } from "../../lib/scope";
import {
  IconCopy,
  IconRefresh,
  IconCheckCircle,
  IconAlertTriangle,
  IconAlertCircle,
  IconGlobe,
  IconInfo,
  IconExternalLink,
} from "../../components/Icons";

const IDENTITY_KEY = "tf_identity_v1";

const loadIdentity = (): Identity => {
  const saved = localStorage.getItem(IDENTITY_KEY);
  if (saved) {
    try {
      return Identity.import(saved);
    } catch {
      localStorage.removeItem(IDENTITY_KEY);
    }
  }
  const id = new Identity();
  localStorage.setItem(IDENTITY_KEY, id.export());
  return id;
};

type Step =
  | { id: "init" }
  | { id: "ready" }
  | { id: "proof" }
  | { id: "submit" }
  | { id: "result"; ok: boolean };

// ── Step Indicator (Clean Rectangular / Enterprise) ────────────
function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["1. Anonymous Identity", "2. Trial Selection", "3. Prove & Enroll"];
  return (
    <div className="step-indicator" role="list" aria-label="Enrollment progress">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const isDone = n < current;
        const isActive = n === current;
        return (
          <div key={label} className="step-item" role="listitem">
            <div
              className={`step-circle ${isDone ? "done" : isActive ? "active" : ""}`}
              aria-label={`Step ${n}: ${label} — ${isDone ? "complete" : isActive ? "current" : "pending"}`}
            >
              {isDone ? <IconCheckCircle size={14} /> : n}
            </div>
            <span className={`step-label ${isActive ? "active" : ""}`}>{label}</span>
            {i < steps.length - 1 && (
              <div className={`step-connector ${isDone ? "done" : ""}`} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <button
      className="btn-secondary btn-sm"
      onClick={copy}
      title="Copy to clipboard"
      aria-label="Copy commitment to clipboard"
    >
      {copied ? (
        <>
          <IconCheckCircle size={13} />
          <span>Copied</span>
        </>
      ) : (
        <>
          <IconCopy size={13} />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function VolunteerPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [protocolId, setProtocolId] = useState("");
  const [siteId, setSiteId] = useState("");

  const [step, setStep] = useState<Step>({ id: "init" });
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [proofBrief, setProofBrief] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, mem, pr, si] = await Promise.all([
          getConfig(),
          getMembers(),
          getProtocols(),
          getSites(),
        ]);
        setConfig(cfg);
        setMembers(mem.members.map((m) => m.commitment));
        setProtocols(pr.protocols);
        setSites(si.sites);
        if (pr.protocols.length > 0) setProtocolId(pr.protocols[0].id);
        if (si.sites.length > 0) setSiteId(si.sites[0].id);

        setIdentity(loadIdentity());
        setStep({ id: "ready" });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const group = useMemo(
    () => (members.length > 0 ? new Group(members.map((m) => BigInt(m))) : null),
    [members]
  );

  const commitment = identity?.commitment.toString();
  const isVerifiedMember =
    group && commitment ? group.members.includes(BigInt(commitment)) : false;

  const resetIdentity = () => {
    localStorage.removeItem(IDENTITY_KEY);
    setIdentity(loadIdentity());
    setResult(null);
    setProofBrief(null);
    setStep({ id: "ready" });
  };

  const runEnrollment = async () => {
    if (!identity || !group || !protocolId || !siteId) return;
    setStep({ id: "proof" });
    setResult(null);
    setProofBrief(null);
    try {
      const latest = await getMembers();
      const currentGroup = new Group(latest.members.map(m => BigInt(m.commitment)));
      setMembers(latest.members.map(m => m.commitment));
      if (!currentGroup.members.includes(identity.commitment))
        throw new Error("This identity is not in the current verified group.");
      const scope = scopeFor(BigInt(protocolId));
      const proof = await generateProof(identity, currentGroup, BigInt(siteId), scope);

      setProofBrief(
        `root=${BigInt(proof.merkleTreeRoot).toString(16)}\nnullifier=${BigInt(proof.nullifier).toString(16)}\nscope=${scope.toString(16)}\nsiteId=${BigInt(proof.message).toString()}`
      );

      setStep({ id: "submit" });
      const outcome: EnrollmentResult = await enroll(protocolId, siteId, {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot.toString(),
        message: proof.message.toString(),
        nullifier: proof.nullifier.toString(),
        scope: scope.toString(),
        points: proof.points.map((p) => p.toString()),
      });
      setResult(outcome);
      setStep({ id: "result", ok: outcome.status === "accepted" });
    } catch (e) {
      setResult({
        status: "error",
        staticCallError: e instanceof Error ? e.message : String(e),
      });
      setStep({ id: "result", ok: false });
    }
  };

  // ── Error / Loading screens ───────────────────────────────
  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-header-title">Volunteer Enrollment</h1>
          <p className="page-header-subtitle">Anonymous enrollment via zero-knowledge proof</p>
        </div>
        <div className="banner error">
          <div className="banner-icon">
            <IconAlertTriangle size={18} />
          </div>
          <div className="banner-body">
            <strong>Backend Connection Error</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>
              Unable to connect to internal services. Ensure Hardhat node, contract deployment,
              issuer (port 4001), and relayer (port 4002) are running.
            </p>
            <pre>{error}</pre>
          </div>
        </div>
      </div>
    );
  }

  if (step.id === "init" || !config || !identity) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-header-title">Volunteer Enrollment</h1>
          <p className="page-header-subtitle">Anonymous enrollment via zero-knowledge proof</p>
        </div>
        <div className="card">
          <div className="loading-state">
            <div className="spinner" aria-hidden="true" />
            <span>Loading registry configuration, membership state, and protocols…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Determine wizard step for indicator ──────────────────
  const wizardStep: 1 | 2 | 3 =
    step.id === "proof" || step.id === "submit" || step.id === "result" ? 3 : 1;

  const selectedProtocol = protocols.find((p) => p.id === protocolId);
  const selectedSite = sites.find((s) => s.id === siteId);

  return (
    <>
      <div className="page-header">
        <h1 className="page-header-title">Volunteer Enrollment</h1>
        <p className="page-header-subtitle">
          Guided 3-step enrollment. Generate an anonymous Semaphore credential and submit a cryptographic proof without exposing personal data.
        </p>
      </div>

      {/* Network metadata banner */}
      <div
        className="banner info"
        style={{ marginBottom: 20, marginTop: 0 }}
        role="status"
        aria-label="Network information"
      >
        <div className="banner-icon">
          <IconGlobe size={18} />
        </div>
        <div className="banner-body" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span><strong>Network:</strong> {config.network}</span>
          <span><strong>Chain ID:</strong> {config.chainId}</span>
          <span>
            <strong>Contract:</strong>{" "}
            <span className="mono">{config.contractAddress}</span>
          </span>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator current={wizardStep} />

      {/* Step 1 — Anonymous identity */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="badge badge-neutral">Step 1</span>
              <h2 className="card-title" style={{ margin: 0 }}>Anonymous Identity Commitment</h2>
            </div>
            <p className="card-subtitle">
              Your Semaphore v4 secret key stays private inside your browser. Only the public commitment
              is submitted to the coordinator to establish group membership.
            </p>
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={resetIdentity}
            title="Generate a fresh identity (replaces the local credential)"
            style={{ flexShrink: 0 }}
          >
            <IconRefresh size={13} />
            <span>New Identity</span>
          </button>
        </div>

        <div
          style={{
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 16px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            Public Commitment (Shareable / Non-Secret)
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                wordBreak: "break-all",
                flex: 1,
                lineHeight: 1.6,
                color: "var(--ink)",
              }}
            >
              {commitment}
            </code>
            {commitment && <CopyButton text={commitment} />}
          </div>
        </div>

        {isVerifiedMember ? (
          <div className="banner ok" style={{ margin: 0 }}>
            <div className="banner-icon">
              <IconCheckCircle size={18} />
            </div>
            <div className="banner-body">
              <strong>Verified Member:</strong> Your public commitment is recognized in the on-chain group.
              You are ready to select a trial and generate your proof.
            </div>
          </div>
        ) : (
          <div className="banner warn" style={{ margin: 0 }}>
            <div className="banner-icon">
              <IconInfo size={18} />
            </div>
            <div className="banner-body">
              <strong>Pending Membership:</strong> Your commitment is not yet registered in the verified group.
              Provide your commitment to the <Link href="/coordinator">Site Coordinator</Link> to complete initial issuance.
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — Trial selection */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="badge badge-neutral">Step 2</span>
              <h2 className="card-title" style={{ margin: 0 }}>Trial & Site Selection</h2>
            </div>
            <p className="card-subtitle">
              The cryptographic proof binds your enrollment to a specific protocol scope and site identifier.
              Attempting to enroll in the same protocol at another site produces an identical nullifier and is rejected.
            </p>
          </div>
        </div>

        <div className="field-group">
          <fieldset>
            <label htmlFor="protocol-select">Clinical Protocol</label>
            <select
              id="protocol-select"
              value={protocolId}
              onChange={(e) => setProtocolId(e.target.value)}
              disabled={protocols.length === 0}
            >
              {protocols.length === 0 && (
                <option value="">No protocols registered &mdash; register via Sponsor / IRB</option>
              )}
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? `Protocol ${p.id}`} (ID: {p.id})
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <label htmlFor="site-select">Trial Site Location</label>
            <select
              id="site-select"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={sites.length === 0}
            >
              {sites.length === 0 && (
                <option value="">No sites registered &mdash; register via Sponsor / IRB</option>
              )}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? `Site ${s.id}`} (ID: {s.id})
                </option>
              ))}
            </select>
          </fieldset>
        </div>

        {(selectedProtocol || selectedSite) && (
          <div
            style={{
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              marginTop: 4,
            }}
          >
            {selectedProtocol && (
              <div className="info-row">
                <span className="info-row-label">Selected Protocol</span>
                <span className="info-row-value">
                  {selectedProtocol.name ?? `Protocol ${selectedProtocol.id}`}{" "}
                  <span className="mono">ID {selectedProtocol.id}</span>
                </span>
              </div>
            )}
            {selectedSite && (
              <div className="info-row">
                <span className="info-row-label">Selected Site</span>
                <span className="info-row-value">
                  {selectedSite.name ?? `Site ${selectedSite.id}`}{" "}
                  <span className="mono">ID {selectedSite.id}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 3 — Prove & enroll */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="badge badge-neutral">Step 3</span>
              <h2 className="card-title" style={{ margin: 0 }}>Proof Generation & Submission</h2>
            </div>
            <p className="card-subtitle">
              Generates a zero-knowledge membership proof locally in WebAssembly and submits it to the contract relayer.
            </p>
          </div>
        </div>

        {/* Action Button */}
        {(step.id === "ready" || step.id === "result") && (
          <button
            className="btn-primary"
            onClick={runEnrollment}
            disabled={!isVerifiedMember || !protocolId || !siteId}
            style={{ marginBottom: proofBrief || step.id === "result" ? 14 : 0 }}
          >
            {step.id === "result"
              ? (step.ok ? "Submit Another Enrollment" : "Retry Enrollment Proof")
              : "Generate Proof & Submit Enrollment"}
          </button>
        )}

        {!isVerifiedMember && step.id === "ready" && (
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
            Group membership verification required prior to proof generation.{" "}
            <Link href="/coordinator">Open Site Coordinator workspace &rarr;</Link>
          </p>
        )}

        {/* Progress States */}
        {step.id === "proof" && (
          <div className="progress-step active" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <span>
              <strong>Computing Zero-Knowledge Proof…</strong> Generating SnarkJS proof against the Merkle membership tree.
            </span>
          </div>
        )}

        {step.id === "submit" && (
          <div className="progress-step active" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <span>
              <strong>Submitting to Relayer…</strong> Awaiting transaction confirmation from TrialFence smart contract.
            </span>
          </div>
        )}

        {/* Proof brief display */}
        {proofBrief && (
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Public Proof Signals (Inspected by Contract)
            </div>
            <pre className="mono-block">{proofBrief}</pre>
          </div>
        )}

        {/* Result banner */}
        {step.id === "result" && result && (
          <div
            className={`banner ${step.ok ? "ok" : "error"}`}
            role="alert"
            aria-live="assertive"
            style={{ marginTop: 12 }}
          >
            <div className="banner-icon">
              {step.ok ? <IconCheckCircle size={18} /> : <IconAlertCircle size={18} />}
            </div>
            <div className="banner-body">
              <strong>
                {step.ok
                  ? "Enrollment Confirmed"
                  : result.status === "error"
                  ? "Enrollment Execution Failed"
                  : "Enrollment Rejected by Gate"}
              </strong>
              {result.reason && (
                <div style={{ marginTop: 4 }}>Gate Reason: {result.reason}</div>
              )}
              {result.staticCallError && (
                <div style={{ marginTop: 4, fontSize: 12.5 }}>
                  Contract Evaluation: {result.staticCallError}
                </div>
              )}
              {result.signedRecord && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                  Signed Relayer Denial Record:{" "}
                  <span className="mono">
                    {result.signedRecord.message.slice(0, 24)}… · sig {result.signedRecord.signature.slice(0, 24)}… · signer {result.signedRecord.signer.slice(0, 10)}…
                  </span>
                </div>
              )}
              {result.txHash && (
                <div style={{ marginTop: 8 }}>
                  {result.explorerUrl ? (
                    <a
                      href={result.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <span>View Transaction on Explorer</span>
                      <IconExternalLink size={12} />
                    </a>
                  ) : (
                    <span>
                      Local Transaction Hash: <span className="mono">{result.txHash}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Explainer */}
      <div className="card">
        <h2 className="card-title">Nullifier Determinism & Privacy Guarantees</h2>
        <p className="card-subtitle" style={{ marginTop: 6 }}>
          The nullifier is computed as a cryptographic hash of your private identity secret and the protocol scope.
          Because it is unique per participant-protocol pair, the on-chain registry can identify repeat enrollments
          without ever learning which Merkle tree commitment was used to generate the proof.
        </p>
      </div>
    </>
  );
}
