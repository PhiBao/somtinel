// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISomniaReactivityPrecompile } from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";
import { ISomniaEventHandler } from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaEventHandler.sol";

contract MockReactivityPrecompile is ISomniaReactivityPrecompile {
    uint256 public nextSubscriptionId = 1;

    mapping(uint256 => SubscriptionData) private subscriptions;
    mapping(uint256 => address) private owners;

    function subscribe(SubscriptionData calldata subscriptionData) external returns (uint256 subscriptionId) {
        subscriptionId = nextSubscriptionId++;
        subscriptions[subscriptionId] = subscriptionData;
        owners[subscriptionId] = msg.sender;
        emit SubscriptionCreated(subscriptionId, msg.sender, subscriptionData);
    }

    function unsubscribe(uint256 subscriptionId) external {
        delete subscriptions[subscriptionId];
        delete owners[subscriptionId];
        emit SubscriptionRemoved(subscriptionId, msg.sender);
    }

    function getSubscriptionInfo(uint256 subscriptionId)
        external
        view
        returns (SubscriptionData memory subscriptionData, address owner)
    {
        return (subscriptions[subscriptionId], owners[subscriptionId]);
    }

    function invoke(address handler, address emitter, bytes32[] calldata eventTopics, bytes calldata data) external {
        ISomniaEventHandler(handler).onEvent(emitter, eventTopics, data);
    }
}

