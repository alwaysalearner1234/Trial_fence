import { solidityPackedKeccak256 } from "ethers";

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