import * as fs from "fs";
import * as path from "path";

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
}

export const config = {
  rpcUrl: env("RPC_URL", "http://127.0.0.1:8545"),

  issuerPort: Number(env("PORT_ISSUER", "4001")),
  relayerPort: Number(env("PORT_RELAYER", "4002")),

  deploymentFile: env(
    "DEPLOYMENT_FILE",
    path.join(__dirname, "..", "..", "contracts", "deployments", "localhost.json")
  ),
  trialFenceArtifact: env(
    "TRIALFENCE_ARTIFACT",
    path.join(__dirname, "..", "..", "contracts", "artifacts", "contracts", "TrialFence.sol", "TrialFence.json")
  ),
  dbFile: env("DB_FILE", path.join(__dirname, "..", "data", "trialfence.db")),

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

  explorerUrl: env("EXPLORER_URL", ""),

  // Optional LLM provider for the AI integrity monitor narrative.
  openaiApiKey: env("OPENAI_API_KEY", ""),
  openaiModel: env("OPENAI_MODEL", "gpt-4o-mini"),
};

export function deployment(): DeploymentInfo {
  const raw = fs.readFileSync(config.deploymentFile, "utf8");
  return JSON.parse(raw) as DeploymentInfo;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trialFenceAbi(): any {
  const raw = fs.readFileSync(config.trialFenceArtifact, "utf8");
  return (JSON.parse(raw) as { abi: unknown }).abi;
}

export function explorerTxUrl(txHash: string): string {
  return config.explorerUrl ? `${config.explorerUrl}/tx/${txHash}` : "";
}