// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal treasury vault used by Somtinel to demonstrate reactive response flows.
contract TreasuryVault {
    struct WithdrawalRequest {
        address requester;
        address to;
        uint256 amount;
        bytes32 reasonHash;
        uint64 createdAt;
        bool executed;
        bool cancelled;
    }

    error NotResponder();
    error InvalidDestination();
    error InvalidAmount();
    error RequestMissing();
    error RequestClosed();
    error InsufficientVaultBalance();

    address public owner;
    address public responder;
    uint256 public nextRequestId = 1;

    mapping(uint256 => WithdrawalRequest) private requests;

    event ResponderUpdated(address indexed responder);
    event WithdrawalRequested(
        uint256 indexed requestId,
        address to,
        uint256 amount,
        bytes32 indexed reasonHash,
        address requester
    );
    event WithdrawalExecuted(
        uint256 indexed requestId,
        address indexed to,
        uint256 amount,
        bytes32 indexed reasonHash,
        address executor
    );
    event WithdrawalCancelled(uint256 indexed requestId, address indexed canceller);
    event Deposit(address indexed from, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyResponder() {
        if (msg.sender != responder) revert NotResponder();
        _;
    }

    constructor(address initialOwner) payable {
        owner = initialOwner;
        emit Deposit(msg.sender, msg.value);
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function setResponder(address newResponder) external onlyOwner {
        responder = newResponder;
        emit ResponderUpdated(newResponder);
    }

    function requestWithdrawal(address to, uint256 amount, bytes32 reasonHash) external returns (uint256 requestId) {
        if (to == address(0)) revert InvalidDestination();
        if (amount == 0) revert InvalidAmount();

        requestId = nextRequestId++;
        requests[requestId] = WithdrawalRequest({
            requester: msg.sender,
            to: to,
            amount: amount,
            reasonHash: reasonHash,
            createdAt: uint64(block.timestamp),
            executed: false,
            cancelled: false
        });

        emit WithdrawalRequested(requestId, to, amount, reasonHash, msg.sender);
    }

    function executeWithdrawal(uint256 requestId)
        external
        onlyResponder
        returns (address to, uint256 amount, bytes32 reasonHash)
    {
        WithdrawalRequest storage request = requests[requestId];
        if (request.createdAt == 0) revert RequestMissing();
        if (request.executed || request.cancelled) revert RequestClosed();

        to = request.to;
        amount = request.amount;
        reasonHash = request.reasonHash;
        request.executed = true;

        if (address(this).balance < amount) revert InsufficientVaultBalance();

        (bool ok,) = to.call{ value: amount }("");
        require(ok, "TRANSFER_FAILED");

        emit WithdrawalExecuted(requestId, to, amount, reasonHash, msg.sender);
    }

    function cancelWithdrawal(uint256 requestId) external onlyResponder {
        WithdrawalRequest storage request = requests[requestId];
        if (request.createdAt == 0) revert RequestMissing();
        if (request.executed || request.cancelled) revert RequestClosed();

        request.cancelled = true;
        emit WithdrawalCancelled(requestId, msg.sender);
    }

    function getRequestView(uint256 requestId)
        external
        view
        returns (
            address requester,
            address to,
            uint256 amount,
            bytes32 reasonHash,
            uint64 createdAt,
            bool executed,
            bool cancelled
        )
    {
        WithdrawalRequest storage request = requests[requestId];
        return (
            request.requester,
            request.to,
            request.amount,
            request.reasonHash,
            request.createdAt,
            request.executed,
            request.cancelled
        );
    }
}
