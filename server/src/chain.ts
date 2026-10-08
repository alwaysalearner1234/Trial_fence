import { JsonRpcProvider, Wallet, Contract, AbstractProvider } from "ethers";
import { config, deployment, trialFenceAbi } from "./config";

let providerInstance: JsonRpcProvider | null = null;

export function provider(): JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new JsonRpcProvider(config.rpcUrl);
  }
  return providerInstance;
}

function signer(privateKey: string): Wallet {
  return new Wallet(privateKey, provider());
}

export const issuerWallet = (): Wallet => signer(config.issuerPrivateKey);
export const relayerWallet = (): Wallet => signer(config.relayerPrivateKey);
export const ownerWallet = (): Wallet => signer(config.ownerPrivateKey);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trialFenceContract(runner: Wallet | AbstractProvider = provider()): any {
  return new Contract(deployment().trialFence, trialFenceAbi(), runner);
}

/**
 * Next transaction nonce for a wallet. ethers v6 memoizes per-provider account
 * state, so rapid sequential transactions from fresh Wallet objects can reuse a
 * stale (too-low) nonce on an automining node. A direct eth_getTransactionCount
 * call to the node avoids that cache entirely.
 */
export async function latestNonce(wallet: Wallet): Promise<number> {
  const address = await wallet.getAddress();
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionCount",
      params: [address, "latest"],
    }),
  });
  if (!response.ok) throw new Error(`nonce RPC failed: HTTP ${response.status}`);
  const json = (await response.json()) as { result?: string; error?: { message?: string } };
  if (typeof json.result !== "string") throw new Error(`nonce RPC error: ${json.error?.message}`);
  return Number.parseInt(json.result, 16);
}

/**
 * Serializes write-transactions per process so concurrent API requests (e.g.
 * two volunteers enrolling at once) cannot race each other on the same signer's
 * nonce. Each server process (issuer, relayer) gets its own queue.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(() => fn());
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}