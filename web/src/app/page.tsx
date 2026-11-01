import Link from "next/link";
import type { Metadata } from "next";
import {
  IconUser,
  IconClipboard,
  IconBarChart,
  IconLock,
  IconShieldCheck,
  IconLink,
  IconSlash,
  IconInfo,
} from "../components/Icons";

export const metadata: Metadata = {
  title: "Dashboard",
};

const roles = [
  {
    href: "/volunteer",
    Icon: IconUser,
    title: "Study Volunteer",
    body: "Generate an anonymous Semaphore identity in your browser, prove group membership without revealing it, and enroll at a participating clinical site — zero personally identifiable information reaches the blockchain.",
    cta: "Enroll with ZK proof",
  },
  {
    href: "/coordinator",
    Icon: IconClipboard,
    title: "Site Coordinator",
    body: "Use fictional test identity data to demonstrate the issuer boundary. The issuer stores a keyed digest and public commitment; raw document numbers and participant names are never stored or put on-chain.",
    cta: "Verify & issue membership",
  },
  {
    href: "/sponsor",
    Icon: IconBarChart,
    title: "Sponsor / IRB",
    body: "Register protocols and sites, audit accepted enrollment events on-chain, review relayer-signed denial records, and inspect rule-based integrity observations.",
    cta: "Open audit dashboard",
  },
];

const proofSteps = [
  {
    step: "01",
    title: "Identity Generation",
    who: "Volunteer only",
    what: "Browser generates a Semaphore v4 identity secret and corresponding public commitment. The secret never leaves the device.",
  },
  {
    step: "02",
    title: "Credential Verification",
    who: "Issuer sees test input; commitments are public",
    what: "Issuer checks fictional test identifiers for repeat issuance, then adds the public commitment to the on-chain group.",
  },
  {
    step: "03",
    title: "Zero-Knowledge Proof",
    who: "Secret stays in browser",
    what: "Browser builds a Semaphore membership proof bound to the protocol's scope and a specific site. Proof and public inputs go to the relayer.",
  },
  {
    step: "04",
    title: "On-Chain Enrollment",
    who: "Accepted events are public; denials are off-chain",
    what: "The relayer calls the smart contract. A duplicate nullifier is rejected on-chain; denials are signed off-chain by the relayer.",
  },
];

const highlights = [
  { label: "Group Membership", value: "1 Verified Group", Icon: IconLock },
  { label: "On-Chain PII", value: "Zero Stored", Icon: IconShieldCheck },
  { label: "Proof Bindings", value: "Scope + Site ID", Icon: IconLink },
  { label: "Duplicate Gate", value: "Nullifier-Gated", Icon: IconSlash },
];

export default function HomePage() {
  return (
    <>
      {/* Hero section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 12 }}>
            <span className="institutional-tag notice">
              Demonstration Environment &mdash; Fictional Test Data
            </span>
          </div>

          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "var(--ink)",
              margin: "0 0 10px",
              letterSpacing: "-0.4px",
              lineHeight: 1.25,
            }}
          >
            Privacy-Preserving Clinical Trial Enrollment
          </h1>

          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.65 }}>
            TrialFence is an enterprise zero-knowledge enrollment gate for multi-site clinical trials.
            The verified participant can enroll <strong style={{ color: "var(--ink)" }}>once per protocol</strong> across
            all participating clinical trial sites &mdash; without exposing any personally identifiable
            information (PII) on the public blockchain.
          </p>

          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            Powered by <strong style={{ color: "var(--ink)" }}>Semaphore v4</strong> zk-SNARKs.
            Only public group commitments, protocol-scoped nullifiers, and zk-proof points are verified by the smart contract.
            Names, government document numbers, and identity secrets remain strictly confidential.
          </p>
        </div>
      </div>

      {/* KPI Highlights */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {highlights.map((h) => {
          const HighlightIcon = h.Icon;
          return (
            <div className="stat-card" key={h.label}>
              <div className="stat-card-label">
                <HighlightIcon size={14} />
                <span>{h.label}</span>
              </div>
              <div className="stat-card-value" style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
                {h.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Role Selection */}
      <div style={{ marginBottom: 8 }}>
        <div className="page-header" style={{ marginBottom: 14 }}>
          <h2 className="page-header-title" style={{ fontSize: 16, marginBottom: 2 }}>
            Workspace Roles
          </h2>
          <p className="page-header-subtitle">
            Select an operational role to access the corresponding workflow.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {roles.map((r) => {
            const RoleIcon = r.Icon;
            return (
              <Link key={r.href} href={r.href} className="role-card">
                <div className="role-card-header">
                  <div className="role-card-icon">
                    <RoleIcon size={20} />
                  </div>
                  <h3 className="role-card-title">{r.title}</h3>
                </div>
                <p className="role-card-body">{r.body}</p>
                <span className="role-card-cta">
                  <span>{r.cta}</span>
                  <span aria-hidden="true">&rarr;</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* How the proof works */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Zero-Knowledge Verification Architecture</h2>
            <p className="card-subtitle">
              Four-stage pipeline ensuring cross-site duplicate prevention with cryptographic privacy guarantees.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {proofSteps.map((s) => (
            <div
              key={s.step}
              style={{
                background: "var(--surface-alt)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "16px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--secondary)",
                  marginBottom: 6,
                  letterSpacing: "0.04em",
                }}
              >
                PHASE {s.step}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 8,
                }}
              >
                {s.title}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.55 }}>
                {s.what}
              </p>
              <div className="badge badge-info" style={{ fontSize: 10.5 }}>
                {s.who}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Institutional Privacy & Security Notice */}
      <div className="banner info" style={{ margin: 0 }}>
        <div className="banner-icon">
          <IconInfo size={18} />
        </div>
        <div className="banner-body">
          <strong>Privacy and Cryptographic Isolation:</strong> This application is a clinical research proof-of-concept
          utilizing fictional test data. The credential issuer stores a keyed one-way digest and public group commitment,
          ensuring raw identity attributes and identity secrets are never stored centrally or exposed on-chain.
          Nullifiers are derived deterministically per protocol scope to prevent multi-site duplicate enrollment without deanonymizing participants.
        </div>
      </div>
    </>
  );
}
