// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ITreasuryVault {
    function executeWithdrawal(uint256 requestId) external returns (address to, uint256 amount, bytes32 reasonHash);
    function cancelWithdrawal(uint256 requestId) external;
}
