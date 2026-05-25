// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ISomniaEventHandler {
    function onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) external;
}

