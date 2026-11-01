"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDenials,
  getEvents,
  getMonitorSummary,
  getProtocols,
  registerProtocol,
  registerSite,
  type DenialRecord,
  type EnrollmentEvent,
  type ProtocolRow,
} from "../../lib/api";
import {
  IconRefresh,
  IconExternalLink,
  IconAlertTriangle,
  IconCheckCircle,
  IconAlertCircle,
  IconInfo,
  IconFileText,
  IconClipboard,
  IconSlash,
} from "../../components/Icons";

interface Counts {
  accepted: number;
  denied: number;
}

interface MonitorData {
  generatedAt: string;
  observations: { severity: string; message: string }[];
  report?: string;
  totals: Record<string, unknown>;
}

// ── Clean rectangular severity badge (no pill) ────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const cls =
    s === "high" || s === "error" || s === "alert"
      ? "badge-error"
      : s === "medium" || s === "warn"
      ? "badge-warn"
      : s === "info" || s === "low"
      ? "badge-ok"
      : "badge-neutral";
  return <span className={`badge ${cls}`}>{severity.toUpperCase()}</span>;
}

export default function SponsorPage() {
  const [events, setEvents] = useState<EnrollmentEvent[]>([]);
  const [denials, setDenials] = useState<DenialRecord[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [registryToken, setRegistryToken] = useState("");
  const [pId, setPId] = useState("");
  const [pName, setPName] = useState("");
  const [sId, setSId] = useState("");
  const [sName, setSName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  const [sBusy, setSBusy] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ev, dn, pr] = await Promise.all([getEvents(), getDenials(), getProtocols()]);
      setEvents(ev.events);
      setDenials(dn.denials);
      setProtocols(pr.protocols);
      const mm = await getMonitorSummary();
      setMonitor(mm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitProtocol = async () => {
    setPBusy(true);
    setMsg(null);
    try {
      const res = await registerProtocol(pId, pName.trim() || `Protocol ${pId}`, registryToken);
      setMsg({ ok: true, text: `Protocol registered successfully. tx: ${res.txHash}` });
      setPId("");
      setPName("");
      void refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPBusy(false);
    }
  };

  const submitSite = async () => {
    setSBusy(true);
    setMsg(null);
    try {
      const res = await registerSite(sId, sName.trim() || `Site ${sId}`, registryToken);
      setMsg({ ok: true, text: `Site registered successfully. tx: ${res.txHash}` });
      setSId("");
      setSName("");
      void refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSBusy(false);
    }
  };

  const perProtocol = (): { id: string; name?: string; counts: Counts }[] => {
    const byId = new Map<string, { name?: string; counts: Counts }>();
    const bump = (id: string, accepted: boolean) => {
      const e = byId.get(id) ?? { counts: { accepted: 0, denied: 0 } };
      if (accepted) e.counts.accepted += 1;
      else e.counts.denied += 1;
      byId.set(id, e);
    };
    for (const ev of events) bump(String(ev.protocolId), true);
    for (const d of denials) bump(String(d.protocol_id), false);
    for (const p of protocols) {
      const id = String(p.id);
      const row = byId.get(id) ?? { counts: { accepted: 0, denied: 0 } };
      byId.set(id, { ...row, name: p.name });
    }
    return [...byId.entries()].map(([id, v]) => ({ id, name: v.name, counts: v.counts }));
  };

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-header-title">Sponsor / IRB Dashboard</h1>
          <p className="page-header-subtitle">Protocol management, enrollment audit and integrity monitoring</p>
        </div>
        <div className="banner error">
          <div className="banner-icon">
            <IconAlertTriangle size={18} />
          </div>
          <div className="banner-body">
            <strong>Relayer &amp; Network Service Unreachable</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>
              Unable to communicate with relayer service (port 4002) or the underlying blockchain.
            </p>
            <pre>{error}</pre>
          </div>
        </div>
      </div>
    );
  }

  const pp = perProtocol();
  const totalAccepted = events.length;
  const totalDenied = denials.length;
  const totalProtocols = protocols.length;

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-header-title">Sponsor / IRB Governance Dashboard</h1>
          <p className="page-header-subtitle">
            Oversee protocol registrations, multi-site enrollment audits, deterministic integrity flags, and relayer denial attestations.
          </p>
        </div>
        <button
          className="btn-secondary btn-sm"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh telemetry data"
        >
          <IconRefresh size={13} />
          <span>{refreshing ? "Refreshing…" : "Refresh Telemetry"}</span>
        </button>
      </div>

      {/* KPI Overview Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-label">
            <IconCheckCircle size={13} />
            <span>Accepted Enrollments</span>
          </div>
          <div className="stat-card-value" style={{ color: "var(--ok)" }}>{totalAccepted}</div>
          <div className="stat-card-note">On-chain verified events</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            <IconSlash size={13} />
            <span>Denied Attempts</span>
          </div>
          <div className="stat-card-value" style={{ color: totalDenied > 0 ? "var(--warn)" : "var(--ink)" }}>
            {totalDenied}
          </div>
          <div className="stat-card-note">Signed relayer attestations</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            <IconFileText size={13} />
            <span>Active Protocols</span>
          </div>
          <div className="stat-card-value">{totalProtocols}</div>
          <div className="stat-card-note">Registered on smart contract</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            <IconAlertTriangle size={13} />
            <span>Integrity Flags</span>
          </div>
          <div
            className="stat-card-value"
            style={{
              color: monitor && monitor.observations.length > 0 ? "var(--warn)" : "var(--ok)",
            }}
          >
            {monitor ? monitor.observations.length : "—"}
          </div>
          <div className="stat-card-note">Rule-based anomaly items</div>
        </div>
      </div>

      {/* Registry Authorization Token */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Registry Authorization</h2>
            <p className="card-subtitle">
              Sponsor token required for privileged write transactions (protocol and site registration). Stored strictly in component state.
            </p>
          </div>
        </div>
        <fieldset style={{ marginBottom: 0 }}>
          <label htmlFor="registry-token">Sponsor / Registry Bearer Token</label>
          <input
            id="registry-token"
            type="password"
            value={registryToken}
            onChange={(e) => setRegistryToken(e.target.value)}
            autoComplete="off"
            placeholder="Bearer token for contract owner access"
          />
        </fieldset>
      </div>

      {/* Protocol & Site registration row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 18,
          marginBottom: 18,
        }}
      >
        {/* Register protocol */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Register Protocol</h2>
              <p className="card-subtitle">
                Computes on-chain scope hash: <code>keccak256(&quot;TrialFence-Protocol-v1:&quot;, protocolId)</code>.
              </p>
            </div>
          </div>
          <fieldset>
            <label htmlFor="protocol-id">Protocol Identifier (uint256)</label>
            <input
              id="protocol-id"
              value={pId}
              onChange={(e) => setPId(e.target.value.trim())}
              placeholder="e.g. 1"
            />
          </fieldset>
          <fieldset>
            <label htmlFor="protocol-name">Protocol Display Title</label>
            <input
              id="protocol-name"
              value={pName}
              onChange={(e) => setPName(e.target.value.trim())}
              placeholder="e.g. TrialFence-Phase-1"
            />
          </fieldset>
          <button
            className="btn-primary"
            onClick={submitProtocol}
            disabled={!pId || pBusy}
          >
            {pBusy ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />
                <span>Registering Protocol…</span>
              </>
            ) : "Register Protocol"}
          </button>
        </div>

        {/* Register site */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Register Clinical Site</h2>
              <p className="card-subtitle">
                Whitelists trial location ID embedded as public signal in volunteer zero-knowledge proofs.
              </p>
            </div>
          </div>
          <fieldset>
            <label htmlFor="site-id">Site Identifier (uint256)</label>
            <input
              id="site-id"
              value={sId}
              onChange={(e) => setSId(e.target.value.trim())}
              placeholder="e.g. 1"
            />
          </fieldset>
          <fieldset>
            <label htmlFor="site-name">Facility / Site Name</label>
            <input
              id="site-name"
              value={sName}
              onChange={(e) => setSName(e.target.value.trim())}
              placeholder="e.g. North Harbor Clinic"
            />
          </fieldset>
          <button
            className="btn-primary"
            onClick={submitSite}
            disabled={!sId || sBusy}
          >
            {sBusy ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />
                <span>Registering Site…</span>
              </>
            ) : "Register Site"}
          </button>
        </div>
      </div>

      {/* Registration result banner */}
      {msg && (
        <div className={`banner ${msg.ok ? "ok" : "error"}`} role="alert" aria-live="polite">
          <div className="banner-icon">
            {msg.ok ? <IconCheckCircle size={18} /> : <IconAlertCircle size={18} />}
          </div>
          <div className="banner-body">
            <strong>{msg.ok ? "Transaction Execution Completed" : "Registry Operation Failed"}</strong>
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
              {msg.text}
            </div>
          </div>
        </div>
      )}

      {/* Registered protocols table */}
      {protocols.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Configured Protocols</h2>
              <p className="card-subtitle">Protocols and computed scope hashes active on the contract</p>
            </div>
            <span className="badge badge-info">{protocols.length} Protocols</span>
          </div>
          <div className="table-wrap">
            <table aria-label="Registered protocols table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>ID</th>
                  <th>Protocol Name</th>
                  <th>Scope Hash (Keccak256)</th>
                </tr>
              </thead>
              <tbody>
                {protocols.map((p) => (
                  <tr key={p.id}>
                    <td><span className="badge badge-neutral">ID {p.id}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.name ?? "—"}</td>
                    <td>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                        {p.scope ? p.scope : "—"}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-protocol summary counts */}
      {pp.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Enrollment Distribution per Protocol</h2>
              <p className="card-subtitle">Aggregate accepted and denied rates across sites</p>
            </div>
          </div>
          <div className="table-wrap">
            <table aria-label="Per-protocol breakdown">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>ID</th>
                  <th>Protocol Name</th>
                  <th>Accepted</th>
                  <th>Gate Denials</th>
                </tr>
              </thead>
              <tbody>
                {pp.map((p) => (
                  <tr key={p.id}>
                    <td><span className="badge badge-neutral">ID {p.id}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.name ?? "—"}</td>
                    <td>
                      <span className="badge badge-ok">{p.counts.accepted} Accepted</span>
                    </td>
                    <td>
                      <span className={`badge ${p.counts.denied > 0 ? "badge-warn" : "badge-neutral"}`}>
                        {p.counts.denied} Denied
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enrollment audit table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">On-Chain Enrollment Audit Log</h2>
            <p className="card-subtitle">
              Public blockchain events emitted by TrialFence.sol. Identifies accepted scope, nullifier, and block number.
            </p>
          </div>
          <span className="badge badge-ok">{events.length} Events</span>
        </div>

        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconFileText size={20} />
            </div>
            <p className="empty-state-title">No Enrollment Events Recorded</p>
            <p className="empty-state-body">
              Verified volunteer proofs will record on-chain transactions and appear in this audit log.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table aria-label="On-chain enrollment audit log">
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Site</th>
                  <th>Nullifier Hash</th>
                  <th>Block</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-neutral">ID {e.protocolId}</span></td>
                    <td><span className="badge badge-neutral">Site {e.siteId}</span></td>
                    <td>
                      <code
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                        title={e.nullifier}
                      >
                        {e.nullifier.slice(0, 16)}…
                      </code>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>#{e.blockNumber}</td>
                    <td>
                      {e.explorerUrl ? (
                        <a
                          href={e.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e.txHash.slice(0, 12)}…</span>
                          <IconExternalLink size={11} />
                        </a>
                      ) : (
                        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                          {e.txHash.slice(0, 12)}… <span className="badge badge-neutral" style={{ fontSize: 9 }}>local</span>
                        </code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Integrity monitor */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Trial Integrity Monitoring</h2>
            <p className="card-subtitle">
              Deterministic rule-based anomaly detection evaluated from event logs and denial records.
              If configured, LLM narrative synthesis is distinguished separately.
            </p>
          </div>
          {monitor && (
            <span className="badge badge-neutral" style={{ flexShrink: 0 }}>
              Updated {new Date(monitor.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {monitor ? (
          <>
            {monitor.observations.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px" }}>
                <div className="empty-state-icon">
                  <IconCheckCircle size={20} />
                </div>
                <p className="empty-state-title">No Integrity Anomalies Detected</p>
                <p className="empty-state-body">
                  Rule-based cross-site duplication and frequency checks report normal trial parameters.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {monitor.observations.map((o, i) => {
                  const bannerClass =
                    o.severity === "high" || o.severity === "error" || o.severity === "alert"
                      ? "error"
                      : o.severity === "medium" || o.severity === "warn"
                      ? "warn"
                      : "ok";
                  return (
                    <div key={i} className={`banner ${bannerClass}`} style={{ margin: 0 }}>
                      <div className="banner-icon">
                        <SeverityBadge severity={o.severity} />
                      </div>
                      <div className="banner-body">{o.message}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {monitor.report && (
              <div>
                <hr className="card-divider" />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="badge badge-info">AI Narrative Analysis</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Automated summary produced via LLM analysis of current registry records.
                  </span>
                </div>
                <div
                  style={{
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "var(--ink)",
                  }}
                >
                  {monitor.report}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--muted)" }}>
              Diagnostic Aggregate:{" "}
              {Object.entries(monitor.totals)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" · ")}
            </div>
          </>
        ) : (
          <div className="loading-state">
            <div className="spinner" aria-hidden="true" />
            <span>Analyzing trial telemetry…</span>
          </div>
        )}
      </div>

      {/* Relayer-signed denial records */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Relayer-Signed Denial Records</h2>
            <p className="card-subtitle">
              Cryptographically signed off-chain attestations created when preflight or on-chain evaluation detects duplicate nullifiers.
            </p>
          </div>
          <span className={`badge ${denials.length > 0 ? "badge-warn" : "badge-neutral"}`}>
            {denials.length} Denial Attestations
          </span>
        </div>

        {denials.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconSlash size={20} />
            </div>
            <p className="empty-state-title">No Denial Records</p>
            <p className="empty-state-body">
              Signed relayer rejection records will be indexed here if a duplicate enrollment attempt occurs.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table aria-label="Relayer denial records table">
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Site</th>
                  <th>Gate Reason</th>
                  <th>Relayer Signer Address</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {denials.map((d, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-neutral">ID {d.protocol_id}</span></td>
                    <td><span className="badge badge-neutral">Site {d.site_id}</span></td>
                    <td>
                      <span
                        className={`badge ${
                          d.reason === "DUPLICATE" ? "badge-error" : "badge-warn"
                        }`}
                      >
                        {d.reason}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                        {d.signer.slice(0, 16)}…
                      </code>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(d.created_at).toLocaleString()}
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
