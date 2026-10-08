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

export default function SponsorPage() {
  const [events, setEvents] = useState<EnrollmentEvent[]>([]);
  const [denials, setDenials] = useState<DenialRecord[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pId, setPId] = useState("");
  const [pName, setPName] = useState("");
  const [sId, setSId] = useState("");
  const [sName, setSName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ev, dn, pr] = await Promise.all([getEvents(), getDenials(), getProtocols()]);
      setEvents(ev.events);
      setDenials(dn.denials);
      setProtocols(pr.protocols);
      const mm = await getMonitorSummary();
      setMonitor(mm);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitProtocol = async () => {
    setMsg(null);
    try {
      const res = await registerProtocol(pId, pName.trim() || `Protocol ${pId}`);
      setMsg({ ok: true, text: `Protocol registered. tx: ${res.txHash}` });
      setPId("");
      setPName("");
      void refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const submitSite = async () => {
    setMsg(null);
    try {
      const res = await registerSite(sId, sName.trim() || `Site ${sId}`);
      setMsg({ ok: true, text: `Site registered. tx: ${res.txHash}` });
      setSId("");
      setSName("");
      void refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
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
    for (const ev of events) bump(ev.protocolId, true);
    for (const d of denials) bump(d.protocol_id, false);
    for (const p of protocols) {
      if (!byId.has(p.id)) byId.set(p.id, { name: p.name, counts: { accepted: 0, denied: 0 } });
    }
    return [...byId.entries()].map(([id, v]) => ({ id, name: v.name, counts: v.counts }));
  };

  if (error) {
    return (
      <div className="banner error">
        Cannot reach the relayer (port 4002) or the chain. <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div>
      <section className="card">
        <h2>Register a protocol</h2>
        <p className="hint">Only the contract owner may register protocols &amp; sites.</p>
        <div className="grid">
          <fieldset>
            <label>Protocol ID (uint256)</label>
            <input value={pId} onChange={(e) => setPId(e.target.value.trim())} placeholder="1" />
          </fieldset>
          <fieldset>
            <label>Display name</label>
            <input value={pName} onChange={(e) => setPName(e.target.value.trim())} placeholder="TrialFence-01" />
          </fieldset>
        </div>
        <button onClick={submitProtocol} disabled={!pId}>
          Register protocol
        </button>
      </section>

      <section className="card">
        <h2>Register a site</h2>
        <div className="grid">
          <fieldset>
            <label>Site ID (uint256)</label>
            <input value={sId} onChange={(e) => setSId(e.target.value.trim())} placeholder="1" />
          </fieldset>
          <fieldset>
            <label>Display name</label>
            <input value={sName} onChange={(e) => setSName(e.target.value.trim())} placeholder="North Harbor Clinic" />
          </fieldset>
        </div>
        <button onClick={submitSite} disabled={!sId}>
          Register site
        </button>
      </section>

      {msg && (
        <div className={`banner ${msg.ok ? "ok" : "error"}`}>
          {msg.ok ? "Done." : "Failed."} <span className="mono">{msg.text}</span>
        </div>
      )}

      <section className="card">
        <div className="spread">
          <h2>Enrollment audit (on-chain)</h2>
          <button className="secondary" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        <p className="hint">
          Only public hashes are on the chain: a scope, a nullifier and an enrollment count. A participant
          can appear once per protocol across all sites.
        </p>

        <table>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Site</th>
              <th>Accepted</th>
              <th>Block</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td>{e.protocolId}</td>
                <td>{e.siteId}</td>
                <td>
                  <span className="badge ok">
                    {e.nullifier.slice(0, 10)}… nid
                  </span>
                </td>
                <td>{e.blockNumber}</td>
                <td>
                  <a href={e.explorerUrl} target="_blank" rel="noreferrer">
                    {e.txHash.slice(0, 12)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="muted">No enrollments yet.</p>}
      </section>

      <section className="card">
        <h2>Per-protocol counts</h2>
        <table>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Name</th>
              <th>Accepted</th>
              <th>Denied</th>
            </tr>
          </thead>
          <tbody>
            {perProtocol().map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name ?? "—"}</td>
                <td>
                  <span className="badge ok">{p.counts.accepted}</span>
                </td>
                <td>
                  <span className={`badge ${p.counts.denied > 0 ? "warn" : "info"}`}>{p.counts.denied}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Signed denial records</h2>
        <p className="hint">
          When a zk-proof is rejected on-chain, the relayer saves a signed, PII-free record so the sponsor
          can audit refusal reasons without seeing any identity material.
        </p>
        <table>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Site</th>
              <th>Reason</th>
              <th>Signed by</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {denials.map((d, i) => (
              <tr key={i}>
                <td>{d.protocol_id}</td>
                <td>{d.site_id}</td>
                <td>
                  <span className={`badge ${d.reason === "DUPLICATE" ? "alert" : "warn"}`}>{d.reason}</span>
                </td>
                <td className="mono">{d.signer.slice(0, 14)}…</td>
                <td>{new Date(d.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {denials.length === 0 && <p className="muted">No denials recorded.</p>}
      </section>

      <section className="card">
        <h2>AI integrity monitor</h2>
        <p className="hint">
          Deterministic anomaly flags computed from public events + signed denials. If{" "}
          <span className="mono">OPENAI_API_KEY</span> is set, an LLM narrative is added.
        </p>
        {monitor ? (
          <>
            {monitor.observations.map((o, i) => (
              <div key={i} className={`banner ${o.severity === "info" ? "ok" : o.severity}`}>
                <span className={`badge ${o.severity}`}>{o.severity}</span> {o.message}
              </div>
            ))}
            {monitor.report && (
              <div className="banner">
                <strong>LLM narrative</strong>
                <p>{monitor.report}</p>
              </div>
            )}
            <p className="muted">
              Generated {new Date(monitor.generatedAt).toLocaleTimeString()} · denial rate{" "}
              {JSON.stringify(monitor.totals)}
            </p>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>
    </div>
  );
}