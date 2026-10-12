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
function requireIssuerKey(req: Request, res: Response, next: NextFunction) {
  if (!config.issuerApiKey) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token === config.issuerApiKey) return next();
  res.status(401).json({ error: "UNAUTHORIZED" });
}

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
    const [memberCount, root, groupId, chainIssuer] = await Promise.all([
      contract.memberCount(),
      contract.currentMerkleTreeRoot(),
      contract.GROUP_ID(),
      contract.issuer(),
    ]);
    res.json({
      groupId: Number(groupId),
      memberCount: Number(memberCount),
      root: root.toString(),
      issuer: await issuerWallet().getAddress(),
      contract: deployment().trialFence,
      trialFence: deployment().trialFence,
      isIssuer: String(chainIssuer).toLowerCase() === issuerWallet().address.toLowerCase(),
      chainId: deployment().chainId,
      network: deployment().network,
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
 * POST /register
 * The coordinator "verifies" a clearly-labelled TEST identity document once.
 * The issuer:
 *   1. normalizes the identifier, computes a keyed HMAC digest and refuses a
 *      SECOND credential for the same person (HMAC uniqueness check);
 *   2. adds the participant's device-generated identity commitment to the group;
 *   3. persists neither the raw document data nor the name — only the digest.
 * This is a test verification step, NOT production government-ID verification.
 *
 * Concurrency/crash safety (issue #6): the WHOLE operation — duplicate checks,
 * chain reads, pre-flight, transaction and persistence — runs inside the
 * per-process write lock, and every insert is idempotent (ON CONFLICT DO
 * NOTHING). A crash between confirmation and persistence is repaired on retry:
 * the chain already holds the commitment, so the leaf index is derived from
 * confirmed chain state (indexOf) instead of issuing a second membership.
 */
app.post(
  "/register",
  requireIssuerKey,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const rawCommitment = String(body.commitment ?? "").trim();
    const docType = ({ PASSPORT: "PASSPORT", NATIONALID: "NATIONAL-ID", DRIVERLICENSE: "DRIVER-LICENSE" } as Record<string, string>)[normalizeIdentifier(String(body.testId?.docType ?? ""))];
    const docNumber = String(body.testId?.documentNumber ?? "").trim();

    if (!isBigIntString(rawCommitment)) return refuse(res, 400, "BAD_REQUEST", "commitment must be an unsigned integer string");
    const commitment = BigInt(rawCommitment).toString();
    if (!docType) return refuse(res, 400, "BAD_REQUEST", "unsupported test document type");
    if (!normalizeIdentifier(docNumber)) return refuse(res, 400, "BAD_REQUEST", "testId.documentNumber must contain letters or digits");

    const normalized = normalizeIdentifier(docNumber);
    const key = idKey(config.hmacSecret, docType, normalized);

    const outcome = await withWriteLock(async () => {
      const db = getDb();
      const contract = trialFenceContract(issuerWallet());

      // 1. Already issued (normal retry path)?
      const existing = db
        .prepare("SELECT leaf_index FROM members WHERE commitment = ?")
        .get(commitment) as { leaf_index: number } | undefined;
      if (existing) {
        return { duplicate: "ALREADY_MEMBER" as const, leafIndex: existing.leaf_index, txHash: null as string | null };
      }

      // 2. Crash-recovery path: the chain already holds this commitment (a
      // previous attempt confirmed but crashed before persisting). Derive the
      // leaf index from confirmed chain evidence instead of re-issuing.
      if (await contract.hasMember(1n, commitment)) {
        const index = Number(await contract.indexOf(1n, commitment));
        persistMembership(db, key, docType, commitment, index);
        console.warn(`[issuer] recovered unpersisted membership commitment=${commitment} leaf=${index}`);
        return { duplicate: "ALREADY_MEMBER" as const, leafIndex: index, txHash: null as string | null };
      }

      // 3. Same physical credential under a different commitment?
      const prior = db.prepare("SELECT hmac FROM identities WHERE hmac = ?").get(key);
      if (prior) {
        return { duplicate: "DUPLICATE_IDENTITY" as const, leafIndex: -1, txHash: null as string | null };
      }

      // 4. Fresh issuance: leaf index comes from confirmed chain state.
      const leafIndex = Number(await contract.memberCount());

      // Pre-flight so a bad commitment returns a clean error without burning gas.
      await contract.issueMembership.staticCall(commitment);

      const nonce = await latestNonce(issuerWallet());
      const tx = await contract.connect(issuerWallet()).issueMembership(commitment, { nonce });
      const receipt = await tx.wait();

      persistMembership(db, key, docType, commitment, leafIndex);
      return { duplicate: null, leafIndex, txHash: receipt.hash as string };
    });

    if (outcome.duplicate === "ALREADY_MEMBER") {
      return refuse(res, 409, "ALREADY_MEMBER", "this commitment is already in the verified group");
    }
    if (outcome.duplicate === "DUPLICATE_IDENTITY") {
      return refuse(
        res,
        409,
        "DUPLICATE_IDENTITY",
        "keyed digest of this identity document is already registered; a second verified credential for the same person is refused"
      );
    }

    console.log(`Issued membership #${outcome.leafIndex} (tx ${outcome.txHash})`);

    res.status(201).json({
      status: "accepted",
      commitment,
      leafIndex: outcome.leafIndex,
      txHash: outcome.txHash,
      explorerUrl: outcome.txHash ? explorerTxUrl(outcome.txHash) : "",
      note: "test verification only; not production identity document verification",
    });
  })
);

/** Idempotent persistence: safe to replay after a crash between confirmation and insert. */
function persistMembership(
  db: ReturnType<typeof getDb>,
  key: string,
  docType: string,
  commitment: string,
  leafIndex: number
): void {
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
  db.prepare(
    "INSERT INTO identities (doc_type, hmac, commitment, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(hmac) DO NOTHING"
  ).run(docType, key, commitment, now);
  db.prepare(
    "INSERT INTO members (leaf_index, commitment, issued_at) VALUES (?, ?, ?) ON CONFLICT(leaf_index) DO NOTHING"
  ).run(leafIndex, commitment, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Startup reconciliation (issues #4, #6): replays on-chain MembershipIssued
 * events into the local members mirror so a restart — or a crash between
 * confirmation and persistence — cannot leave SQLite behind the chain.
 * Identity HMAC rows cannot be rebuilt from chain data by design (only
 * commitments are public), so members without an identity row are reported;
 * repeat issuance for those documents stays refused via the on-chain check in
 * POST /register, but coordinator review is warranted.
 */
async function reconcileMembership(): Promise<void> {
  const db = getDb();
  const contract = trialFenceContract(provider());
  const fromBlock = deployment().deploymentBlock ?? 0;

  const logs = (await contract.queryFilter(contract.filters.MembershipIssued(), fromBlock)) as Array<{
    args: { index: bigint; identityCommitment: bigint };
  }>;
  let restored = 0;
  for (const log of logs) {
    const index = Number(log.args.index);
    const commitment = log.args.identityCommitment.toString();
    const info = db
      .prepare("INSERT INTO members (leaf_index, commitment, issued_at) VALUES (?, ?, ?) ON CONFLICT(leaf_index) DO NOTHING")
      .run(index, commitment, new Date().toISOString());
    if (info.changes > 0) restored += 1;
  }

  const chainCount = Number(await contract.memberCount());
  const dbCount = (db.prepare("SELECT COUNT(*) AS n FROM members").get() as { n: number }).n;
  const orphaned = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM members m LEFT JOIN identities i ON i.commitment = m.commitment WHERE i.hmac IS NULL"
      )
      .get() as { n: number }
  ).n;

  console.log(
    `[issuer] reconcile: chain members=${chainCount} db members=${dbCount} restored=${restored} members-without-identity=${orphaned} (fromBlock=${fromBlock})`
  );
  if (chainCount !== dbCount) {
    console.warn(
      `[issuer] reconcile: chain/DB member count mismatch (chain=${chainCount}, db=${dbCount}); coordinator review advised`
    );
  }
  if (orphaned > 0) {
    console.warn(
      `[issuer] reconcile: ${orphaned} member(s) lack identity-digest rows (HMACs are unrecoverable from chain data by design)`
    );
  }
}

app.listen(config.issuerPort, () => {
  console.log(`[issuer] listening on http://127.0.0.1:${config.issuerPort}`);
  console.log(`[issuer] contract: ${deployment().trialFence} (network ${deployment().network})`);
  reconcileMembership().catch((err) => console.error("[issuer] reconcile failed:", err));
});
