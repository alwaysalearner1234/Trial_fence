"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getIssuerStatus,
  getMembers,
  registerIdentity,
  type MemberRow,
} from "../../lib/api";

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
      const res = await registerIdentity(commitment, {
        docType,
        documentNumber,
        fullName,
      }, issuerToken);
      setOutcome({ status: "ok", message: `Membership issued to group member #${res.leafIndex}. Transaction: ${res.txHash}` });
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutcome({
        status: msg.includes("DUPLICATE")
          ? "duplicate"
          : msg.includes("ALREADY")
            ? "duplicate"
            : "error",
        message: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="banner error">
        Cannot reach the issuer. Is it running on 4001? <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div>
      <section className="card">
        <h2>Issuer status</h2>
        <div className="grid">
          <div className="stat">
            <div className="label">Chain</div>
            <div className="value">{String(status?.chainId ?? "…")}</div>
          </div>
          <div className="stat">
            <div className="label">Contract</div>
            <div className="value mono">{String(status?.trialFence ?? "…").slice(0, 14)}…</div>
          </div>
          <div className="stat">
            <div className="label">Members</div>
            <div className="value">{String(status?.memberCount ?? members.length)}</div>
          </div>
          <div className="stat">
            <div className="label">Is issuer</div>
            <div className="value">{String(status?.isIssuer ?? "…")}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Test identity check &amp; issue membership</h2>
        <p className="hint">
          Use fictional test data only. This demonstrates the issuer boundary, not government-ID
          verification. The issuer stores a keyed digest and the public commitment, and can link those
          two records. Raw document numbers and names are not stored. The participant secret stays on the device.
        </p>

        <fieldset>
          <label>Commitment (copy it from the volunteer browser)</label>
          <input
            value={commitment}
            onChange={(e) => setCommitment(e.target.value.trim())}
            placeholder="0x… / decimal commitment"
          />
        </fieldset>
        <fieldset>
          <label>Issuer access token (if required by this deployment)</label>
          <input type="password" autoComplete="off" value={issuerToken} onChange={(e) => setIssuerToken(e.target.value)} />
        </fieldset>
        <div className="grid">
          <fieldset>
            <label>Document type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <label>Document number</label>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value.trim())}
              placeholder="e.g. AB1234567 (demo data only)"
            />
          </fieldset>
          <fieldset>
            <label>Full name (displayed only, never stored)</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value.trim())}
              placeholder="e.g. Jane Doe"
            />
          </fieldset>
        </div>

        {outcome && (
          <div className={`banner ${outcome.status === "ok" ? "ok" : "error"}`}>
            <strong>
              {outcome.status === "ok"
                ? "Membership issued."
                : outcome.status === "duplicate"
                  ? "Identity already registered with this credential."
                  : "Error."}
            </strong>
            <div className="mono">{outcome.message}</div>
            {outcome.status === "duplicate" && (
              <span>
                {" "}
                The coordinator-facing registry correctly refused to register the same document twice.{" "}
                <Link href="/volunteer">Back to volunteer →</Link>
              </span>
            )}
          </div>
        )}

        <button onClick={submit} disabled={busy || !commitment || !documentNumber}>
          {busy ? "Issuing…" : "Verify ID & issue membership"}
        </button>
      </section>

      <section className="card">
        <h2>Group members</h2>
        <p className="hint">
          Public commitments in the shared group, also read by volunteer browsers to build proofs.
          Participant identity secrets are never here.
        </p>
        <table>
          <thead>
            <tr>
              <th>Index</th>
              <th>Commitment</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.index}>
                <td>{m.index}</td>
                <td className="mono">{m.commitment}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="muted">No members yet.</p>}
      </section>
    </div>
  );
}
