// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IWordMutualTrust {
    struct MutualTransferParams {
        bytes32 canonicalHash;
        string sessionId;
        string paymentRequestId;
        bytes32 agreementTermsHash;
        address sender;
        address recipient;
        address token; // Use NATIVE_ASSET_SENTINEL for ETH/POL native transfers
        uint256 amountAtomic;
        bytes32 nonce;
        uint256 expiresAt;
    }

    event MutualTrustPaymentExecuted(
        bytes32 indexed canonicalHash,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amountAtomic,
        bytes32 nonce,
        bytes32 agreementTermsHash
    );

    event MutualEscrowFunded(
        bytes32 indexed escrowId,
        bytes32 indexed canonicalHash,
        address indexed sender,
        address recipient,
        address token,
        uint256 amountAtomic,
        uint256 releaseDeadline
    );

    event MutualEscrowReleased(
        bytes32 indexed escrowId,
        address indexed recipient,
        uint256 amountAtomic
    );

    event MutualEscrowRefunded(
        bytes32 indexed escrowId,
        address indexed sender,
        uint256 amountAtomic
    );
}

