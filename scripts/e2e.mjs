// TrialFence end-to-end smoke test.
// Requires: hardhat node running, contract deployed (deployments/localhost.json),
// issuer (4001) + relayer (4002) running. Run:  node scripts/e2e.mjs
import { Identity, Group, generateProof } from "@semaphore-protocol/core";
import { solidityPackedKeccak256, verifyMessage } from "ethers";

const ISSUER = process.env.ISSUER_URL ?? "http://127.0.0.1:4001";
const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:4002";

const SCOPE_DOMAIN = "TrialFence-Protocol-v1:";
const scopeFor = (protocolId) =>
  BigInt(solidityPackedKeccak256(["string", "uint256"], [SCOPE_DOMAIN, BigInt(protocolId).toString()]));

let failures = 0;
const check = (label, cond, extra = "") => {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures += 1;
};

async function http(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, json };
}

async function getMembers() {
  const { json } = await http(`${ISSUER}/members`);
  return json.members.map((m) => BigInt(m.commitment));
}

async function enroll(identity, group, protocolId, siteId) {
  const scope = scopeFor(protocolId);
  const proof = await generateProof(identity, group, BigInt(siteId), scope);
  const { status, json } = await http(`${RELAYER}/enroll`, "POST", {
    protocolId: String(protocolId),
    siteId: String(siteId),
    proof: {
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot.toString(),
      message: proof.message.toString(),
      nullifier: proof.nullifier.toString(),
      scope: scope.toString(),
      points: proof.points.map((p) => p.toString()),
    },
  });
  return { status, json, scope };
}

const P1 = 1, P2 = 2, S1 = 1, S2 = 2;

// 1. Register protocols + sites (sponsor = owner key via relayer)
console.log("\n== Registry ==");
for (const [ep, id, name] of [
  ["/protocol", P1, "TrialFence-01"],
  ["/protocol", P2, "TrialFence-02"],
  ["/site", S1, "North Harbor Clinic"],
  ["/site", S2, "Southbridge Hospital"],
]) {
  const { status, json } = await http(`${RELAYER}${ep}`, "POST", { [ep === "/protocol" ? "protocolId" : "siteId"]: String(id), name });
  check(`register ${name}`, status === 200 && json.status === "registered", JSON.stringify(json.txHash ?? json));
}

// 2. Register a volunteer with the issuer (physical ID check, HMAC dedupe)
console.log("\n== Coordination (issuer boundary) ==");
const identity = new Identity();
const commitment = identity.commitment.toString();
const testId = { docType: "passport", documentNumber: "AB1234567", fullName: "Jane Doe" };

let { status, json } = await http(`${ISSUER}/register`, "POST", { commitment, testId });
check("issuer accepts first registration", status === 201 && json.status === "accepted", `leaf ${json.leafIndex}`);

{ const dup = await http(`${ISSUER}/register`, "POST", { commitment, testId }); // same commitment + same doc
  check("same credential (and same commitment) is refused (ALREADY_MEMBER)", dup.status === 409 && dup.json.error === "ALREADY_MEMBER", dup.json.detail); }

{ // same physical document, different device commitment → must still be refused (HMAC dedupe)
  const otherDev = new Identity();
  const dup = await http(`${ISSUER}/register`, "POST", { commitment: otherDev.commitment.toString(), testId });
  check("same physical credential, new commitment refused (DUPLICATE_IDENTITY)", dup.status === 409 && dup.json.error === "DUPLICATE_IDENTITY", dup.json.detail); }

const secondIdentity = new Identity();
{ const alt = await http(`${ISSUER}/register`, "POST", { commitment: secondIdentity.commitment.toString(), testId: { ...testId, documentNumber: "CD9999999" } });
  check("different credential allowed", alt.status === 201); }

const members = await getMembers();
check("two members in the group", members.length === 2, `len=${members.length}`);
const group = new Group(members);
check("our commitment is a member", group.indexOf(BigInt(commitment)) >= 0);

// 3. Enrollment with a real proof
console.log("\n== Enrollment (relayer → on-chain) ==");
let r = await enroll(identity, group, P1, S1);
check("first enroll accepted", r.json.accepted === true, `tx ${r.json.txHash}`);

r = await enroll(identity, group, P1, S2);
check("duplicate at second site denied", r.json.accepted === false && r.json.reason === "DUPLICATE", r.json.reason + (r.json.detail ? ` :: ${r.json.detail}` : ""));

r = await enroll(identity, group, P2, S1);
check("different protocol allowed", r.json.accepted === true, `tx ${r.json.txHash}`);

// Optimistic-root behavior: a proof built against a tree that includes a
// member the chain does not know yet is rejected, then accepted once the
// member is actually added (root becomes part of the on-chain group).
const latecomer = new Identity();
const optimistic = new Group([...members, latecomer.commitment]);
{
  const scope = scopeFor(P1);
  const proof = await generateProof(latecomer, optimistic, BigInt(S1), scope);
  const out = await http(`${RELAYER}/enroll`, "POST", {
    protocolId: String(P1), siteId: String(S1),
    proof: { merkleTreeDepth: proof.merkleTreeDepth, merkleTreeRoot: proof.merkleTreeRoot.toString(),
             message: proof.message.toString(), nullifier: proof.nullifier.toString(), scope: scope.toString(),
             points: proof.points.map((p) => p.toString()) },
  });
  check("unregistered-member root rejected", out.json.accepted === false && out.json.reason === "NOT_IN_GROUP", out.json.reason);
}
{ const reg = await http(`${ISSUER}/register`, "POST", { commitment: latecomer.commitment.toString(), testId: { docType: "driver-license", documentNumber: "ZZ3141592", fullName: "Lou Lait" } });
  check("latecomer membership issued", reg.status === 201); }
{
  const scope = scopeFor(P1);
  const proof = await generateProof(latecomer, optimistic, BigInt(S1), scope);
  const out = await http(`${RELAYER}/enroll`, "POST", {
    protocolId: String(P1), siteId: String(S1),
    proof: { merkleTreeDepth: proof.merkleTreeDepth, merkleTreeRoot: proof.merkleTreeRoot.toString(),
             message: proof.message.toString(), nullifier: proof.nullifier.toString(), scope: scope.toString(),
             points: proof.points.map((p) => p.toString()) },
  });
  check("same proof accepted after member added", out.json.accepted === true, out.json.txHash ?? out.json.reason);
}

// Non-member (a tree the chain has never seen) cannot enroll
const stranger = new Identity();
const strangerGroup = new Group([...members, stranger.commitment]);
r = await enroll(stranger, strangerGroup, P1, S1);
check("unknown-tree / non-member proof denied", r.json.accepted === false && ["NOT_IN_GROUP", "INVALID_PROOF"].includes(r.json.reason), r.json.reason);

// Wrong scope (build proof scope for a protocol that does not exist)
{ const bogus = new Group(members);
  const scope = scopeFor(99999);
  const proof = await generateProof(identity, bogus, BigInt(S1), scope);
  const out = await http(`${RELAYER}/enroll`, "POST", {
    protocolId: String(P1), siteId: String(S1),
    proof: { merkleTreeDepth: proof.merkleTreeDepth, merkleTreeRoot: proof.merkleTreeRoot.toString(),
             message: proof.message.toString(), nullifier: proof.nullifier.toString(), scope: scope.toString(),
             points: proof.points.map((p) => p.toString()) },
  });
  check("wrong-scope proof denied", out.json.accepted === false && out.json.reason === "WRONG_SCOPE", out.json.reason); }

// 4. Audit trail
console.log("\n== Audit ==");
const { json: ev } = await http(`${RELAYER}/events`);
check("enrollment events recorded", ev.events.length >= 2, `count=${ev.events.length}`);

const { json: denials } = await http(`${RELAYER}/denials`);
check("signed denials recorded", denials.denials.length >= 2, `count=${denials.denials.length}`);

const denial = denials.denials[0];
{ const signer = verifyMessage(denial.digest, denial.signature).toLowerCase();
  check("denial signature verifies against relayer address", signer === denial.signer.toLowerCase(), `signer ${denial.signer}`); }

const { json: mon } = await http(`${RELAYER}/monitor/summary`);
check("monitor summary labeled", mon.observations.length > 0 && mon.observations[0].severity, mon.observations[0]?.message);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);