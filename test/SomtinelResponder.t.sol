// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { TreasuryVault } from "../src/TreasuryVault.sol";
import { SomtinelResponder } from "../src/SomtinelResponder.sol";
import { ISomniaReactivityPrecompile } from
    "../vendor/@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

contract SomtinelResponderTest is Test {
    bytes32 internal constant WITHDRAWAL_TOPIC =
        keccak256("WithdrawalRequested(uint256,address,uint256,bytes32,address)");
    bytes32 internal constant SCHEDULE_TOPIC = keccak256("Schedule(uint256)");

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal safeDestination = makeAddr("safeDestination");
    address internal riskyDestination = makeAddr("riskyDestination");
    bytes32 internal reasonHash = keccak256("ops:payout");

    TreasuryVault internal vault;
    SomtinelResponder internal responder;

    function setUp() external {
        vault = new TreasuryVault{ value: 50 ether }(owner);
        responder = new SomtinelResponder(owner, address(vault));

        vm.prank(owner);
        vault.setResponder(address(responder));

        vm.prank(owner);
        responder.setTrustedDestination(safeDestination, true);

        vm.mockCall(
            address(0x0100),
            abi.encodeWithSelector(ISomniaReactivityPrecompile.subscribe.selector),
            abi.encode(uint256(1))
        );
    }

    function testAutoExecutesTrustedLowValueWithdrawal() external {
        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(safeDestination, 2 ether, reasonHash);

        bytes32[] memory topics = new bytes32[](3);
        topics[0] = WITHDRAWAL_TOPIC;
        topics[1] = bytes32(requestId);
        topics[2] = reasonHash;

        bytes memory data = abi.encode(safeDestination, 2 ether, operator);

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), topics, data);

        (, , , , , bool executed, bool cancelled) = vault.getRequestView(requestId);
        assertTrue(executed);
        assertFalse(cancelled);
        assertEq(safeDestination.balance, 2 ether);
    }

    function testCreatesIncidentForRiskyWithdrawal() external {
        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(riskyDestination, 7 ether, reasonHash);

        bytes32[] memory topics = new bytes32[](3);
        topics[0] = WITHDRAWAL_TOPIC;
        topics[1] = bytes32(requestId);
        topics[2] = reasonHash;

        bytes memory data = abi.encode(riskyDestination, 7 ether, operator);

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), topics, data);

        (
            uint256 incidentRequestId,
            address destination,
            uint256 amount,
            ,
            ,
            uint64 reviewDeadlineMs,
            uint8 riskScore,
            uint8 status,
            bool destinationTrusted
        ) = responder.getIncidentView(1);

        assertEq(incidentRequestId, requestId);
        assertEq(destination, riskyDestination);
        assertEq(amount, 7 ether);
        assertGt(reviewDeadlineMs, 0);
        assertEq(riskScore, 88);
        assertEq(status, 2);
        assertFalse(destinationTrusted);
    }

    function testEscalatesIncidentOnScheduledTick() external {
        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(riskyDestination, 7 ether, reasonHash);

        bytes32[] memory withdrawalTopics = new bytes32[](3);
        withdrawalTopics[0] = WITHDRAWAL_TOPIC;
        withdrawalTopics[1] = bytes32(requestId);
        withdrawalTopics[2] = reasonHash;

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), withdrawalTopics, abi.encode(riskyDestination, 7 ether, operator));

        bytes32[] memory scheduleTopics = new bytes32[](2);
        scheduleTopics[0] = SCHEDULE_TOPIC;
        (, , , , , uint64 reviewDeadlineMs, , ,) = responder.getIncidentView(1);
        scheduleTopics[1] = bytes32(uint256(reviewDeadlineMs));

        vm.prank(address(0x0100));
        responder.onEvent(address(0x0100), scheduleTopics, "");

        (, , , , , , , uint8 status,) = responder.getIncidentView(1);
        assertEq(status, 3);
    }

    function testOwnerCanApproveIncident() external {
        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(riskyDestination, 7 ether, reasonHash);

        bytes32[] memory topics = new bytes32[](3);
        topics[0] = WITHDRAWAL_TOPIC;
        topics[1] = bytes32(requestId);
        topics[2] = reasonHash;

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), topics, abi.encode(riskyDestination, 7 ether, operator));

        vm.prank(owner);
        responder.resolveIncident(1, true);

        (, , , , , bool executed,) = vault.getRequestView(requestId);
        (, , , , , , , uint8 status,) = responder.getIncidentView(1);

        assertTrue(executed);
        assertEq(status, 5);
    }

    function testOwnerCanRejectIncident() external {
        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(riskyDestination, 7 ether, reasonHash);

        bytes32[] memory topics = new bytes32[](3);
        topics[0] = WITHDRAWAL_TOPIC;
        topics[1] = bytes32(requestId);
        topics[2] = reasonHash;

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), topics, abi.encode(riskyDestination, 7 ether, operator));

        vm.prank(owner);
        responder.resolveIncident(1, false);

        (, , , , , bool executed, bool cancelled) = vault.getRequestView(requestId);
        (, , , , , , , uint8 status,) = responder.getIncidentView(1);

        assertFalse(executed);
        assertTrue(cancelled);
        assertEq(status, 4);
    }

    function testOwnerCanCreateReactiveSubscription() external {
        vm.prank(owner);
        uint256 subscriptionId = responder.createWithdrawalSubscription(1, 0, 500_000);

        assertEq(subscriptionId, 1);
        assertEq(responder.withdrawalSubscriptionId(), 1);
    }

    function testConfigurableRiskThresholds() external {
        // lower the trusted limit to 1 ether
        vm.prank(owner);
        responder.setRiskConfig(50, 1 ether);

        // 2 ether to safe dest should now be blocked (was auto-executable at 5 ether default)
        (uint8 score, bool trusted, bool autoExecute) = responder.previewRisk(safeDestination, 2 ether);
        assertTrue(trusted);
        assertEq(score, 58);
        assertFalse(autoExecute);

        // raise cutoff, 0.5 ether to unknown should still be incident
        (score, trusted, autoExecute) = responder.previewRisk(riskyDestination, 0.5 ether);
        assertFalse(trusted);
        assertEq(score, 44);
        assertFalse(autoExecute);
    }

    function testPerDestinationLimit() external {
        // set a custom limit for safeDestination
        vm.prank(owner);
        responder.setDestinationLimit(safeDestination, 8 ether);

        // 7 ether should now auto-execute (vs 5 ether default)
        (uint8 score, bool trusted, bool autoExecute) = responder.previewRisk(safeDestination, 7 ether);
        assertTrue(trusted);
        assertEq(score, 12);
        assertTrue(autoExecute);

        // other destinations still use default 5 ether
        address otherSafe = makeAddr("otherSafe");
        vm.prank(owner);
        responder.setTrustedDestination(otherSafe, true);
        (score, trusted, autoExecute) = responder.previewRisk(otherSafe, 7 ether);
        assertTrue(trusted);
        assertEq(score, 58);
        assertFalse(autoExecute);
    }

    function testAutoExecutesWithCustomLimit() external {
        vm.prank(owner);
        responder.setDestinationLimit(safeDestination, 10 ether);

        vm.prank(operator);
        uint256 requestId = vault.requestWithdrawal(safeDestination, 8 ether, reasonHash);

        bytes32[] memory topics = new bytes32[](3);
        topics[0] = WITHDRAWAL_TOPIC;
        topics[1] = bytes32(requestId);
        topics[2] = reasonHash;

        vm.prank(address(0x0100));
        responder.onEvent(address(vault), topics, abi.encode(safeDestination, 8 ether, operator));

        (, , , , , bool executed, ) = vault.getRequestView(requestId);
        assertTrue(executed);
    }
}
