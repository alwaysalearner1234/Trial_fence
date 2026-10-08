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
      const scope = scopeFor(BigInt(protocolId));
      const proof = await generateProof(identity, group, BigInt(siteId), scope);

      setProofBrief(
        `root=${BigInt(proof.merkleTreeRoot).toString(16)}\nnullifier=${BigInt(proof.nullifier).toString(
          16
        )}\nscope=${scope.toString(16)}\nsiteId=${BigInt(proof.message).toString()}`
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

  if (error) {
    return (
      <div className="banner error">
        Failed to connect to the backend. Start `npm run node -w contracts`, deploy the contract, and run
        the issuer + relayer servers first.
        <pre>{error}</pre>
      </div>
    );
  }

  if (step.id === "init" || !config || !identity) {
    return (
      <div className="card">
        <h2>Volunteer enrollment</h2>
        <p className="hint">
          Loading registry config, group membership and protocol/site lists from the backend…
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="card">
        <div className="spread">
          <h2>1 · Your anonymous identity</h2>
          <button className="secondary" onClick={resetIdentity}>
            Generate a new one
          </button>
        </div>
        <p className="hint">
          Stored only in this browser. The trapdoor and nullifier are kept here; only the{" "}
          <strong>commitment</strong> is ever shared — and even that is kept off-chain.
        </p>
        <div className="stat">
          <div className="label">Commitment (public, shared with issuer)</div>
          <div className="value mono">{commitment}</div>
        </div>
        {isVerifiedMember ? (
          <div className="banner ok">Your commitment is a member of the verified enrollment group.</div>
        ) : (
          <div className="banner warn">
            Not a member yet. Take your commitment to the <Link href="/coordinator">coordinator</Link>, who
            will verify your physical ID and add you to the group.
          </div>
        )}
      </section>

      <section className="card">
        <h2>2 · Where are you enrolling?</h2>
        <p className="hint">
          The proof binds you to the chosen protocol&apos;s <em>scope</em> and a specific site. Enrolling in
          the same protocol at a second site will be caught by the duplicate-nullifier gate.
        </p>
        <div className="grid">
          <fieldset>
            <label>Protocol</label>
            <select value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
              {protocols.length === 0 && <option value="">No protocols registered yet</option>}
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id} · id {p.id}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <label>Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.length === 0 && <option value="">No sites registered yet</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id} · id {s.id}
                </option>
              ))}
            </select>
          </fieldset>
        </div>
      </section>

      <section className="card">
        <h2>3 · Prove &amp; enroll</h2>
        <p className="hint">
          Generates a Semaphore zk-proof in your browser (first run downloads ~30&nbsp;MB of snark files) and
          submits it to the relayer. Nothing about your identity is revealed.
        </p>

        {step.id === "ready" && (
          <button onClick={runEnrollment} disabled={!isVerifiedMember || !protocolId || !siteId}>
            Generate proof &amp; submit enrollment
          </button>
        )}

        {step.id === "proof" && (
          <p className="banner">
            <span className="step-dot active" /> Generating zk-proof… this can take a few seconds.
          </p>
        )}

        {step.id === "submit" && (
          <p className="banner">
            <span className="step-dot active" /> Proof done — submitting to relayer → on-chain.
          </p>
        )}

        {proofBrief && (
          <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
            {proofBrief}
          </pre>
        )}

        {step.id === "result" && result && (
          <>
            <div className={`banner ${step.ok ? "ok" : "error"}`}>
              <strong>{step.ok ? "Enrollment accepted." : "Enrollment denied."}</strong>
              {result.reason && <div>Reason: {result.reason}</div>}
              {result.staticCallError && <div>Rejection: {result.staticCallError}</div>}
              {result.signedRecord && (
                <pre>
                  Signed denial record:{" "}
                  {`${result.signedRecord.message.slice(0, 24)}… · sig ${result.signedRecord.signature.slice(
                    0,
                    24
                  )}… · ${result.signedRecord.signer}`}
                </pre>
              )}
            </div>
            {result.txHash && config.explorerUrl && (
              <p>
                <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                  View transaction on the explorer →
                </a>
              </p>
            )}
            {step.ok === false && (
              <button onClick={runEnrollment} style={{ marginTop: 8 }}>
                Try again (fresh proof, same identity)
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Why the nullifier matters</h2>
        <p className="hint">
          The nullifier is derived from your secret and the protocol&apos;s scope. The contract stores it once
          per protocol — a second attempt anywhere else in the network is denied even though the relayer
          cannot link the two proofs to you.
        </p>
      </section>
    </div>
  );
}