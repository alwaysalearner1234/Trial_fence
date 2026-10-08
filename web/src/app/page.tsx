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
    body: "Verify a volunteer's physical ID against the central registry. Membership is granted, but your site never sees the anonymous identity that later proves enrollment.",
    cta: "Verify & issue membership",
  },
  {
    href: "/sponsor",
    title: "I am the sponsor / IRB",
    body: "Register protocols and sites, audit public enrollment and signed denial events on-chain, and read the AI anomaly summary — all fully de-identified.",
    cta: "Audit the registry",
  },
];

export default function Home() {
  return (
    <div>
      <section className="card">
        <h2>Who is the gate for?</h2>
        <p className="hint">
          A clinical trial participant cannot enroll in the same protocol at two sites without being detected —
          while their identity stays mathematically hidden. The coordinator verifies physical ID documents;
          only an unlinkable zk-proof ever reaches the chain.
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
              <td>Browser generates a Semaphore identity (trapdoor + nullifier + commitment).</td>
              <td>Only the volunteer</td>
            </tr>
            <tr>
              <td>2. Verification</td>
              <td>Coordinator checks a physical ID against the registry and adds the volunteer&apos;s commitment to the membership group.</td>
              <td>Registry staff (raw ID doc)</td>
            </tr>
            <tr>
              <td>3. Proof</td>
              <td>Browser builds a zk-proof: <em>“I am a member of the group, this protocol&apos;s scope, at this site”</em> — leaking nothing else.</td>
              <td>Only the volunteer</td>
            </tr>
            <tr>
              <td>4. Enroll</td>
              <td>The relayer calls the smart contract. A duplicate nullifier is rejected; denials are signed.</td>
              <td>Public, but only hashes</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}