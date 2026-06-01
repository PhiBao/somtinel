// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SomniaEventHandler } from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import { ISomniaReactivityPrecompile, SomniaExtensions } from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

import { ITreasuryVault } from "./interfaces/ITreasuryVault.sol";

/// @notice Reactive treasury responder that auto-executes safe payouts and escalates suspicious ones.
contract SomtinelResponder is SomniaEventHandler {
    enum IncidentStatus {
        None,
        AutoExecuted,
        NeedsReview,
        Escalated,
        Cancelled,
        Cleared
    }

    struct Incident {
        uint256 requestId;
        address destination;
        uint256 amount;
        bytes32 reasonHash;
        uint64 openedAt;
        uint64 reviewDeadlineMs;
        uint8 riskScore;
        IncidentStatus status;
        bool destinationTrusted;
    }

    error OnlyOwner();
    error UnsupportedEvent();
    error InvalidIncident();
    error InvalidStatus();

    uint256 public constant REVIEW_WINDOW_MS = 15 minutes * 1000;
    bytes32 public constant WITHDRAWAL_REQUESTED_TOPIC =
        keccak256("WithdrawalRequested(uint256,address,uint256,bytes32,address)");
    bytes32 public constant INCIDENT_OPENED_TOPIC =
        keccak256("IncidentOpened(uint256,address,uint256,bytes32,uint256,bool)");
    bytes32 public constant INCIDENT_ESCALATED_TOPIC = keccak256("IncidentEscalated(uint256,uint256)");
    bytes32 public constant INCIDENT_RESOLVED_TOPIC = keccak256("IncidentResolved(uint256,bool,uint8)");
    bytes32 public constant SCHEDULE_TOPIC = keccak256("Schedule(uint256)");

    address public immutable owner;
    ITreasuryVault public immutable vault;
    uint256 public withdrawalSubscriptionId;
    uint256 public nextIncidentId = 1;

    /// @notice Configurable risk parameters
    uint8 public riskCutoff = 34;
    uint256 public defaultTrustedLimit = 5 ether;

    mapping(address => bool) public trustedDestinations;
    mapping(address => uint256) public destinationLimits;
    mapping(uint256 => Incident) private incidents;
    mapping(uint64 => uint256) private incidentIdByDeadlineMs;

    event TrustedDestinationUpdated(address indexed destination, bool isTrusted);
    event DestinationLimitUpdated(address indexed destination, uint256 limit);
    event RiskConfigUpdated(uint8 riskCutoff, uint256 defaultTrustedLimit);
    event WithdrawalSubscriptionCreated(uint256 indexed subscriptionId);
    event IncidentOpened(
        uint256 indexed incidentId,
        address indexed destination,
        uint256 amount,
        bytes32 indexed reasonHash,
        uint256 requestId,
        bool autoExecuted
    );
    event IncidentEscalated(uint256 indexed incidentId, uint256 reviewDeadlineMs);
    event IncidentResolved(uint256 indexed incidentId, bool approved, uint8 newStatus);

    function withdrawStuckEth(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{ value: amount }("");
        require(ok, "ETH_TRANSFER_FAILED");
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address initialOwner, address vaultAddress) {
        owner = initialOwner;
        vault = ITreasuryVault(vaultAddress);
    }

    receive() external payable {}

    function setRiskConfig(uint8 newCutoff, uint256 newDefaultLimit) external onlyOwner {
        riskCutoff = newCutoff;
        defaultTrustedLimit = newDefaultLimit;
        emit RiskConfigUpdated(newCutoff, newDefaultLimit);
    }

    function setDestinationLimit(address destination, uint256 limit) external onlyOwner {
        destinationLimits[destination] = limit;
        emit DestinationLimitUpdated(destination, limit);
    }

    function setTrustedDestination(address destination, bool isTrusted) external onlyOwner {
        trustedDestinations[destination] = isTrusted;
        emit TrustedDestinationUpdated(destination, isTrusted);
    }

    function createWithdrawalSubscription(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit)
        external
        onlyOwner
        returns (uint256 subscriptionId)
    {
        if (withdrawalSubscriptionId != 0) {
            ISomniaReactivityPrecompile(SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS).unsubscribe(
                withdrawalSubscriptionId
            );
        }

        ISomniaReactivityPrecompile.SubscriptionData memory subscriptionData = ISomniaReactivityPrecompile
            .SubscriptionData({
            eventTopics: [WITHDRAWAL_REQUESTED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            caller: address(0),
            emitter: address(vault),
            handlerContractAddress: address(this),
            handlerFunctionSelector: this.onEvent.selector,
            priorityFeePerGas: priorityFeePerGas,
            maxFeePerGas: maxFeePerGas,
            gasLimit: gasLimit,
            isGuaranteed: false,
            isCoalesced: false
        });

        subscriptionId = ISomniaReactivityPrecompile(SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS).subscribe(
            subscriptionData
        );
        withdrawalSubscriptionId = subscriptionId;
        emit WithdrawalSubscriptionCreated(subscriptionId);
    }

    function previewRisk(address destination, uint256 amount) external view returns (uint8 score, bool trusted, bool autoExecute)
    {
        return _previewRisk(destination, amount);
    }

    function resolveIncident(uint256 incidentId, bool approve) external onlyOwner {
        Incident storage incident = incidents[incidentId];
        if (incident.requestId == 0) revert InvalidIncident();
        if (
            incident.status != IncidentStatus.NeedsReview &&
            incident.status != IncidentStatus.Escalated
        ) revert InvalidStatus();

        if (approve) {
            vault.executeWithdrawal(incident.requestId);
            incident.status = IncidentStatus.Cleared;
        } else {
            vault.cancelWithdrawal(incident.requestId);
            incident.status = IncidentStatus.Cancelled;
        }

        emit IncidentResolved(incidentId, approve, uint8(incident.status));
    }

    function getIncidentView(uint256 incidentId)
        external
        view
        returns (
            uint256 requestId,
            address destination,
            uint256 amount,
            bytes32 reasonHash,
            uint64 openedAt,
            uint64 reviewDeadlineMs,
            uint8 riskScore,
            uint8 status,
            bool destinationTrusted
        )
    {
        Incident storage incident = incidents[incidentId];
        return (
            incident.requestId,
            incident.destination,
            incident.amount,
            incident.reasonHash,
            incident.openedAt,
            incident.reviewDeadlineMs,
            incident.riskScore,
            uint8(incident.status),
            incident.destinationTrusted
        );
    }

    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) internal override {
        if (emitter == address(vault) && eventTopics.length > 0 && eventTopics[0] == WITHDRAWAL_REQUESTED_TOPIC) {
            _handleWithdrawalRequest(eventTopics, data);
            return;
        }

        if (
            emitter == SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS &&
            eventTopics.length > 0 &&
            eventTopics[0] == SCHEDULE_TOPIC
        ) {
            _handleScheduledEscalation(eventTopics);
            return;
        }

        revert UnsupportedEvent();
    }

    function _handleWithdrawalRequest(bytes32[] calldata eventTopics, bytes calldata data) internal {
        if (eventTopics.length < 3) revert UnsupportedEvent();

        uint256 requestId = uint256(eventTopics[1]);
        bytes32 reasonHash = eventTopics[2];
        (address destination, uint256 amount, address requester) = abi.decode(data, (address, uint256, address));
        requester;

        (uint8 riskScore, bool trusted, bool autoExecute) = _previewRisk(destination, amount);

        if (autoExecute) {
            vault.executeWithdrawal(requestId);
            emit IncidentOpened(0, destination, amount, reasonHash, requestId, true);
            return;
        }

        uint256 incidentId = nextIncidentId++;
        uint64 reviewDeadlineMs = uint64(block.timestamp * 1000 + REVIEW_WINDOW_MS + incidentId);

        incidents[incidentId] = Incident({
            requestId: requestId,
            destination: destination,
            amount: amount,
            reasonHash: reasonHash,
            openedAt: uint64(block.timestamp),
            reviewDeadlineMs: reviewDeadlineMs,
            riskScore: riskScore,
            status: IncidentStatus.NeedsReview,
            destinationTrusted: trusted
        });
        incidentIdByDeadlineMs[reviewDeadlineMs] = incidentId;

        emit IncidentOpened(incidentId, destination, amount, reasonHash, requestId, false);
    }

    function _handleScheduledEscalation(bytes32[] calldata eventTopics) internal {
        if (eventTopics.length < 2) revert UnsupportedEvent();
        uint64 reviewDeadlineMs = uint64(uint256(eventTopics[1]));
        uint256 incidentId = incidentIdByDeadlineMs[reviewDeadlineMs];

        Incident storage incident = incidents[incidentId];
        if (incident.requestId == 0) revert InvalidIncident();
        if (incident.status != IncidentStatus.NeedsReview) return;

        incident.status = IncidentStatus.Escalated;
        emit IncidentEscalated(incidentId, incident.reviewDeadlineMs);
    }

    function _scheduleEscalation(uint64 reviewDeadlineMs) internal {
        ISomniaReactivityPrecompile.SubscriptionData memory subscriptionData = ISomniaReactivityPrecompile
            .SubscriptionData({
            eventTopics: [SCHEDULE_TOPIC, bytes32(uint256(reviewDeadlineMs)), bytes32(0), bytes32(0)],
            origin: address(0),
            caller: address(0),
            emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS,
            handlerContractAddress: address(this),
            handlerFunctionSelector: this.onEvent.selector,
            priorityFeePerGas: 0,
            maxFeePerGas: 0,
            gasLimit: 600_000,
            isGuaranteed: false,
            isCoalesced: false
        });

        ISomniaReactivityPrecompile(SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS).subscribe(subscriptionData);
    }

    function _previewRisk(address destination, uint256 amount)
        internal
        view
        returns (uint8 score, bool trusted, bool autoExecute)
    {
        trusted = trustedDestinations[destination];
        uint256 limit = destinationLimits[destination] != 0 ? destinationLimits[destination] : defaultTrustedLimit;

        if (trusted && amount <= limit) {
            return (12, true, true);
        }

        if (trusted && limit > 0 && amount > limit) {
            return (58, true, false);
        }

        uint256 untrustedThreshold = 1 ether;
        if (amount <= untrustedThreshold) {
            return (44, false, false);
        }

        return (88, false, false);
    }
}
