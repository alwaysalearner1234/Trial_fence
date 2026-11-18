import { ethers, network } from "hardhat";
import type { Signer } from "ethers";
import * as fs from "fs";
import * as path from "path";

/** Hardhat's well-known development account #0. Local demo only. */
const HARDHAT_OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/**
 * Local demo mode only: a fresh Hardhat node starts with balances for its
 * default accounts, but a wallet built from a custom OWNER_PRIVATE_KEY /
 * ISSUER_PRIVATE_KEY has no balance. Fund those wallets through the node's
 * hardhat_setBalance RPC so deployment and issuance can actually send
 * transactions. On a public network this helper is never called.
 */
async function fundIfNeeded(address: string, label: string): Promise<void> {
  try {
    const balance = await ethers.provider.getBalance(address);
    if (balance >= ethers.parseEther("1")) return;
    const target = "0x" + ethers.parseEther("100").toString(16);
    await ethers.provider.send("hardhat_setBalance", [address, target]);
    console.log(`Funded ${label} ${address} with 100 ETH (local demo only)`);
  } catch (error) {
    console.warn(
      `Could not fund ${label} ${address} automatically: ${String((error as Error)?.message ?? error)}`
    );
  }
}

async function main() {
  const signers = await ethers.getSigners();
  const local = network.name === "localhost" || network.name === "hardhat";

  let owner: Signer;
  let issuerAddress: string;

  if (local) {
    // Local mode: make the contract owner and issuer match the keys the API
    // services actually sign with. Without this, a custom OWNER_PRIVATE_KEY
    // (or an ISSUER_ADDRESS that belongs to a different key) makes relayer
    // registration revert with TrialFence__NotOwner and issuer writes revert
    // with TrialFence__NotIssuer.
    const ownerKey = process.env.OWNER_PRIVATE_KEY?.trim() || HARDHAT_OWNER_KEY;
    owner = new ethers.Wallet(ownerKey, ethers.provider);
    await fundIfNeeded(await owner.getAddress(), "owner/deployer");

    const issuerKey = process.env.ISSUER_PRIVATE_KEY?.trim();
    const issuerFromKey = issuerKey ? new ethers.Wallet(issuerKey).address : undefined;
    issuerAddress =
      issuerFromKey ?? process.env.ISSUER_ADDRESS?.trim() ?? signers[1]?.address ?? "";
    if (issuerAddress) await fundIfNeeded(issuerAddress, "issuer");
  } else {
    // Public testnet: keep the existing DEPLOYER_PRIVATE_KEY signer and require
    // an explicit ISSUER_ADDRESS.
    owner = signers[0];
    if (!owner) throw new Error("Set DEPLOYER_PRIVATE_KEY for this network.");
    issuerAddress = process.env.ISSUER_ADDRESS?.trim() ?? "";
  }

  if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
    throw new Error("Set a valid ISSUER_ADDRESS before public testnet deployment.");
  }

  const ownerAddress = await owner.getAddress();
  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${ownerAddress}`);
  console.log(`Issuer:   ${issuerAddress}`);
  if (local) {
    console.log(
      `Local mode: owner/issuer aligned with ${process.env.OWNER_PRIVATE_KEY ? "OWNER_PRIVATE_KEY" : "Hardhat account #0"} and ${
        process.env.ISSUER_PRIVATE_KEY ? "ISSUER_PRIVATE_KEY" : process.env.ISSUER_ADDRESS ? "ISSUER_ADDRESS" : "Hardhat account #1"
      }`
    );
  }

  const Verifier = (await ethers.getContractFactory("SemaphoreVerifier")).connect(owner);
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`SemaphoreVerifier: ${verifierAddress}`);

  const PoseidonT3 = (await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3")).connect(owner);
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.waitForDeployment();
  const poseidonT3Address = await poseidonT3.getAddress();
  console.log(`PoseidonT3:        ${poseidonT3Address}`);

  const TrialFence = (
    await ethers.getContractFactory("contracts/TrialFence.sol:TrialFence", {
      libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidonT3Address },
    })
  ).connect(owner);
  const trialFence = await TrialFence.deploy(verifierAddress, issuerAddress);
  await trialFence.waitForDeployment();
  const trialFenceAddress = await trialFence.getAddress();
  console.log(`TrialFence:        ${trialFenceAddress}`);

  const net = await ethers.provider.getNetwork();
  const deployment = {
    network: network.name,
    chainId: Number(net.chainId),
    trialFence: trialFenceAddress,
    verifier: verifierAddress,
    poseidonT3: poseidonT3Address,
    issuer: issuerAddress,
    owner: ownerAddress,
    deployedAt: new Date().toISOString(),
    // First block that can contain this deployment's events. Issuer startup
    // reconciliation and relayer /events + monitor queries start here instead
    // of scanning from genesis.
    deploymentBlock: await ethers.provider.getBlockNumber(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`Deployment written to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
