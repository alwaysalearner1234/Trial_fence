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
  { label: "Group Membership", value: "1 Verified Group", note: "On-chain Merkle tree", Icon: IconLock },
  { label: "On-Chain PII", value: "Zero Stored", note: "Complete privacy boundary", Icon: IconShieldCheck },
  { label: "Proof Bindings", value: "Scope + Site ID", note: "Protocol scoped", Icon: IconLink },
  { label: "Duplicate Gate", value: "Nullifier-Gated", note: "Prevents double enrollment", Icon: IconSlash },
];

export default function HomePage() {
  return (
    <>
      {/* Hero section — Rebalanced 2-column layout with inline clinical SVG */}
      <div className="card hero-card" style={{ marginBottom: 20 }}>
        <div className="hero-content">
          <div style={{ marginBottom: 12 }}>
            <span className="institutional-tag notice">
              Demonstration Environment &mdash; Fictional Test Data
            </span>
          </div>

          <h1 className="hero-title">
            Privacy-Preserving Clinical Trial Enrollment
          </h1>

          <p className="hero-lead">
            TrialFence is an enterprise zero-knowledge enrollment gate for multi-site clinical trials.
            The verified participant can enroll <strong style={{ color: "var(--ink)" }}>once per protocol</strong> across
            all participating clinical trial sites &mdash; without exposing any personally identifiable
            information (PII) on the public blockchain.
          </p>

          <p className="hero-subtext">
            Powered by <strong style={{ color: "var(--ink)" }}>Semaphore v4</strong> zk-SNARKs.
            Only public group commitments, protocol-scoped nullifiers, and zk-proof points are verified by the smart contract.
            Names, government document numbers, and identity secrets remain strictly confidential on the participant device.
          </p>
        </div>

        {/* Clinical Precision SVG: Shield + Privacy Fence + Merkle Node-Link Motif */}
        <div className="hero-illustration" aria-hidden="true">
          <svg
            className="hero-svg"
            viewBox="0 0 320 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Ambient Background Grid / Circuit Accent */}
            <rect x="20" y="20" width="280" height="180" rx="12" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            
            {/* Privacy Fence Perimeter Guide */}
            <path
              d="M160 28 L260 62 V125 C260 168 160 198 160 198 C160 198 60 168 60 125 V62 Z"
              stroke="var(--secondary)"
              strokeWidth="1.25"
              strokeDasharray="4 4"
              opacity="0.35"
            />

            {/* Inner Clinical Shield */}
            <path
              d="M160 40 L242 68 V120 C242 155 160 182 160 182 C160 182 78 155 78 120 V68 Z"
              fill="var(--accent-tint)"
              fillOpacity="0.45"
              stroke="var(--secondary)"
              strokeWidth="1.75"
            />

            {/* Merkle Tree / ZK Node-Link Network */}
            {/* Tree Branch Links */}
            <line x1="160" y1="64" x2="114" y2="104" stroke="var(--secondary)" strokeWidth="1.5" strokeOpacity="0.6" />
            <line x1="160" y1="64" x2="206" y2="104" stroke="var(--secondary)" strokeWidth="1.5" strokeOpacity="0.6" />
            <line x1="114" y1="104" x2="94" y2="148" stroke="var(--secondary)" strokeWidth="1.2" strokeOpacity="0.5" strokeDasharray="2 2" />
            <line x1="114" y1="104" x2="134" y2="148" stroke="var(--secondary)" strokeWidth="1.2" strokeOpacity="0.5" />
            <line x1="206" y1="104" x2="186" y2="148" stroke="var(--secondary)" strokeWidth="1.2" strokeOpacity="0.5" />
            <line x1="206" y1="104" x2="226" y2="148" stroke="var(--secondary)" strokeWidth="1.2" strokeOpacity="0.5" strokeDasharray="2 2" />

            {/* Root Node (Group Merkle Root) */}
            <circle cx="160" cy="64" r="10" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2" />
            <circle cx="160" cy="64" r="4" fill="var(--secondary)" />

            {/* Intermediate Verification Nodes */}
            <circle cx="114" cy="104" r="7" fill="var(--surface)" stroke="var(--secondary)" strokeWidth="1.75" />
            <circle cx="114" cy="104" r="2.5" fill="var(--secondary)" />

            <circle cx="206" cy="104" r="7" fill="var(--surface)" stroke="var(--secondary)" strokeWidth="1.75" />
            <circle cx="206" cy="104" r="2.5" fill="var(--secondary)" />

            {/* Participant Leaf Nodes */}
            <circle cx="94" cy="148" r="5" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5" />
            <circle cx="134" cy="148" r="5.5" fill="var(--surface)" stroke="var(--ok)" strokeWidth="1.75" />
            <circle cx="134" cy="148" r="2" fill="var(--ok)" />
            <circle cx="186" cy="148" r="5" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5" />
            <circle cx="226" cy="148" r="5" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5" />

            {/* Subtle Node Halo Glows */}
            <circle cx="160" cy="64" r="17" stroke="var(--secondary)" strokeWidth="1" strokeOpacity="0.25" />
            <circle cx="134" cy="148" r="11" stroke="var(--ok)" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
          </svg>
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
              <div className="stat-card-value">
                {h.value}
              </div>
              <div className="stat-card-note">{h.note}</div>
            </div>
          );
        })}
      </div>

      {/* Role Selection */}
      <div style={{ marginBottom: 8 }}>
        <div className="page-header" style={{ marginBottom: 14 }}>
          <h2 className="page-header-title" style={{ fontSize: 18, marginBottom: 2 }}>
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
                <div className="role-card-cta">
                  <span>{r.cta}</span>
                  <span aria-hidden="true">&rarr;</span>
                </div>
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
                borderRadius: "var(--radius-md)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--secondary)",
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}
              >
                PHASE {s.step}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 8,
                }}
              >
                {s.title}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.55, flex: 1 }}>
                {s.what}
              </p>
              <div>
                <span className="badge badge-info" style={{ fontSize: 10.5 }}>
                  {s.who}
                </span>
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
