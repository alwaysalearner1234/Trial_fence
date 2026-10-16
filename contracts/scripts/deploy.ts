import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer, issuer] = await ethers.getSigners();

  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY for this network.");
  const issuerAddress = process.env.ISSUER_ADDRESS ?? (network.name === "localhost" || network.name === "hardhat" ? issuer?.address : undefined);
  if (!issuerAddress || !ethers.isAddress(issuerAddress)) throw new Error("Set a valid ISSUER_ADDRESS before public testnet deployment.");

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Issuer:   ${issuerAddress}`);

  const Verifier = await ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`SemaphoreVerifier: ${verifierAddress}`);

  const PoseidonT3 = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.waitForDeployment();
  const poseidonT3Address = await poseidonT3.getAddress();
  console.log(`PoseidonT3:        ${poseidonT3Address}`);

  const TrialFence = await ethers.getContractFactory("contracts/TrialFence.sol:TrialFence", {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidonT3Address },
  });
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
    owner: deployer.address,
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
