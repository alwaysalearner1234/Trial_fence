import { createHmac } from "node:crypto";
import { solidityPackedKeccak256 } from "ethers";
import { config } from "./config";

export const SCOPE_DOMAIN = "TrialFence-Protocol-v1:";

/**
 * Mirrors TrialFence.computeScope on-chain:
 *   uint256(keccak256(abi.encodePacked("TrialFence-Protocol-v1:", protocolId)))
 */
export function scopeFor(protocolId: bigint | number | string): bigint {
  return BigInt(
    solidityPackedKeccak256(["string", "uint256"], [SCOPE_DOMAIN, BigInt(protocolId).toString()])
  );
}

/**
 * Normalizes a raw identifier so the same person always produces the same keyed
 * digest regardless of casing, spaces or separator characters.
 */
export function normalizeIdentifier(value: string): string {
  return value
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Keyed digest of a normalized identifier. This is all the issuer persists:
 * the raw document data is never stored and cannot be recovered from the digest.
 */
export function keyedDigest(secret: string, normalizedIdentifier: string): string {
  return createHmac("sha256", secret).update(normalizedIdentifier).digest("hex");
}

/** Canonical hash of an HMAC digest used to look up a previously registered person. */
export function idKey(secret: string, docType: string, normalizedIdentifier: string): string {
  return keyedDigest(secret, `${docType}::${normalizedIdentifier}`);
}

export function isBigIntString(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    BigInt(value.trim());
    return true;
  } catch {
    return false;
  }
}