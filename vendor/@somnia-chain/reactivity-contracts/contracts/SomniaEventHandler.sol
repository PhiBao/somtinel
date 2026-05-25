// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC165 } from "./interfaces/IERC165.sol";
import { ISomniaEventHandler } from "./interfaces/ISomniaEventHandler.sol";
import { SomniaExtensions } from "./interfaces/ISomniaReactivityPrecompile.sol";

abstract contract SomniaEventHandler is IERC165, ISomniaEventHandler {
    error OnlyReactivityPrecompile();

    function onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) external override {
        if (msg.sender != SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS) {
            revert OnlyReactivityPrecompile();
        }
        _onEvent(emitter, eventTopics, data);
    }

    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) internal virtual;

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(ISomniaEventHandler).interfaceId;
    }
}
