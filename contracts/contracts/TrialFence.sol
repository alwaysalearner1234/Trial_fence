// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {SemaphoreGroups} from "@semaphore-protocol/contracts/base/SemaphoreGroups.sol";
import {MIN_DEPTH, MAX_DEPTH} from "@semaphore-protocol/contracts/base/Constants.sol";
// Reference the Semaphore and Poseidon contracts that Hardhat must compile and
// emit artifacts for during local deployment (they are not otherwise part of
// the import graph that generates deployable artifacts).
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

/// @title TrialFence
/// @notice Privacy-preserving duplicate-enrollment gate for multi-site clinical trials.
///
/// One shared Semaphore group holds identity commitments of participants that passed
/// a single off-chain identity check at an authorized issuer. To enroll in a protocol,
/// a participant submits a Semaphore zero-knowledge proof whose scope is derived from
/// the protocol id. The nullifier is bound to (scope, participant secret), so:
///   - the same participant re-enrolling in the same protocol produces the SAME
///     nullifier and is rejected at any site;
///   - the same participant enrolling in a different protocol produces an unrelated
///     nullifier, so enrollments cannot be linked across protocols.
///
/// No PII is ever stored on-chain: only identity commitments, nullifiers and
/// protocol/site metadata. Group membership additions are restricted to the issuer
/// account via SemaphoreGroups' onlyGroupAdmin modifier (the group admin is the
/// issuer set at deployment).
contract TrialFence is SemaphoreGroups {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev The single verified-participant group managed by this contract.
    uint256 public constant GROUP_ID = 1;

    /// @dev How long a superseded Merkle root remains acceptable for in-flight proofs.
    uint256 public constant MERKLE_TREE_DURATION = 1 hours;

    /// @dev Domain separator for protocol scopes.
    string public constant SCOPE_DOMAIN = "TrialFence-Protocol-v1:";

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error TrialFence__NotOwner();
    error TrialFence__NotIssuer();
    error TrialFence__ProtocolAlreadyExists(uint256 protocolId);
    error TrialFence__ProtocolNotFound(uint256 protocolId);
    error TrialFence__SiteAlreadyRegistered(uint256 siteId);
    error TrialFence__WrongScope(uint256 expected, uint256 provided);
    error TrialFence__SiteMismatch(uint256 expected, uint256 provided);
    error TrialFence__DuplicateEnrollment(uint256 protocolId, uint256 nullifier);
    error TrialFence__InvalidProof();
    error TrialFence__MerkleTreeDepthNotSupported(uint256 depth);
    error TrialFence__GroupHasNoMembers();
    error TrialFence__MerkleTreeRootIsNotPartOfTheGroup(uint256 root);
    error TrialFence__MerkleTreeRootIsExpired(uint256 root);

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ProtocolRegistered(
        uint256 indexed protocolId,
        uint256 indexed scope,
        address indexed sponsor,
        string name
    );
    event SiteRegistered(uint256 indexed siteId, string name);
    event MembershipIssued(uint256 indexed index, uint256 identityCommitment);
    event MembershipRevoked(uint256 indexed index, uint256 identityCommitment);
    event EnrollmentAccepted(
        uint256 indexed protocolId,
        uint256 indexed siteId,
        uint256 indexed nullifier,
        uint256 scope,
        address relayer
    );

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    ISemaphoreVerifier public immutable verifier;

    address public owner;
    address public issuer;

    struct Protocol {
        address sponsor;
        string name;
        uint256 scope;
        bool exists;
    }

    /// @notice Registered study protocols keyed by protocol id.
    mapping(uint256 => Protocol) public protocols;

    /// @notice Participating trial sites keyed by site id.
    mapping(uint256 => string) public sites;

    /// @notice Consumed nullifiers per protocol: protocolId => nullifier => used.
    mapping(uint256 => mapping(uint256 => bool)) public enrolled;

    /// @notice Timestamp at which a Merkle root was replaced by a newer one.
    mapping(uint256 => uint256) public merkleRootSupersededDates;

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert TrialFence__NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert TrialFence__NotIssuer();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(ISemaphoreVerifier _verifier, address _issuer) {
        if (address(_issuer) == address(0)) revert TrialFence__NotIssuer();
        verifier = _verifier;
        owner = msg.sender;
        issuer = _issuer;

        // The group admin is the issuer account, which gates every membership
        // change through SemaphoreGroups' onlyGroupAdmin modifier.
        _createGroup(GROUP_ID, _issuer);
    }

    // ---------------------------------------------------------------------
    // Protocol / site registry
    // ---------------------------------------------------------------------

    /// @notice Registers a study protocol and derives its unique enrollment scope.
    /// @param protocolId Sponsor-defined protocol id (unique).
    /// @param name Human-readable protocol name.
    /// @return scope The protocol-scoped nullifier domain for proofs.
    function registerProtocol(uint256 protocolId, string calldata name)
        external
        returns (uint256 scope)
    {
        if (protocols[protocolId].exists) revert TrialFence__ProtocolAlreadyExists(protocolId);

        scope = computeScope(protocolId);
        protocols[protocolId] = Protocol({sponsor: msg.sender, name: name, scope: scope, exists: true});

        emit ProtocolRegistered(protocolId, scope, msg.sender, name);
    }

    /// @notice Registers a participating trial site (governance-controlled).
    function registerSite(uint256 siteId, string calldata name) external onlyOwner {
        if (bytes(sites[siteId]).length != 0) revert TrialFence__SiteAlreadyRegistered(siteId);
        sites[siteId] = name;
        emit SiteRegistered(siteId, name);
    }

    /// @notice Deterministic protocol scope: keccak256("TrialFence-Protocol-v1:" || protocolId).
    /// @dev Mirrored off-chain with ethers.solidityPackedKeccak256(["string","uint256"], ...).
    function computeScope(uint256 protocolId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(SCOPE_DOMAIN, protocolId)));
    }

    // ---------------------------------------------------------------------
    // Issuer: group membership (identity commitments only, no PII)
    // ---------------------------------------------------------------------

    /// @notice Adds an identity commitment to the verified group.
    /// @dev Callable only by the issuer. Reverts if the issuer is not the group admin.
    function issueMembership(uint256 identityCommitment) external onlyIssuer {
        _recordRootSupersession();
        _addMember(GROUP_ID, identityCommitment);

        emit MembershipIssued(getMerkleTreeSize(GROUP_ID) - 1, identityCommitment);
    }

    /// @notice Revokes a membership (e.g. lost device). Requires the Merkle proof
    /// siblings of the existing commitment so the tree can be updated.
    function removeMembership(
        uint256 identityCommitment,
        uint256[] calldata merkleProofSiblings
    ) external onlyIssuer {
        _recordRootSupersession();
        uint256 index = indexOf(GROUP_ID, identityCommitment);
        _removeMember(GROUP_ID, identityCommitment, merkleProofSiblings);

        emit MembershipRevoked(index, identityCommitment);
    }

    // ---------------------------------------------------------------------
    // Enrollment gate
    // ---------------------------------------------------------------------

    /// @notice Verifies a protocol-scoped Semaphore proof and records the enrollment.
    /// @param protocolId The protocol the participant is enrolling in.
    /// @param siteId The trial site submitting the enrollment (proven as the proof message).
    /// @param proof Semaphore proof generated in the participant's browser with
    ///        scope = computeScope(protocolId) and message = siteId.
    ///
    /// Reverts with:
    ///   - TrialFence__DuplicateEnrollment if this participant already enrolled in the protocol;
    ///   - TrialFence__WrongScope if the proof was generated for another protocol;
    ///   - TrialFence__SiteMismatch if the proof message is not this site;
    ///   - TrialFence__InvalidProof if the ZK proof does not verify.
    function enroll(
        uint256 protocolId,
        uint256 siteId,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        Protocol storage protocol = protocols[protocolId];
        if (!protocol.exists) revert TrialFence__ProtocolNotFound(protocolId);

        if (proof.scope != protocol.scope) {
            revert TrialFence__WrongScope(protocol.scope, proof.scope);
        }

        if (proof.message != siteId) {
            revert TrialFence__SiteMismatch(siteId, proof.message);
        }

        if (enrolled[protocolId][proof.nullifier]) {
            revert TrialFence__DuplicateEnrollment(protocolId, proof.nullifier);
        }

        _verifyProof(proof);

        enrolled[protocolId][proof.nullifier] = true;

        emit EnrollmentAccepted(protocolId, siteId, proof.nullifier, protocol.scope, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns true if the given nullifier already enrolled in the protocol.
    function hasEnrolled(uint256 protocolId, uint256 nullifier) external view returns (bool) {
        return enrolled[protocolId][nullifier];
    }

    /// @notice Current Merkle root of the verified group.
    function currentMerkleTreeRoot() external view returns (uint256) {
        return getMerkleTreeRoot(GROUP_ID);
    }

    /// @notice Number of verified participants in the group.
    function memberCount() external view returns (uint256) {
        return getMerkleTreeSize(GROUP_ID);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Registers the current root as superseded before any tree mutation so
    /// proofs generated against it stay acceptable for MERKLE_TREE_DURATION.
    function _recordRootSupersession() internal {
        uint256 oldRoot = getMerkleTreeRoot(GROUP_ID);
        // 0 marks an unknown root and is also the root of an empty group; never stored.
        if (oldRoot != 0) {
            merkleRootSupersededDates[oldRoot] = block.timestamp;
        }
    }

    /// @dev Verifies the Semaphore proof against the group and the SNARK verifier.
    ///      Mirrors Semaphore.sol's verifyProof, with an added scope binding is
    ///      enforced by the caller (protocol scope) and site binding via message.
    function _verifyProof(ISemaphore.SemaphoreProof calldata proof) internal view {
        if (proof.merkleTreeDepth < MIN_DEPTH || proof.merkleTreeDepth > MAX_DEPTH) {
            revert TrialFence__MerkleTreeDepthNotSupported(proof.merkleTreeDepth);
        }

        if (getMerkleTreeSize(GROUP_ID) == 0) revert TrialFence__GroupHasNoMembers();

        uint256 currentRoot = getMerkleTreeRoot(GROUP_ID);

        // A proof may reference a recent root that a membership change has replaced,
        // giving in-flight proofs a window to land.
        if (proof.merkleTreeRoot != currentRoot) {
            uint256 merkleRootSupersededDate = merkleRootSupersededDates[proof.merkleTreeRoot];

            if (merkleRootSupersededDate == 0) {
                revert TrialFence__MerkleTreeRootIsNotPartOfTheGroup(proof.merkleTreeRoot);
            }

            if (block.timestamp - merkleRootSupersededDate >= MERKLE_TREE_DURATION) {
                revert TrialFence__MerkleTreeRootIsExpired(proof.merkleTreeRoot);
            }
        }

        bool valid = verifier.verifyProof(
            [proof.points[0], proof.points[1]],
            [[proof.points[2], proof.points[3]], [proof.points[4], proof.points[5]]],
            [proof.points[6], proof.points[7]],
            [proof.merkleTreeRoot, proof.nullifier, _hash(proof.message), _hash(proof.scope)],
            proof.merkleTreeDepth
        );

        if (!valid) revert TrialFence__InvalidProof();
    }

    /// @dev keccak256 hash of a uint256 reduced to the SNARK scalar modulus,
    ///      identical to Semaphore.sol's _hash.
    function _hash(uint256 message) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(message))) >> 8;
    }
}
