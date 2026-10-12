import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config, deployment, explorerTxUrl, trialFenceAbi } from "../config";
import { getDb } from "../db";
import { ownerWallet, provider, relayerWallet, trialFenceContract } from "../chain";
import { isBigIntString, scopeFor } from "../scope";
import { solidityPackedKeccak256, verifyMessage, Contract } from "ethers";
import { monitorSummary } from "../monitor";
import { latestNonce, withWriteLock } from "../chain";

const app = express();
app.use(cors());
app.use(express.json());

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "INTERNAL", detail: String(err?.message ?? err) });
    });
  };

interface ProofInput {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  message: string;
  nullifier: string;
  scope: string;
  points: string[];
}

// Optional shared bearer token for the privileged registry routes
// (POST /protocol, POST /site — they spend the owner key on-chain).
// Empty in dev mode. The public gate (POST /enroll, all GETs) stays open.
function requireRelayerKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.relayerApiKey) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token === config.relayerApiKey) return next();
  res.status(401).json({ error: "UNAUTHORIZED" });
}

function isProofInput(value: unknown): value is ProofInput {
  const p = (value ?? {}) as Record<string, unknown>;
  return (
    Number.isInteger(p.merkleTreeDepth) &&
    Number(p.merkleTreeDepth) >= 1 && Number(p.merkleTreeDepth) <= 32 &&
    isBigIntString(p.merkleTreeRoot) &&
    isBigIntString(p.message) &&
    isBigIntString(p.nullifier) &&
    isBigIntString(p.scope) &&
    Array.isArray(p.points) &&
    p.points.length === 8 &&
    p.points.every(isBigIntString)
  );
}

/**
 * Maps a contract revert to a short, dashboard-friendly reason. ethers sometimes
 * surfaces the custom error in the revert *message* instead of info.error.name
 * (e.g. when the transaction was rejected before ABI decoding), so the message
 * is parsed as a fallback.
 */
function errorName(err: unknown): string {
  const message = String((err as Error)?.message ?? "");
  const name =
    (err as { revert?: { name?: string } })?.revert?.name ??
    (err as { info?: { error?: { name?: string } } })?.info?.error?.name ??
    message.match(/reverted(?:\s*with\s*panic(?:\s*\w+)?)?\s*:\s*([A-Za-z_][\w$]+)/)?.[1];
  switch (name) {
    case "TrialFence__DuplicateEnrollment":
      return "DUPLICATE";
    case "TrialFence__ProtocolNotFound":
      return "PROTOCOL_NOT_FOUND";
    case "TrialFence__WrongScope":
      return "WRONG_SCOPE";
    case "TrialFence__SiteMismatch":
      return "SITE_MISMATCH";
    case "TrialFence__SiteNotRegistered":
      return "SITE_NOT_REGISTERED";
    case "TrialFence__InvalidProof":
      return "INVALID_PROOF";
    case "TrialFence__GroupHasNoMembers":
      return "EMPTY_GROUP";
    case "TrialFence__MerkleTreeRootIsExpired":
      return "STALE_ROOT";
    case "TrialFence__MerkleTreeRootIsNotPartOfTheGroup":
      return "NOT_IN_GROUP";
    case "TrialFence__ProtocolAlreadyExists":
      return "PROTOCOL_EXISTS";
    case "TrialFence__SiteAlreadyRegistered":
      return "SITE_EXISTS";
    case "TrialFence__SiteNotFound":
      return "SITE_NOT_FOUND";
    case "TrialFence__NotOwner":
      return "NOT_OWNER";
    default:
      return name?.startsWith("TrialFence__")
        ? name.slice("TrialFence__".length).toUpperCase()
        : name ?? "UNKNOWN";
  }
}

/**
 * Reasons that represent a definitive on-chain classification of the request.
 * Anything else (transport errors, undecodable failures) is reported as
 * RPC_FAILURE and — crucially — is NOT recorded as a denial, so malformed
 * requests and node outages can never be mislabelled as verified duplicates.
 */
const CLASSIFIED_REASONS = new Set([
  "DUPLICATE",
  "PROTOCOL_NOT_FOUND",
  "SITE_NOT_FOUND",
  "WRONG_SCOPE",
  "SITE_MISMATCH",
  "INVALID_PROOF",
  "EMPTY_GROUP",
  "STALE_ROOT",
  "NOT_IN_GROUP",
  "PROTOCOL_EXISTS",
  "SITE_EXISTS",
  "NOT_OWNER",
]);

function isTransportError(err: unknown): boolean {
  // NOTE: every code-like pattern uses word boundaries — a bare `ENOTFOUND`
  // once matched the substring inside `TrialFence__SiteNotFound` and
  // mislabelled a classified revert as RPC_FAILURE.
  const message = String((err as Error)?.message ?? "");
  return [
    /\bgetaddrinfo\b/i, // DNS failures (covers ENOTFOUND)
    /\bENOTFOUND\b/i,
    /\bECONN(?:REFUSED|RESET|ABORTED)?\b/i,
    /\bETIMEDOUT\b/i,
    /\bEAI_AGAIN\b/i,
    /\bsocket hang up\b/i,
    /\bfetch failed\b/i,
    /\bnetwork\b/i,
    /\btimed? ?out\b/i,
    /\bmissing revert data\b/i,
    /\bbad response\b/i,
    /\bserver error\b/i,
    /\brate limit/i,
    /\bHTTP (429|500|502|503|504)\b/,
    /\bstatus (429|500|502|503|504)\b/,
  ].some((rx) => rx.test(message));
}

const VERIFIER_ABI = [
  "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals, uint256 _merkleTreeDepth) view returns (bool)",
];

/**
 * Standalone SNARK validity check against the on-chain verifier (view call, no
 * state change). Used to tell a *verified* duplicate — a well-formed proof
 * whose nullifier is already consumed — from a fabricated request that merely
 * reuses a consumed nullifier with garbage proof points.
 */
async function snarkValid(proof: ProofInput): Promise<boolean> {
  try {
    const verifier = new Contract(deployment().verifier, VERIFIER_ABI, provider());
    const signal = (v: string) =>
      BigInt(solidityPackedKeccak256(["uint256"], [BigInt(v).toString()])) >> 8n;
    const pts = proof.points.map((p) => BigInt(p));
    return (await verifier.verifyProof(
      [pts[0], pts[1]],
      [
        [pts[2], pts[3]],
        [pts[4], pts[5]],
      ],
      [pts[6], pts[7]],
      [
        BigInt(proof.merkleTreeRoot),
        BigInt(proof.nullifier),
        signal(proof.message),
        signal(proof.scope),
      ],
      proof.merkleTreeDepth
    )) as boolean;
  } catch (error) {
    if (isTransportError(error) || errorName(error) === "UNKNOWN") throw error;
    return false;
  }
}

/**
 * POST /enroll
 * The relayer receives a protocol-scoped proof generated in the participant's
 * browser, pre-flights it with a staticCall against TrialFence.sol (a reverted
 * transaction cannot emit a persistent event, so denials are recorded as signed
 * site audit records off-chain), and — if accepted — submits the transaction and
 * pays the gas. The relayer never receives the participant's identity secret.
 */
app.post(
  "/enroll",
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const protocolId = String(body.protocolId ?? "").trim();
    const siteId = String(body.siteId ?? "").trim();
    const rawProof = body.proof;

    if (!isBigIntString(protocolId)) return res.status(400).json({ error: "BAD_REQUEST", detail: "protocolId must be an integer string" });
    if (!isBigIntString(siteId)) return res.status(400).json({ error: "BAD_REQUEST", detail: "siteId must be an integer string" });
    if (!isProofInput(rawProof)) return res.status(400).json({ error: "BAD_REQUEST", detail: "malformed Semaphore proof" });

    const proof: ProofInput = rawProof;
    const contract = trialFenceContract(provider());

    // Protocol scope mirror check (the contract re-checks it anyway).
    const expectedScope = scopeFor(protocolId);
    if (BigInt(proof.scope) !== expectedScope) {
      const record = await recordDenial(protocolId, siteId, "WRONG_SCOPE", proof.nullifier);
      return res.json({ status: "denied", accepted: false, reason: "WRONG_SCOPE", denial: record,
        signedRecord: { message: record.digest, signature: record.signature, signer: record.signer } });
    }

    let receipt;
    try {
      await contract.enroll.staticCall(protocolId, siteId, proof);
      receipt = await withWriteLock(async () => {
        const nonce = await latestNonce(relayerWallet());
        const tx = await contract.connect(relayerWallet()).enroll(protocolId, siteId, proof, { nonce });
        return await tx.wait();
      });
    } catch (err) {
      // Transport/node failures are NOT denials: nothing was classified
      // on-chain, so nothing is recorded. Reported as RPC_FAILURE (503).
      if (isTransportError(err)) {
        console.warn(`Enrollment RPC failure protocol=${protocolId} site=${siteId} (${String((err as Error)?.message ?? err).slice(0, 160)})`);
        return res.status(503).json({
          status: "error",
          error: "CHAIN_UNAVAILABLE",
          accepted: false,
          reason: "RPC_FAILURE",
          detail: "relayer could not reach the chain or decode a response; retry later",
        });
      }
      let reason = errorName(err);
      let verification: "snark-valid" | "snark-invalid" | "unverified" = "unverified";
      if (!CLASSIFIED_REASONS.has(reason)) {
        console.warn(`Enrollment unclassified failure protocol=${protocolId} site=${siteId} (${String((err as Error)?.message ?? err).slice(0, 160)})`);
        return res.status(503).json({
          status: "error",
          error: "CHAIN_UNAVAILABLE",
          accepted: false,
          reason: "RPC_FAILURE",
          detail: "relayer could not classify the failure; retry later",
        });
      }
      if (reason === "DUPLICATE") {
        // The contract checks the nullifier registry before proof validity, so
        // a fabricated request reusing a consumed nullifier also reverts as
        // DUPLICATE. Re-check SNARK validity before reporting a *verified*
        // duplicate; otherwise label it INVALID_PROOF.
        try {
          verification = (await snarkValid(proof)) ? "snark-valid" : "snark-invalid";
        } catch {
          return res.status(503).json({ status: "error", error: "CHAIN_UNAVAILABLE", reason: "RPC_FAILURE", detail: "Proof verification could not be completed. Retry later." });
        }
        if (verification === "snark-invalid") reason = "INVALID_PROOF";
      }
      const record = await recordDenial(protocolId, siteId, reason, proof.nullifier);
      console.warn(
        `Enrollment refused protocol=${protocolId} site=${siteId} reason=${reason} verification=${verification} (${(err as Error)?.message?.slice(0, 160)})`
      );
      return res.json({
        status: "denied",
        accepted: false,
        reason,
        verification,
        denial: record,
        signedRecord: { message: record.digest, signature: record.signature, signer: record.signer },
        detail: String((err as Error)?.message ?? err),
      });
    }

    console.log(`Accepted enrollment protocol=${protocolId} site=${siteId} tx=${receipt.hash}`);
    return res.json({
      status: "accepted",
      accepted: true,
      protocolId,
      siteId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      nullifier: proof.nullifier,
      scope: proof.scope,
      explorerUrl: explorerTxUrl(receipt.hash),
    });
  })
);

/**
 * Records a signed, PII-free denial for the sponsor/IRB audit view. The record
 * is signed by the RELAYER key (signerRole "relayer") — it is a relayer-signed
 * audit record, not a site attestation. The signature lets any auditor verify
 * the record was produced by the relayer.
 */
async function recordDenial(
  protocolId: string,
  siteId: string,
  reason: string,
  nullifier: string
): Promise<Record<string, unknown>> {
  const signer = relayerWallet();
  const signerAddress = await signer.getAddress();
  const createdAt = new Date().toISOString();

  const digest = solidityPackedKeccak256(
    ["string", "string", "string", "string", "string", "string"],
    ["TRIALFENCE_DENIAL_V1", protocolId, siteId, nullifier ?? "0", reason, createdAt]
  );
  const signature = await signer.signMessage(digest);

  getDb()
    .prepare(
      "INSERT INTO denials (protocol_id, site_id, reason, nullifier, digest, signature, signer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(protocolId, siteId, reason, nullifier ?? null, digest, signature, signerAddress, createdAt);

  return { protocolId, siteId, reason, nullifier, digest, signature, signer: signerAddress, signerRole: "relayer", createdAt };
}

/**
 * GET /denials — signed site audit records for rejected enrollments.
 */
app.get(
  "/denials",
  wrap(async (_req, res) => {
    const rows = getDb()
      .prepare("SELECT * FROM denials ORDER BY id DESC")
      .all();
    res.json({ denials: rows });
  })
);

/**
 * GET /denials/:id/verify — tamper-evidence check for a single denial record.
 * Recomputes the canonical digest from the STORED fields (the same packing the
 * relayer signed) and recovers the signer from the signature. If any displayed
 * field was modified after signing, the digest mismatches and the recovered
 * signer will not equal the recorded relayer address.
 */
app.get(
  "/denials/:id/verify",
  wrap(async (req, res) => {
    const row = getDb().prepare("SELECT * FROM denials WHERE id = ?").get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });

    const recomputed = solidityPackedKeccak256(
      ["string", "string", "string", "string", "string", "string"],
      [
        "TRIALFENCE_DENIAL_V1",
        String(row.protocol_id),
        String(row.site_id),
        row.nullifier == null ? "0" : String(row.nullifier),
        String(row.reason),
        String(row.created_at),
      ]
    );
    let recovered: string | null = null;
    try {
      recovered = verifyMessage(recomputed, String(row.signature));
    } catch {
      recovered = null;
    }
    const digestMatches = recomputed === String(row.digest);
    const signerMatches =
      recovered !== null && recovered.toLowerCase() === String(row.signer).toLowerCase();
    res.json({
      id: row.id,
      valid: digestMatches && signerMatches,
      digestMatches,
      signerMatches,
      signer: row.signer,
      signerRole: "relayer",
      recoveredSigner: recovered,
      reason: row.reason,
    });
  })
);

/**
 * POST /protocol — registers a sponsor protocol on-chain (owner-governed:
 * TrialFence.registerProtocol is onlyOwner, so the relayer submits with the
 * owner key, exactly like /site).
 */
app.post(
  "/protocol",
  requireRelayerKey,
  wrap(async (req, res) => {
    const protocolId = String(req.body?.protocolId ?? "").trim();
    const name = String(req.body?.name ?? "").trim();

    if (!isBigIntString(protocolId)) return res.status(400).json({ error: "BAD_REQUEST", detail: "protocolId must be an integer string" });
    if (!name || name.length > 64) return res.status(400).json({ error: "BAD_REQUEST", detail: "name is required (<= 64 chars)" });

    const contract = trialFenceContract(ownerWallet());
    const expectedScope = scopeFor(protocolId);

    await contract.registerProtocol.staticCall(protocolId, name);
    const receipt = await withWriteLock(async () => {
      const nonce = await latestNonce(ownerWallet());
      const tx = await contract.connect(ownerWallet()).registerProtocol(protocolId, name, { nonce });
      return await tx.wait();
    });

    getDb()
      .prepare("INSERT INTO protocols (id, name, scope, created_at) VALUES (?, ?, ?, ?)")
      .run(BigInt(protocolId).toString(), name, expectedScope.toString(), new Date().toISOString());

    return res.json({
      status: "registered",
      protocolId: BigInt(protocolId).toString(),
      name,
      scope: expectedScope.toString(),
      txHash: receipt.hash,
      explorerUrl: explorerTxUrl(receipt.hash),
    });
  })
);

/**
 * POST /site — registers a trial site on-chain (governance-controlled, owner key).
 */
app.post(
  "/site",
  requireRelayerKey,
  wrap(async (req, res) => {
    const siteId = String(req.body?.siteId ?? "").trim();
    const name = String(req.body?.name ?? "").trim();

    if (!isBigIntString(siteId)) return res.status(400).json({ error: "BAD_REQUEST", detail: "siteId must be an integer string" });
    if (!name || name.length > 64) return res.status(400).json({ error: "BAD_REQUEST", detail: "name is required (<= 64 chars)" });

    const contract = trialFenceContract(ownerWallet());

    await contract.registerSite.staticCall(siteId, name);
    const receipt = await withWriteLock(async () => {
      const nonce = await latestNonce(ownerWallet());
      const tx = await contract.registerSite(siteId, name, { nonce });
      return await tx.wait();
    });

    getDb()
      .prepare("INSERT INTO sites (id, name, created_at) VALUES (?, ?, ?)")
      .run(BigInt(siteId).toString(), name, new Date().toISOString());

    return res.json({
      status: "registered",
      siteId: BigInt(siteId).toString(),
      name,
      txHash: receipt.hash,
      explorerUrl: explorerTxUrl(receipt.hash),
    });
  })
);

/**
 * GET /events — public EnrollmentAccepted events read from the chain, for the
 * sponsor/IRB audit view. Queries start at the deployment block (recorded by
 * deploy.ts) and support pagination: ?fromBlock=&limit=&offset=.
 */
app.get(
  "/events",
  wrap(async (req, res) => {
    const defaultFrom = deployment().deploymentBlock ?? 0;
    const fromBlock = req.query.fromBlock === undefined ? defaultFrom : Number(req.query.fromBlock);
    const limit = req.query.limit === undefined ? 500 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(fromBlock) || fromBlock < 0) {
      return res.status(400).json({ error: "BAD_REQUEST", detail: "fromBlock must be a non-negative integer" });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 2000) {
      return res.status(400).json({ error: "BAD_REQUEST", detail: "limit must be an integer in [1, 2000]" });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: "BAD_REQUEST", detail: "offset must be a non-negative integer" });
    }

    const contract = trialFenceContract(provider());
    const logs = await contract.queryFilter(contract.filters.EnrollmentAccepted(), fromBlock);
    const events = (
      logs as Array<{
        args: { protocolId: string; siteId: string; nullifier: string; scope: string; relayer: string };
        transactionHash: string;
        blockNumber: number;
      }>
    ).map((log) => ({
        protocolId: log.args.protocolId.toString(),
        siteId: log.args.siteId.toString(),
        nullifier: log.args.nullifier.toString(),
        scope: log.args.scope.toString(),
        relayer: log.args.relayer,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        explorerUrl: explorerTxUrl(log.transactionHash),
      })
    );
    res.json({
      events: events.slice(offset, offset + limit),
      count: events.length,
      fromBlock,
      limit,
      offset,
    });
  })
);

/**
 * GET /protocols — registered protocol metadata mirror (names + scopes).
 */
app.get(
  "/protocols",
  wrap(async (_req, res) => {
    const rows = getDb()
      .prepare("SELECT id, name, scope FROM protocols ORDER BY id ASC")
      .all() as { id: number | string; name: string; scope: string }[];
    res.json({ protocols: rows.map((r) => ({ id: String(r.id), name: r.name, scope: r.scope })) });
  })
);

/**
 * GET /sites — registered site metadata mirror (names).
 */
app.get(
  "/sites",
  wrap(async (_req, res) => {
    const rows = getDb()
      .prepare("SELECT id, name FROM sites ORDER BY id ASC")
      .all() as { id: number | string; name: string }[];
    res.json({ sites: rows.map((r) => ({ id: String(r.id), name: r.name })) });
  })
);

/**
 * GET /config — connectivity + ABI bundle for the web app.
 */
app.get(
  "/config",
  wrap(async (_req, res) => {
    res.json({
      network: deployment().network,
      chainId: deployment().chainId,
      contractAddress: deployment().trialFence,
      abi: trialFenceAbi(),
      explorerUrl: config.explorerUrl,
      issuerUrl: "/api/issuer",
      groupId: 1,
    });
  })
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    contract: deployment().trialFence,
    network: deployment().network,
    chainId: deployment().chainId,
  });
});

/**
 * GET /monitor/summary — AI integrity monitor. Deterministic PII-free anomaly
 * detection plus an optional LLM narrative when OPENAI_API_KEY is configured.
 */
app.get(
  "/monitor/summary",
  wrap(async (_req, res) => {
    res.json(await monitorSummary());
  })
);

app.listen(config.relayerPort, () => {
  console.log(`[relayer] listening on http://127.0.0.1:${config.relayerPort}`);
  console.log(`[relayer] contract: ${deployment().trialFence} (network ${deployment().network})`);
});
