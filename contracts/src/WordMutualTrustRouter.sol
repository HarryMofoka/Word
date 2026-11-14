// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWordMutualTrust} from "./interfaces/IWordMutualTrust.sol";

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title WordMutualTrustRouter
 * @notice Enforces on-chain bilateral EIP-712 consent (both sender and recipient
 *         signatures over the identical canonical transaction hash) before executing
 *         direct native or ERC-20 settlement transfers.
 *
 *         STATUS: Authored reference contract awaiting deployment & Foundry test execution.
 *         Current Word app runtime enforces dual approvals off-chain via Edge Functions.
 */
contract WordMutualTrustRouter is IWordMutualTrust {
    address public constant NATIVE_ASSET_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    string public constant SENDER_APPROVAL_STATEMENT =
        "I have reviewed the recipient's verification results and agree to proceed with this transaction.";
    string public constant RECIPIENT_APPROVAL_STATEMENT =
        "I have reviewed the sender's verification results and agree to receive this transaction.";

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant MUTUAL_TRUST_APPROVAL_TYPEHASH = keccak256(
        "MutualTrustApproval(bytes32 canonicalHash,string sessionId,string paymentRequestId,bytes32 agreementTermsHash,address sender,address recipient,address token,uint256 amountAtomic,bytes32 nonce,uint256 expiresAt,string role,string statement)"
    );

    uint256 private constant HALF_SECP256K1_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 private _locked = 1;
    mapping(bytes32 canonicalHash => bool) public consumedCanonicalHashes;
    mapping(bytes32 nonce => bool) public consumedNonces;

    error ReentrancyBlocked();
    error ExpiredAuthorization();
    error AlreadyExecuted();
    error InvalidParties();
    error InvalidAmount();
    error InvalidSigner(string role, address recovered, address expected);
    error InvalidSignatureLength();
    error InvalidSignatureValues();
    error FeeOnTransferUnsupported();
    error TransferFailed();

    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyBlocked();
        _locked = 2;
        _;
        _locked = 1;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("WordMutualTrust")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashApprovalStruct(
        MutualTransferParams calldata p,
        string memory role,
        string memory statement
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MUTUAL_TRUST_APPROVAL_TYPEHASH,
                p.canonicalHash,
                keccak256(bytes(p.sessionId)),
                keccak256(bytes(p.paymentRequestId)),
                p.agreementTermsHash,
                p.sender,
                p.recipient,
                p.token,
                p.amountAtomic,
                p.nonce,
                p.expiresAt,
                keccak256(bytes(role)),
                keccak256(bytes(statement))
            )
        );
    }

    /**
     * @notice Executes a mutually approved native or ERC-20 transfer only when
     *         BOTH sender and recipient EIP-712 approvals verify cleanly.
     */
    function executeMutualTransfer(
        MutualTransferParams calldata p,
        bytes calldata senderSignature,
        bytes calldata recipientSignature
    ) external payable nonReentrant {
        if (block.timestamp > p.expiresAt) revert ExpiredAuthorization();
        if (p.sender == address(0) || p.recipient == address(0) || p.sender == p.recipient) {
            revert InvalidParties();
        }
        if (p.amountAtomic == 0) revert InvalidAmount();
        if (consumedCanonicalHashes[p.canonicalHash] || consumedNonces[p.nonce]) {
            revert AlreadyExecuted();
        }

        bytes32 sep = domainSeparator();

        bytes32 senderDigest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                sep,
                hashApprovalStruct(p, "sender", SENDER_APPROVAL_STATEMENT)
            )
        );
        address recoveredSender = _recoverSigner(senderDigest, senderSignature);
        if (recoveredSender != p.sender) {
            revert InvalidSigner("sender", recoveredSender, p.sender);
        }

        bytes32 recipientDigest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                sep,
                hashApprovalStruct(p, "recipient", RECIPIENT_APPROVAL_STATEMENT)
            )
        );
        address recoveredRecipient = _recoverSigner(recipientDigest, recipientSignature);
        if (recoveredRecipient != p.recipient) {
            revert InvalidSigner("recipient", recoveredRecipient, p.recipient);
        }

        consumedCanonicalHashes[p.canonicalHash] = true;
        consumedNonces[p.nonce] = true;

        if (p.token == NATIVE_ASSET_SENTINEL || p.token == address(0)) {
            if (msg.value != p.amountAtomic) revert InvalidAmount();
            (bool ok,) = payable(p.recipient).call{value: p.amountAtomic}("");
            if (!ok) revert TransferFailed();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            uint256 beforeBal = IERC20Minimal(p.token).balanceOf(p.recipient);
            _safeTransferFrom(p.token, p.sender, p.recipient, p.amountAtomic);
            uint256 afterBal = IERC20Minimal(p.token).balanceOf(p.recipient);
            if (afterBal - beforeBal != p.amountAtomic) revert FeeOnTransferUnsupported();
        }

        emit MutualTrustPaymentExecuted(
            p.canonicalHash,
            p.sender,
            p.recipient,
            p.token,
            p.amountAtomic,
            p.nonce,
            p.agreementTermsHash
        );
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignatureValues();
        if (uint256(s) > HALF_SECP256K1_ORDER) revert InvalidSignatureValues();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignatureValues();
        return recovered;
    }
}

