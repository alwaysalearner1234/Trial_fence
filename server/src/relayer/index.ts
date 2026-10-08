import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config, deployment, explorerTxUrl, trialFenceAbi } from "../config";
import { getDb } from "../db";
import { ownerWallet, provider, relayerWallet, trialFenceContract } from "../chain";
import { isBigIntString, scopeFor } from "../scope";
import { solidityPackedKeccak256 } from "ethers";
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

function isProofInput(value: unknown): value is ProofInput {
  const p = (value ?? {}) as Record<string, unknown>;
  return (
    typeof p.merkleTreeDepth === "number" &&
    typeof p.merkleTreeRoot === "string" &&
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
    case "TrialFence__NotOwner":
      return "NOT_OWNER";
    default:
      return name?.startsWith("TrialFence__")
        ? name.slice("TrialFence__".length).toUpperCase()
        : name ?? "UNKNOWN";
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
      return res.json({ accepted: false, reason: "WRONG_SCOPE", denial: record });
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
      const reason = errorName(err);
      const record = await recordDenial(protocolId, siteId, reason, proof.nullifier);
      console.warn(
        `Enrollment refused protocol=${protocolId} site=${siteId} reason=${reason} (${(err as Error)?.message?.slice(0, 160)})`
      );
      return res.json({
        accepted: false,
        reason,
        denial: record,
        detail: String((err as Error)?.message ?? err),
      });
    }

    console.log(`Accepted enrollment protocol=${protocolId} site=${siteId} tx=${receipt.hash}`);
    return res.json({
      accepted: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      nullifier: proof.nullifier,
      scope: proof.scope,
      explorerUrl: explorerTxUrl(receipt.hash),
    });
  })
);

/**
 * Records a signed, PII-free denial for the sponsor/IRB audit view. The signature
 * lets any auditor verify the record was produced by the relayer.
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

  return { protocolId, siteId, reason, nullifier, digest, signature, signer: signerAddress, createdAt };
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
 * POST /protocol — registers a sponsor protocol on-chain (permissionless).
 */
app.post(
  "/protocol",
  wrap(async (req, res) => {
    const protocolId = String(req.body?.protocolId ?? "").trim();
    const name = String(req.body?.name ?? "").trim();

    if (!isBigIntString(protocolId)) return res.status(400).json({ error: "BAD_REQUEST", detail: "protocolId must be an integer string" });
    if (!name || name.length > 64) return res.status(400).json({ error: "BAD_REQUEST", detail: "name is required (<= 64 chars)" });

    const contract = trialFenceContract(provider());
    const expectedScope = scopeFor(protocolId);

    await contract.registerProtocol.staticCall(protocolId, name);
    const receipt = await withWriteLock(async () => {
      const nonce = await latestNonce(relayerWallet());
      const tx = await contract.connect(relayerWallet()).registerProtocol(protocolId, name, { nonce });
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
 * sponsor/IRB audit view.
 */
app.get(
  "/events",
  wrap(async (_req, res) => {
    const contract = trialFenceContract(provider());
    const logs = await contract.queryFilter(contract.filters.EnrollmentAccepted(), 0);
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
    res.json({ events, count: events.length });
  })
);

/**
 * GET /protocols — registered protocol metadata mirror (names + scopes).
 */
app.get(
  "/protocols",
  wrap(async (_req, res) => {
    const rows = getDb().prepare("SELECT id, name, scope FROM protocols ORDER BY id ASC").all();
    res.json({ protocols: rows });
  })
);

/**
 * GET /sites — registered site metadata mirror (names).
 */
app.get(
  "/sites",
  wrap(async (_req, res) => {
    const rows = getDb().prepare("SELECT id, name FROM sites ORDER BY id ASC").all();
    res.json({ sites: rows });
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
      rpcUrl: config.rpcUrl,
      contractAddress: deployment().trialFence,
      abi: trialFenceAbi(),
      explorerUrl: config.explorerUrl,
      issuerUrl: process.env.ISSUER_URL ?? "http://127.0.0.1:4001",
      groupId: 1,
    });
  })
);

app.get(
  "/health",
  wrap(async (_req, res) => {
    res.json({ status: "ok" });
  })
);

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