import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer, issuer] = await ethers.getSigners();

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Issuer:   ${process.env.ISSUER_ADDRESS ?? issuer.address}`);

  const issuerAddress = process.env.ISSUER_ADDRESS ?? issuer.address;

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
