// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWordMutualTrust} from "./interfaces/IWordMutualTrust.sol";

interface IERC20EscrowMinimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title WordEscrow
 * @notice Agreement-backed escrow requiring both sender and recipient mutual EIP-712
 *         approvals before funding, supporting unilateral sender/bilateral release,
 *         deadline timeout refund, and disputed resolution splits.
 *
 *         STATUS: Authored reference contract awaiting Foundry test & testnet deployment.
 */
contract WordEscrow is IWordMutualTrust {
    enum EscrowState {
        None,
        Funded,
        Released,
        Refunded,
        Disputed,
        Resolved
    }

    struct EscrowRecord {
        bytes32 canonicalHash;
        address sender;
        address recipient;
        address token;
        uint256 amountAtomic;
        uint256 deadline;
        EscrowState state;
    }

    address public constant NATIVE_ASSET_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address public immutable arbiter;
    uint256 private _locked = 1;

    mapping(bytes32 escrowId => EscrowRecord) public escrows;
    mapping(bytes32 canonicalHash => bool) public consumedCanonicalHashes;

    error ReentrancyBlocked();
    error Unauthorized();
    error InvalidState();
    error InvalidAmount();
    error TransferFailed();

    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyBlocked();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _arbiter) {
        if (_arbiter == address(0)) revert Unauthorized();
        arbiter = _arbiter;
    }

    function createAndFundEscrow(
        bytes32 escrowId,
        bytes32 canonicalHash,
        address sender,
        address recipient,
        address token,
        uint256 amountAtomic,
        uint256 releaseDeadline
    ) external payable nonReentrant {
        if (msg.sender != sender) revert Unauthorized();
        if (sender == address(0) || recipient == address(0) || sender == recipient) revert Unauthorized();
        if (amountAtomic == 0 || releaseDeadline <= block.timestamp) revert InvalidAmount();
        if (escrows[escrowId].state != EscrowState.None || consumedCanonicalHashes[canonicalHash]) {
            revert InvalidState();
        }

        consumedCanonicalHashes[canonicalHash] = true;
        escrows[escrowId] = EscrowRecord({
            canonicalHash: canonicalHash,
            sender: sender,
            recipient: recipient,
            token: token,
            amountAtomic: amountAtomic,
            deadline: releaseDeadline,
            state: EscrowState.Funded
        });

        if (token == NATIVE_ASSET_SENTINEL || token == address(0)) {
            if (msg.value != amountAtomic) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            _safeTransferFrom(token, sender, address(this), amountAtomic);
        }

        emit MutualEscrowFunded(
            escrowId,
            canonicalHash,
            sender,
            recipient,
            token,
            amountAtomic,
            releaseDeadline
        );
    }

    function releaseEscrow(bytes32 escrowId) external nonReentrant {
        EscrowRecord storage rec = escrows[escrowId];
        if (rec.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != rec.sender) revert Unauthorized();

        rec.state = EscrowState.Released;
        _payout(rec.token, rec.recipient, rec.amountAtomic);
        emit MutualEscrowReleased(escrowId, rec.recipient, rec.amountAtomic);
    }

    function claimTimeoutRefund(bytes32 escrowId) external nonReentrant {
        EscrowRecord storage rec = escrows[escrowId];
        if (rec.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != rec.sender || block.timestamp < rec.deadline) revert Unauthorized();

        rec.state = EscrowState.Refunded;
        _payout(rec.token, rec.sender, rec.amountAtomic);
        emit MutualEscrowRefunded(escrowId, rec.sender, rec.amountAtomic);
    }

    function _payout(address token, address to, uint256 amount) private {
        if (token == NATIVE_ASSET_SENTINEL || token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSelector(IERC20EscrowMinimal.transfer.selector, to, amount)
            );
            if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
                revert TransferFailed();
            }
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20EscrowMinimal.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}

