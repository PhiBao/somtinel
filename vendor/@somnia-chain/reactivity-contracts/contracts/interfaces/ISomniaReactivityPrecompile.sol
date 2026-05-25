// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library SomniaExtensions {
    address constant SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS = address(0x0100);
    uint256 constant SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether;
}

interface ISomniaReactivityPrecompile {
    event BlockTick(uint64 indexed blockNumber);
    event Schedule(uint256 indexed timestampMillis);

    struct SubscriptionData {
        bytes32[4] eventTopics;
        address origin;
        address caller;
        address emitter;
        address handlerContractAddress;
        bytes4 handlerFunctionSelector;
        uint64 priorityFeePerGas;
        uint64 maxFeePerGas;
        uint64 gasLimit;
        bool isGuaranteed;
        bool isCoalesced;
    }

    event SubscriptionCreated(uint256 indexed subscriptionId, address indexed owner, SubscriptionData subscriptionData);
    event SubscriptionRemoved(uint256 indexed subscriptionId, address indexed owner);

    function subscribe(SubscriptionData calldata subscriptionData) external returns (uint256 subscriptionId);
    function unsubscribe(uint256 subscriptionId) external;
    function getSubscriptionInfo(uint256 subscriptionId)
        external
        view
        returns (SubscriptionData memory subscriptionData, address owner);
}

