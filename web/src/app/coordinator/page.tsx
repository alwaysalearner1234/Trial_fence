"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getIssuerStatus,
  getMembers,
  registerIdentity,
  type MemberRow,
} from "../../lib/api";
import {
  IconRefresh,
  IconAlertTriangle,
  IconCheckCircle,
  IconAlertCircle,
  IconInfo,
  IconUsers,
  IconGlobe,
  IconDatabase,
  IconShieldCheck,
} from "../../components/Icons";

const DOC_TYPES = ["passport", "national-id", "driver-license"];

interface Outcome {
  status: "ok" | "duplicate" | "error";
  message: string;
}

export default function CoordinatorPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [commitment, setCommitment] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [documentNumber, setDocumentNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [issuerToken, setIssuerToken] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [s, m] = await Promise.all([getIssuerStatus(), getMembers()]);
      setStatus(s);
      setMembers(m.members);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    // Prefill the commitment from the identity stored by the Volunteer page (same browser).
    const saved = localStorage.getItem("tf_identity_v1");
    if (saved) {
      try {
        void import("@semaphore-protocol/core").then(({ Identity }) => {
          const id = Identity.import(saved);
          setCommitment(id.commitment.toString());
        }).catch(() => { /* An invalid local identity can be recreated on the volunteer page. */ });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const submit = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await registerIdentity(
        commitment,
        { docType, documentNumber, fullName },
        issuerToken
      );
      setOutcome({
        status: "ok",
        message: `Membership issued to group member #${res.leafIndex}. Transaction: ${res.txHash}`,
      });
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutcome({
        status:
          msg.includes("DUPLICATE") || msg.includes("ALREADY") ? "duplicate" : "error",
        message: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-header-title">Site Coordinator</h1>
          <p className="page-header-subtitle">Identity verification and group membership issuance</p>
        </div>
        <div className="banner error">
          <div className="banner-icon">
            <IconAlertTriangle size={18} />
          </div>
          <div className="banner-body">
            <strong>Issuer Service Unavailable</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>
              Unable to communicate with the credential issuer service on port <code>4001</code>.
            </p>
            <pre>{error}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-header-title">Site Coordinator Workspace</h1>
        <p className="page-header-subtitle">
          Verify participant identity against demo criteria and issue membership into the Semaphore Merkle group.
        </p>
      </div>

      {/* Demo disclaimer */}
      <div className="banner info" style={{ marginBottom: 20, marginTop: 0 }}>
        <div className="banner-icon">
          <IconInfo size={18} />
        </div>
        <div className="banner-body">
          <strong>Demonstration Environment Notice:</strong> This workflow illustrates the off-chain credential
          issuer boundary using fictional test attributes. It does not connect to real government databases.
          The issuer computes a one-way digest and inserts the participant&apos;s public commitment into the group;
          raw identification numbers and participant names are never written to the blockchain.
        </div>
      </div>

      {/* Issuer connection status */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Issuer Service Status</h2>
            <p className="card-subtitle">Telemetry from credential issuer instance (port 4001)</p>
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={() => void refresh()}
            aria-label="Refresh issuer connection"
          >
            <IconRefresh size={13} />
            <span>Refresh</span>
          </button>
        </div>

        {status ? (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-label">
                <IconGlobe size={13} />
                <span>Chain ID</span>
              </div>
              <div className="stat-card-value">{String(status.chainId ?? "—")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconDatabase size={13} />
                <span>Contract</span>
              </div>
              <div className="stat-card-value mono">{String(status.trialFence ?? "—").slice(0, 14)}…</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconUsers size={13} />
                <span>Group Members</span>
              </div>
              <div className="stat-card-value">{String(status.memberCount ?? members.length)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconShieldCheck size={13} />
                <span>Issuer Authority</span>
              </div>
              <div className="stat-card-value" style={{ marginTop: 4 }}>
                {String(status.isIssuer) === "true" ? (
                  <span className="badge badge-ok">Confirmed</span>
                ) : (
                  <span className="badge badge-warn">{String(status.isIssuer ?? "Pending")}</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="loading-state">
            <div className="spinner" aria-hidden="true" />
            <span>Connecting to issuer service…</span>
          </div>
        )}
      </div>

      {/* Identity verification form */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Participant Identity Verification &amp; Credential Issuance</h2>
            <p className="card-subtitle">
              Verify fictional demo credentials and commit the participant&apos;s public key to the on-chain Merkle tree.
            </p>
          </div>
        </div>

        <fieldset>
          <label htmlFor="commitment-input">
            Participant Public Commitment
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
              (copied from volunteer browser)
            </span>
          </label>
          <input
            id="commitment-input"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value.trim())}
            placeholder="Decimal or 0x… Semaphore commitment"
          />
        </fieldset>

        <fieldset>
          <label htmlFor="issuer-token">
            Issuer Authorization Token
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
              (optional Bearer token if required by deployment)
            </span>
          </label>
          <input
            id="issuer-token"
            type="password"
            autoComplete="off"
            value={issuerToken}
            onChange={(e) => setIssuerToken(e.target.value)}
            placeholder="Optional authorization token"
          />
        </fieldset>

        <div
          style={{
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}
          >
            Fictional Demonstration Document Fields
          </div>
          <div className="field-group">
            <fieldset style={{ margin: 0 }}>
              <label htmlFor="doc-type">Document Classification</label>
              <select
                id="doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </fieldset>
            <fieldset style={{ margin: 0 }}>
              <label htmlFor="doc-number">
                Test Document Identifier
                <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 400 }}>(fictional only)</span>
              </label>
              <input
                id="doc-number"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value.trim())}
                placeholder="e.g. AB1234567"
              />
            </fieldset>
            <fieldset style={{ margin: 0 }}>
              <label htmlFor="full-name">
                Participant Name
                <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 400 }}>(session only, never persisted)</span>
              </label>
              <input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value.trim())}
                placeholder="e.g. Jane Doe"
              />
            </fieldset>
          </div>
        </div>

        {/* Outcome banner */}
        {outcome && (
          <div
            className={`banner ${outcome.status === "ok" ? "ok" : outcome.status === "duplicate" ? "warn" : "error"}`}
            role="alert"
            aria-live="assertive"
            style={{ marginBottom: 16 }}
          >
            <div className="banner-icon">
              {outcome.status === "ok" ? (
                <IconCheckCircle size={18} />
              ) : outcome.status === "duplicate" ? (
                <IconAlertTriangle size={18} />
              ) : (
                <IconAlertCircle size={18} />
              )}
            </div>
            <div className="banner-body">
              <strong>
                {outcome.status === "ok"
                  ? "Membership Successfully Issued"
                  : outcome.status === "duplicate"
                  ? "Duplicate Credential Detected"
                  : "Credential Issuance Failed"}
              </strong>
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                {outcome.message}
              </div>
              {outcome.status === "duplicate" && (
                <div style={{ marginTop: 8 }}>
                  The issuer boundary correctly rejected re-registration of an already enrolled document.{" "}
                  <Link href="/volunteer">Return to Volunteer &rarr;</Link>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={submit}
          disabled={busy || !commitment || !documentNumber}
        >
          {busy ? (
            <>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />
              <span>Verifying &amp; Issuing…</span>
            </>
          ) : (
            "Verify ID & Issue Group Membership"
          )}
        </button>
      </div>

      {/* Group members table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Verified Group Commitments</h2>
            <p className="card-subtitle">
              Public Merkle tree leaves available to volunteer clients for zero-knowledge proof generation.
            </p>
          </div>
          <span className="badge badge-info" aria-label={`${members.length} members`}>
            {members.length} Members
          </span>
        </div>

        {members.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconUsers size={20} />
            </div>
            <p className="empty-state-title">No Group Members Recorded</p>
            <p className="empty-state-body">
              Issue the first participant credential using the form above to initialize the group Merkle tree.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table aria-label="Group members table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Leaf Index</th>
                  <th>Public Identity Commitment</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.index}>
                    <td>
                      <span className="badge badge-neutral">#{m.index}</span>
                    </td>
                    <td>
                      <code
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          wordBreak: "break-all",
                          color: "var(--ink)",
                        }}
                      >
                        {m.commitment}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
