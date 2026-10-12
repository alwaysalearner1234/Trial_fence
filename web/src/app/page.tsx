import Link from "next/link";

const actors = [
  {
    href: "/volunteer",
    title: "I am a study volunteer",
    body: "Generate an anonymous Semaphore identity in your browser, prove (without revealing it) that you are the verified member of the trial, and enroll at a participating site.",
    cta: "Enroll with a ZK proof",
  },
  {
    href: "/coordinator",
    title: "I am a site coordinator",
    body: "Use fictional identity data to demonstrate a repeat-issuance check. The issuer sees the public commitment and adds it to the group; the participant secret stays on the device.",
    cta: "Verify & issue membership",
  },
  {
    href: "/sponsor",
    title: "I am the sponsor / IRB",
    body: "Register protocols and sites, audit accepted enrollment events on-chain and relayer-signed denials off-chain, and review integrity flags.",
    cta: "Audit the registry",
  },
];

export default function Home() {
  return (
    <div>
      <section className="card">
        <h2>Who is the gate for?</h2>
        <p className="hint">
          The same verified identity can enroll once per protocol across participating sites.
          This demo uses test identity data. Public commitments, proofs and protocol-scoped nullifiers
          reach the chain; names and raw documents do not. The issuer remains a trusted boundary.
        </p>
        <div className="grid">
          <div className="stat">
            <div className="label">Membership</div>
            <div className="value">1 verified group</div>
          </div>
          <div className="stat">
            <div className="label">Privacy</div>
            <div className="value">0 PII on-chain</div>
          </div>
          <div className="stat">
            <div className="label">Bindings</div>
            <div className="value">scope + siteId</div>
          </div>
          <div className="stat">
            <div className="label">Duplicates</div>
            <div className="value">nullifier-gated</div>
          </div>
        </div>
      </section>

      <section className="grid">
        {actors.map((a) => (
          <div className="card" key={a.href} style={{ marginBottom: 0 }}>
            <h2>{a.title}</h2>
            <p className="hint">{a.body}</p>
            <Link className="button" href={a.href}>
              {a.cta}
            </Link>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>How the proof works</h2>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>What happens</th>
              <th>Who can see it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1. Identity</td>
              <td>Browser generates a Semaphore v4 identity secret and public commitment.</td>
              <td>Only the volunteer</td>
            </tr>
            <tr>
              <td>2. Verification</td>
              <td>Issuer checks test identifiers for repeat issuance and adds the public commitment to the group.</td>
              <td>Issuer sees test input; group commitments are public.</td>
            </tr>
            <tr>
              <td>3. Proof</td>
              <td>Browser builds a membership proof bound to this protocol&apos;s scope and site.</td>
              <td>Secret stays in browser; proof and public inputs go to the relayer.</td>
            </tr>
            <tr>
              <td>4. Enroll</td>
              <td>The relayer calls the smart contract. A duplicate nullifier is rejected; denials are signed.</td>
              <td>Accepted events are public; relayer-signed denials are off-chain.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
