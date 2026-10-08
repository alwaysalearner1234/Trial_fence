import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config, deployment, explorerTxUrl } from "../config";
import { getDb } from "../db";
import { issuerWallet, latestNonce, provider, trialFenceContract, withWriteLock } from "../chain";
import { idKey, isBigIntString, normalizeIdentifier } from "../scope";

const app = express();
app.use(cors());
app.use(express.json());

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "INTERNAL", detail: String(err?.message ?? err) });
    });
  };

function refuse(body: Response, status: number, code: string, detail: string) {
  body.status(status).json({ error: code, detail });
}

// Optional shared bearer token. Empty in dev mode.
app.use("/", (req, res, next) => {
  if (!config.issuerApiKey) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token === config.issuerApiKey) return next();
  return res.status(401).json({ error: "UNAUTHORIZED" });
});

/**
 * GET /members — public identity commitments in verified-group order, used by the
 * volunteer browser to rebuild the Merkle tree and generate membership proofs.
 */
app.get(
  "/members",
  wrap(async (_req, res) => {
    const rows = getDb()
      .prepare("SELECT leaf_index, commitment FROM members ORDER BY leaf_index ASC")
      .all() as { leaf_index: number; commitment: string }[];
    res.json({
      members: rows.map((r) => ({ index: r.leaf_index, commitment: r.commitment })),
      count: rows.length,
    });
  })
);

/**
 * GET /status — issuer boundary wireframe status.
 */
app.get(
  "/status",
  wrap(async (_req, res) => {
    const contract = trialFenceContract(provider());
    const [memberCount, root, groupId] = await Promise.all([
      contract.memberCount(),
      contract.currentMerkleTreeRoot(),
      contract.GROUP_ID(),
    ]);
    res.json({
      groupId: Number(groupId),
      memberCount: Number(memberCount),
      root: root.toString(),
      issuer: await issuerWallet().getAddress(),
      chainId: deployment().chainId,
      network: deployment().network,
    });
  })
);

/**
 * POST /register
 * The coordinator "verifies" a clearly-labelled TEST identity document once.
 * The issuer:
 *   1. normalizes the identifier, computes a keyed HMAC digest and refuses a
 *      SECOND credential for the same person (HMAC uniqueness check);
 *   2. adds the participant's device-generated identity commitment to the group;
 *   3. persists neither the raw document data nor the name — only the digest.
 * This is a test verification step, NOT production government-ID verification.
 */
app.post(
  "/register",
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const commitment = String(body.commitment ?? "").trim();
    const docType = String(body.testId?.docType ?? "")
      .trim()
      .toUpperCase();
    const docNumber = String(body.testId?.documentNumber ?? "").trim();

    if (!isBigIntString(commitment)) return refuse(res, 400, "BAD_REQUEST", "commitment must be an integer string");
    if (!docType) return refuse(res, 400, "BAD_REQUEST", "testId.docType is required");
    if (!docNumber) return refuse(res, 400, "BAD_REQUEST", "testId.documentNumber is required");

    const db = getDb();

    const existing = db.prepare("SELECT commitment FROM members WHERE commitment = ?").get(commitment);
    if (existing) return refuse(res, 409, "ALREADY_MEMBER", "this commitment is already in the verified group");

    const normalized = normalizeIdentifier(`${docType}${docNumber}`);
    const key = idKey(config.hmacSecret, docType, normalizeIdentifier(docNumber));

    const prior = db.prepare("SELECT hmac FROM identities WHERE hmac = ?").get(key);
    if (prior) {
      return refuse(
        res,
        409,
        "DUPLICATE_IDENTITY",
        "keyed digest of this identity document is already registered; a second verified credential for the same person is refused"
      );
    }

    const contract = trialFenceContract(issuerWallet());
    const leafIndex = Number(await contract.memberCount());

    // Pre-flight so a bad commitment returns a clean error without burning gas.
    await contract.issueMembership.staticCall(commitment);

    const receipt = await withWriteLock(async () => {
      const nonce = await latestNonce(issuerWallet());
      const tx = await contract.connect(issuerWallet()).issueMembership(commitment, { nonce });
      return await tx.wait();
    });

    db.prepare("INSERT INTO identities (doc_type, hmac, commitment, created_at) VALUES (?, ?, ?, ?)").run(
      docType,
      key,
      commitment,
      new Date().toISOString()
    );
    db.prepare("INSERT INTO members (leaf_index, commitment, issued_at) VALUES (?, ?, ?)").run(
      leafIndex,
      commitment,
      new Date().toISOString()
    );

    console.log(`Issued membership #${leafIndex} (tx ${receipt.hash})`);

    res.status(201).json({
      status: "accepted",
      commitment,
      leafIndex,
      txHash: receipt.hash,
      explorerUrl: explorerTxUrl(receipt.hash),
      note: "test verification only; not production identity document verification",
    });
  })
);

app.listen(config.issuerPort, () => {
  console.log(`[issuer] listening on http://127.0.0.1:${config.issuerPort}`);
  console.log(`[issuer] contract: ${deployment().trialFence} (network ${deployment().network})`);
});