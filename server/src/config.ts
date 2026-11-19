import * as fs from "fs";
import * as path from "path";

// Load the repository-root .env, the same way contracts/hardhat.config.ts and
// scripts/render-start.mjs already do. Without this, `npm run issuer` /
// `npm run relayer` (started straight through ts-node) silently ignore a copied
// .env, so DB_FILE, RPC_URL and the key settings documented in .env.example
// never apply on the documented local path. Node's --env-file semantics apply:
// variables already set in process.env take precedence, so an explicit
// environment still wins over the file.
const rootEnvFile = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export interface DeploymentInfo {
  network: string;
  chainId: number;
  trialFence: string;
  verifier: string;
  poseidonT3: string;
  issuer: string;
  owner: string;
  deployedAt: string;
  /** Block the TrialFence contract was deployed in (recorded by deploy.ts).
   *  Absent in older deployment files — callers must fall back to block 0. */
  deploymentBlock?: number;
}

const repoRoot = path.join(__dirname, "..", "..");

/**
 * .env.example documents repo-relative paths (DEPLOYMENT_FILE,
 * TRIALFENCE_ARTIFACT, DB_FILE). The services are started with cwd = server/
 * (`npm run issuer -w server`), so a relative value taken from .env must be
 * resolved against the repo root rather than the process cwd — otherwise it
 * points at server/contracts/... and the ABI/deployment load fails at startup.
 * Absolute values are passed through untouched.
 */
function fromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

export const config = {
  rpcUrl: env("RPC_URL", "http://127.0.0.1:8545"),

  issuerPort: Number(env("PORT_ISSUER", "4001")),
  relayerPort: Number(env("PORT_RELAYER", "4002")),

  deploymentFile: fromRoot(
    env("DEPLOYMENT_FILE", path.join(repoRoot, "contracts", "deployments", "localhost.json"))
  ),
  trialFenceArtifact: fromRoot(
    env("TRIALFENCE_ARTIFACT", path.join(repoRoot, "contracts", "artifacts", "contracts", "TrialFence.sol", "TrialFence.json"))
  ),
  // Defaults to server/data/trialfence.db, matching DB_FILE in .env.example and
  // the server/data/ entry in .gitignore (it previously resolved to the repo root,
  // so the documented path and the real one disagreed). Relative values supplied
  // via .env are resolved against the repo root, not the process cwd.
  dbFile: fromRoot(env("DB_FILE", path.join(repoRoot, "server", "data", "trialfence.db"))),

  // Hardhat default test accounts. NEVER use these on a public network.
  issuerPrivateKey: env(
    "ISSUER_PRIVATE_KEY",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  ),
  relayerPrivateKey: env(
    "RELAYER_PRIVATE_KEY",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  ),
  ownerPrivateKey: env(
    "OWNER_PRIVATE_KEY",
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  ),

  hmacSecret: env("HMAC_SECRET", "trialfence-dev-hmac-secret-do-not-use-in-production"),

  // Optional bearer token for the issuer API. Empty = dev mode (no auth).
  issuerApiKey: env("ISSUER_API_KEY", ""),

  // Optional bearer token for the relayer's privileged registry routes
  // (POST /protocol, POST /site — they spend the owner/relayer keys).
  // Empty = dev mode (no auth). The public gate (POST /enroll, GETs) stays open.
  relayerApiKey: env("RELAYER_API_KEY", ""),

  explorerUrl: env("EXPLORER_URL", ""),

  // Optional LLM provider for the AI integrity monitor narrative.
  openaiApiKey: env("OPENAI_API_KEY", ""),
  openaiModel: env("OPENAI_MODEL", "gpt-4o-mini"),
};

export function deployment(): DeploymentInfo {
  const raw = fs.readFileSync(config.deploymentFile, "utf8");
  const info = JSON.parse(raw) as DeploymentInfo;
  if (info.chainId !== 31337) {
    for (const key of ["OWNER_PRIVATE_KEY", "ISSUER_PRIVATE_KEY", "RELAYER_PRIVATE_KEY", "HMAC_SECRET", "ISSUER_API_KEY", "RELAYER_API_KEY"]) {
      if (!process.env[key]?.trim()) throw new Error(`Set ${key} for a public testnet deployment.`);
    }
    if (config.hmacSecret === "trialfence-dev-hmac-secret-do-not-use-in-production") throw new Error("Use a dedicated HMAC_SECRET for a public testnet deployment.");
    const devKeys = ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"];
    if ([config.ownerPrivateKey, config.issuerPrivateKey, config.relayerPrivateKey].some(key => devKeys.includes(key.toLowerCase()))) throw new Error("Hardhat development keys must not be used on a public network.");
  }
  return info;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trialFenceAbi(): any {
  const raw = fs.readFileSync(config.trialFenceArtifact, "utf8");
  return (JSON.parse(raw) as { abi: unknown }).abi;
}

export function explorerTxUrl(txHash: string): string {
  return config.explorerUrl ? `${config.explorerUrl}/tx/${txHash}` : "";
}