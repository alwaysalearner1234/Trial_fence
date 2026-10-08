import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof, verifyProof, SemaphoreProof } from "@semaphore-protocol/proof";
import type { Signer } from "ethers";

const SCOPE_DOMAIN = "TrialFence-Protocol-v1:";

const PROTOCOL_A = 1n;
const PROTOCOL_B = 2n;
const SITE_1 = 1n;
const SITE_2 = 2n;

function scopeFor(protocolId: bigint): bigint {
  return BigInt(ethers.solidityPackedKeccak256(["string", "uint256"], [SCOPE_DOMAIN, protocolId]));
}

describe("TrialFence", function () {
  this.timeout(600000);

  let owner: Signer;
  let issuer: Signer;
  let relayer: Signer;
  let trialFence: any;
  let alice: Identity;
  let bob: Identity;
  let group: Group;

  async function proofFor(
    identity: Identity,
    members: bigint[],
    siteId: bigint,
    protocolId: bigint
  ): Promise<SemaphoreProof> {
    const g = new Group(members);
    return generateProof(identity, g, siteId, scopeFor(protocolId));
  }

  beforeEach(async function () {
    [owner, issuer, relayer] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("SemaphoreVerifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const PoseidonT3 = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
    const poseidonT3 = await PoseidonT3.deploy();
    await poseidonT3.waitForDeployment();

    const TrialFence = await ethers.getContractFactory("contracts/TrialFence.sol:TrialFence", {
      libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidonT3.getAddress() },
    });
    trialFence = await TrialFence.deploy(await verifier.getAddress(), await issuer.getAddress());
    await trialFence.waitForDeployment();

    await trialFence.registerProtocol(PROTOCOL_A, "DEMO-PAIN-01");
    await trialFence.registerProtocol(PROTOCOL_B, "DEMO-CNS-02");
    await trialFence.connect(owner).registerSite(SITE_1, "Site A");
    await trialFence.connect(owner).registerSite(SITE_2, "Site B");

    alice = new Identity();
    bob = new Identity();

    await trialFence.connect(issuer).issueMembership(alice.commitment);
    await trialFence.connect(issuer).issueMembership(bob.commitment);

    group = new Group([alice.commitment, bob.commitment]);
  });

  describe("protocol & site registry", function () {
    it("registers a protocol with a scope matching the off-chain mirror", async function () {
      const protocol = await trialFence.protocols(PROTOCOL_A);
      expect(protocol.exists).to.equal(true);
      expect(protocol.name).to.equal("DEMO-PAIN-01");
      expect(protocol.scope).to.equal(scopeFor(PROTOCOL_A));
      expect(await trialFence.computeScope(PROTOCOL_A)).to.equal(scopeFor(PROTOCOL_A));
    });

    it("rejects duplicate protocol registration", async function () {
      await expect(trialFence.registerProtocol(PROTOCOL_A, "again")).to.be.revertedWithCustomError(
        trialFence,
        "TrialFence__ProtocolAlreadyExists"
      );
    });

    it("only the owner can register sites", async function () {
      await expect(
        trialFence.connect(relayer).registerSite(3n, "Rogue Site")
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__NotOwner");
    });
  });

  describe("issuer boundary", function () {
    it("only the issuer can add identity commitments", async function () {
      const stranger = new Identity();
      await expect(
        trialFence.connect(relayer).issueMembership(stranger.commitment)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__NotIssuer");
    });

    it("only the issuer can revoke memberships", async function () {
      const siblings = group.generateMerkleProof(0).siblings;
      await expect(
        trialFence
          .connect(relayer)
          .removeMembership(alice.commitment, siblings.map(String))
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__NotIssuer");
    });

    it("tracks member count and root on-chain", async function () {
      expect(await trialFence.memberCount()).to.equal(2n);
      expect(await trialFence.currentMerkleTreeRoot()).to.equal(group.root);
      expect(await trialFence.hasMember(1n, alice.commitment)).to.equal(true);
    });
  });

  describe("enrollment gate", function () {
    it("accepts a first enrollment and emits EnrollmentAccepted", async function () {
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);

      // The off-chain library verifies the proof we are about to submit.
      expect(await verifyProof(proof)).to.equal(true);

      const tx = await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proof);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      const events = await trialFence.queryFilter(trialFence.filters.EnrollmentAccepted());
      expect(events.length).to.equal(1);
      expect(events[0].args.protocolId).to.equal(PROTOCOL_A);
      expect(events[0].args.siteId).to.equal(SITE_1);
      expect(events[0].args.nullifier).to.equal(BigInt(proof.nullifier));

      expect(await trialFence.hasEnrolled(PROTOCOL_A, BigInt(proof.nullifier))).to.equal(true);
    });

    it("rejects the same identity at a second site for the same protocol (duplicate nullifier)", async function () {
      const proof1 = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proof1);

      // Same identity, same protocol, different site => identical nullifier.
      const proof2 = await proofFor(alice, [alice.commitment, bob.commitment], SITE_2, PROTOCOL_A);
      expect(proof2.nullifier).to.equal(proof1.nullifier);

      await expect(
        trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_2, proof2)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__DuplicateEnrollment");
    });

    it("accepts the same identity in a different protocol with an unlinkable nullifier", async function () {
      const proofA = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proofA);

      const proofB = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_B);
      expect(proofB.nullifier).to.not.equal(proofA.nullifier);

      await trialFence.connect(relayer).enroll(PROTOCOL_B, SITE_1, proofB);
      expect(await trialFence.hasEnrolled(PROTOCOL_B, BigInt(proofB.nullifier))).to.equal(true);
      expect(await trialFence.hasEnrolled(PROTOCOL_A, BigInt(proofB.nullifier))).to.equal(false);
    });

    it("accepts a different verified identity for the same protocol", async function () {
      const proofAlice = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proofAlice);

      const proofBob = await proofFor(bob, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proofBob);

      const events = await trialFence.queryFilter(trialFence.filters.EnrollmentAccepted());
      expect(events.length).to.equal(2);
    });

    it("rejects a proof generated for a different protocol scope", async function () {
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_B);
      await expect(
        trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proof)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__WrongScope");
    });

    it("rejects a proof whose message does not match the submitting site", async function () {
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      await expect(
        trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_2, proof)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__SiteMismatch");
    });

    it("rejects a tampered (invalid) proof", async function () {
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);
      const tampered: SemaphoreProof = {
        ...proof,
        nullifier: String(BigInt(proof.nullifier) + 1n),
      };
      await expect(
        trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, tampered)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__InvalidProof");
    });

    it("rejects an unknown protocol id", async function () {
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, 99n);
      await expect(
        trialFence.connect(relayer).enroll(99n, SITE_1, proof)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__ProtocolNotFound");
    });

    it("accepts an in-flight proof against a recently superseded root, then expires it", async function () {
      // Proof generated while alice and bob are the only members.
      const proof = await proofFor(alice, [alice.commitment, bob.commitment], SITE_1, PROTOCOL_A);

      // A new member joins, replacing the Merkle root.
      const carol = new Identity();
      await trialFence.connect(issuer).issueMembership(carol.commitment);

      // The old-root proof is still inside the acceptance window.
      await trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_1, proof);

      // After the window passes, a proof against the old root must be rejected.
      const proofOld = await proofFor(bob, [alice.commitment, bob.commitment], SITE_2, PROTOCOL_A);
      await network.provider.send("evm_increaseTime", [3600]);
      await network.provider.send("evm_mine");

      await expect(
        trialFence.connect(relayer).enroll(PROTOCOL_A, SITE_2, proofOld)
      ).to.be.revertedWithCustomError(trialFence, "TrialFence__MerkleTreeRootIsExpired");
    });
  });

  describe("membership revocation", function () {
    it("revokes a lost-device membership so the commitment leaves the group", async function () {
      const proof = await group.generateMerkleProof(0);
      await trialFence
        .connect(issuer)
        .removeMembership(alice.commitment, proof.siblings.map(String));

      expect(await trialFence.hasMember(1n, alice.commitment)).to.equal(false);
    });
  });
});
