import WDK from '@tetherto/wdk';
import WalletManagerEvm, { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm';
import {
  BrowserProvider,
  Contract,
  HDNodeWallet,
  JsonRpcProvider,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  type TypedDataDomain,
  type TypedDataField,
} from 'ethers';
import {
  DEFAULT_DEMO_NETWORK,
  NETWORK_CONFIGS,
  getNetworkByChainId,
  getNetworkConfig,
  validateTokenCompatibility,
  validateWalletAddress,
  type NetworkConfig,
  type SupportedNetworkName,
} from '../config/blockchain';

export {
  DEFAULT_DEMO_NETWORK,
  NETWORK_CONFIGS,
  getNetworkConfig,
  getNetworkByChainId,
  validateWalletAddress,
};
export type { NetworkConfig, SupportedNetworkName };

export interface WalletBalances {
  usdtBalance: string;
  nativeBalance: string;
  nativeSymbol: string;
  networkLabel: string;
  rpcReachable: boolean;
  error?: string;
}

export class WalletIntegrationError extends Error {
  readonly code:
    | 'UNSUPPORTED_WALLET'
    | 'UNSUPPORTED_NETWORK'
    | 'CONNECTION_REJECTED'
    | 'INVALID_SEED'
    | 'INVALID_ADDRESS'
    | 'RPC_ERROR';

  constructor(
    code:
      | 'UNSUPPORTED_WALLET'
      | 'UNSUPPORTED_NETWORK'
      | 'CONNECTION_REJECTED'
      | 'INVALID_SEED'
      | 'INVALID_ADDRESS'
      | 'RPC_ERROR',
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

function formatFixedDisplay(formatted: string, maxDecimals = 4): string {
  const [whole, frac = ''] = formatted.split('.');
  if (!frac) return `${whole}.00`;
  const trimmed = frac.slice(0, maxDecimals).padEnd(2, '0');
  return `${whole}.${trimmed}`;
}

const EvmManager = WalletManagerEvm as unknown as Parameters<WDK['registerWallet']>[1];

interface Eip1193Ethereum {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getInjectedEthereum(): Eip1193Ethereum | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: Eip1193Ethereum }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

/**
 * Generates a fresh self-custodial wallet locally via Tether WDK.
 * Recovery words remain strictly in browser memory and are NEVER sent to the backend.
 */
export async function createWdkWallet(
  network: SupportedNetworkName = DEFAULT_DEMO_NETWORK
): Promise<{ address: string; seedWords: string[]; network: SupportedNetworkName }> {
  const cfg = getNetworkConfig(network);
  const seedPhrase = WDK.getRandomSeedPhrase(12);
  const wdk = new WDK(seedPhrase).registerWallet('ethereum', EvmManager, {
    provider: cfg.rpcUrl,
  } as never);

  try {
    const account = await wdk.getAccount('ethereum', 0);
    const address = await account.getAddress();
    return {
      address,
      seedWords: seedPhrase.split(' '),
      network: cfg.name,
    };
  } finally {
    wdk.dispose();
  }
}

/**
 * Validates and derives a public address from an existing 12 or 24-word BIP-39 phrase via Tether WDK.
 * Never logs or transmits the phrase.
 */
export async function importWdkWallet(
  rawPhrase: string,
  network: SupportedNetworkName = DEFAULT_DEMO_NETWORK
): Promise<{ address: string; network: SupportedNetworkName }> {
  const normalized = rawPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  const wordCount = normalized ? normalized.split(' ').length : 0;

  if (wordCount !== 12 && wordCount !== 24) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'Recovery phrase must contain exactly 12 or 24 words.'
    );
  }

  if (!WDK.isValidSeed(normalized)) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'Invalid BIP-39 recovery phrase. Please check word spelling and order.'
    );
  }

  const cfg = getNetworkConfig(network);
  const wdk = new WDK(normalized).registerWallet('ethereum', EvmManager, {
    provider: cfg.rpcUrl,
  } as never);

  try {
    const account = await wdk.getAccount('ethereum', 0);
    const address = await account.getAddress();
    return { address, network: cfg.name };
  } finally {
    wdk.dispose();
  }
}

/**
 * Switches the connected EIP-1193 browser wallet to a supported Word testnet,
 * adding the network configuration via wallet_addEthereumChain if not yet present (4902).
 */
export async function switchBrowserNetwork(
  targetNetwork: SupportedNetworkName
): Promise<NetworkConfig> {
  const target = getNetworkConfig(targetNetwork);
  const eth = getInjectedEthereum();
  if (!eth) {
    return target;
  }

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target.chainIdHex }],
    });
    return target;
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: target.chainIdHex,
            chainName: target.label,
            rpcUrls: [target.rpcUrl, ...target.fallbackRpcUrls],
            blockExplorerUrls: [target.explorerUrl],
            nativeCurrency: {
              name: target.nativeSymbol,
              symbol: target.nativeSymbol,
              decimals: target.nativeDecimals,
            },
          },
        ],
      });
      return target;
    }
    if (code === 4001) {
      throw new WalletIntegrationError(
        'CONNECTION_REJECTED',
        `Network switch to ${target.label} was rejected in your browser wallet.`
      );
    }
    throw new WalletIntegrationError(
      'UNSUPPORTED_NETWORK',
      `Unable to switch to ${target.label} (${target.chainId}).`
    );
  }
}

/**
 * Detects whether the active browser wallet is on a supported Word testnet or an unsupported chain.
 */
export async function detectBrowserNetwork(): Promise<{
  supported: boolean;
  chainId: number | null;
  network: NetworkConfig | null;
}> {
  const eth = getInjectedEthereum();
  if (!eth) return { supported: true, chainId: null, network: null };

  const provider = new BrowserProvider(eth);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const matched = getNetworkByChainId(chainId);
  return {
    supported: Boolean(matched),
    chainId,
    network: matched,
  };
}

/**
 * Connects an existing EIP-1193 browser wallet (e.g. MetaMask / Rabby).
 * Explicitly handles missing providers, rejected connections, and unsupported networks.
 */
export async function connectBrowserWallet(
  preferredNetwork: SupportedNetworkName = DEFAULT_DEMO_NETWORK
): Promise<{ address: string; network: SupportedNetworkName; chainId: number }> {
  const eth = getInjectedEthereum();

  if (!eth) {
    throw new WalletIntegrationError(
      'UNSUPPORTED_WALLET',
      'No EIP-1193 browser wallet detected. Install MetaMask or create/import a WDK testnet wallet instead.'
    );
  }

  try {
    const provider = new BrowserProvider(eth);
    const accounts = (await provider.send('eth_requestAccounts', [])) as string[];
    if (!accounts || accounts.length === 0) {
      throw new WalletIntegrationError(
        'CONNECTION_REJECTED',
        'No wallet account was authorized.'
      );
    }

    const net = await provider.getNetwork();
    const currentChainId = Number(net.chainId);
    const matchedNetwork = getNetworkByChainId(currentChainId);

    if (matchedNetwork) {
      return {
        address: accounts[0],
        network: matchedNetwork.name,
        chainId: currentChainId,
      };
    }

    const switched = await switchBrowserNetwork(preferredNetwork);
    return {
      address: accounts[0],
      network: switched.name,
      chainId: switched.chainId,
    };
  } catch (err) {
    if (err instanceof WalletIntegrationError) throw err;
    const code = (err as { code?: number })?.code;
    if (code === 4001) {
      throw new WalletIntegrationError(
        'CONNECTION_REJECTED',
        'Wallet connection was rejected in your browser extension.'
      );
    }
    if (code === -32002) {
      throw new WalletIntegrationError(
        'CONNECTION_REJECTED',
        'A wallet connection prompt is already open in your browser extension.'
      );
    }
    throw new WalletIntegrationError(
      'RPC_ERROR',
      err instanceof Error ? err.message : 'Unable to connect browser wallet.'
    );
  }
}

/**
 * Retrieves live native and USDT/token testnet balances using Tether WDK read-only EVM account.
 */
export async function fetchWdkBalances(
  address: string,
  network: string = DEFAULT_DEMO_NETWORK
): Promise<WalletBalances> {
  const addrCheck = validateWalletAddress(address, 'Wallet address');
  if (!addrCheck.valid) {
    return {
      usdtBalance: '0.00',
      nativeBalance: '0.00',
      nativeSymbol: 'ETH',
      networkLabel: getNetworkConfig(network).label,
      rpcReachable: false,
      error: addrCheck.reason,
    };
  }

  const cfg = getNetworkConfig(network);
  try {
    const readOnlyAccount = new WalletAccountReadOnlyEvm(address, {
      provider: cfg.rpcUrl,
    });

    const nativeWei = await readOnlyAccount.getBalance();
    const nativeFormatted = formatFixedDisplay(formatEther(nativeWei), 4);

    let usdtFormatted = '0.00';
    const usdtCfg = cfg.tokens.USDT;
    if (usdtCfg?.contractAddress) {
      try {
        const tokenRaw = await readOnlyAccount.getTokenBalance(usdtCfg.contractAddress);
        usdtFormatted = formatFixedDisplay(formatUnits(tokenRaw, usdtCfg.decimals), 2);
      } catch {
        usdtFormatted = '0.00';
      }
    }

    return {
      usdtBalance: usdtFormatted,
      nativeBalance: nativeFormatted,
      nativeSymbol: cfg.nativeSymbol,
      networkLabel: cfg.label,
      rpcReachable: true,
    };
  } catch (err) {
    return {
      usdtBalance: '0.00',
      nativeBalance: '0.00',
      nativeSymbol: cfg.nativeSymbol,
      networkLabel: cfg.label,
      rpcReachable: false,
      error: err instanceof Error ? err.message : 'Testnet RPC unavailable',
    };
  }
}

export async function estimateWdkGasFee(
  network: string = DEFAULT_DEMO_NETWORK
): Promise<string> {
  const cfg = getNetworkConfig(network);
  try {
    const provider = new JsonRpcProvider(cfg.rpcUrl);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 1_500_000_000n;
    const estimatedWei = gasPrice * 65_000n;
    return `${formatFixedDisplay(formatEther(estimatedWei), 6)} ${cfg.nativeSymbol}`;
  } catch {
    return `~0.0001 ${cfg.nativeSymbol}`;
  }
}

export interface TransferQuote {
  senderTokenBalance: string;
  senderNativeBalance: string;
  nativeSymbol: string;
  estimatedFeeNative: string;
  totalCostDisplay: string;
  hasSufficientBalance: boolean;
  insufficientReason?: string;
}

export async function quoteTransferCost(params: {
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
}): Promise<TransferQuote> {
  const cfg = getNetworkConfig(params.network);
  const tokenCheck = validateTokenCompatibility(params.tokenSymbol, cfg.name);
  if (!tokenCheck.compatible || !tokenCheck.config) {
    return {
      senderTokenBalance: '0.00',
      senderNativeBalance: '0.00',
      nativeSymbol: cfg.nativeSymbol,
      estimatedFeeNative: `~0.0001 ${cfg.nativeSymbol}`,
      totalCostDisplay: `${params.amount} ${params.tokenSymbol}`,
      hasSufficientBalance: false,
      insufficientReason: tokenCheck.reason,
    };
  }

  const tokenCfg = tokenCheck.config;
  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const readOnly = new WalletAccountReadOnlyEvm(params.senderAddress, {
    provider: cfg.rpcUrl,
  });

  const [nativeWei, feeData] = await Promise.all([
    readOnly.getBalance().catch(() => 0n),
    provider.getFeeData().catch(() => ({ gasPrice: 1_500_000_000n })),
  ]);

  const gasUnits = tokenCfg.isNative ? 21_000n : 65_000n;
  const gasPrice = feeData.gasPrice ?? 1_500_000_000n;
  const feeWei = gasPrice * gasUnits;
  const feeDisplay = `${formatFixedDisplay(formatEther(feeWei), 6)} ${cfg.nativeSymbol}`;
  const nativeDisplay = formatFixedDisplay(formatEther(nativeWei), 4);

  let tokenRaw = nativeWei;
  if (!tokenCfg.isNative && tokenCfg.contractAddress) {
    tokenRaw = await readOnly.getTokenBalance(tokenCfg.contractAddress).catch(() => 0n);
  }
  const tokenBalanceDisplay = formatFixedDisplay(
    formatUnits(tokenRaw, tokenCfg.decimals),
    tokenCfg.isNative ? 4 : 2
  );

  const requiredAtomic = parseUnits(params.amount || '0', tokenCfg.decimals);
  let hasSufficientBalance = true;
  let insufficientReason: string | undefined;

  if (tokenCfg.isNative) {
    if (nativeWei < requiredAtomic + feeWei) {
      hasSufficientBalance = false;
      insufficientReason = `Insufficient ${cfg.nativeSymbol} for amount + gas fee (${nativeDisplay} ${cfg.nativeSymbol} available).`;
    }
  } else {
    if (tokenRaw < requiredAtomic) {
      hasSufficientBalance = false;
      insufficientReason = `Insufficient ${tokenCfg.symbol} balance (${tokenBalanceDisplay} ${tokenCfg.symbol} available).`;
    } else if (nativeWei < feeWei) {
      hasSufficientBalance = false;
      insufficientReason = `Insufficient ${cfg.nativeSymbol} for gas fee (${nativeDisplay} ${cfg.nativeSymbol} available).`;
    }
  }

  const totalCostDisplay = tokenCfg.isNative
    ? `${formatFixedDisplay(formatEther(requiredAtomic + feeWei), 6)} ${cfg.nativeSymbol}`
    : `${params.amount} ${tokenCfg.symbol} + ${feeDisplay}`;

  return {
    senderTokenBalance: tokenBalanceDisplay,
    senderNativeBalance: nativeDisplay,
    nativeSymbol: cfg.nativeSymbol,
    estimatedFeeNative: feeDisplay,
    totalCostDisplay,
    hasSufficientBalance,
    insufficientReason,
  };
}

export async function executeOnChainPayment(params: {
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  walletMethod: 'created' | 'connected' | 'imported';
  signingPhrase?: string;
}): Promise<{ txHash: string }> {
  const cfg = getNetworkConfig(params.network);
  const addrCheck = validateWalletAddress(params.recipientAddress, 'Recipient address');
  if (!addrCheck.valid) {
    throw new WalletIntegrationError('INVALID_ADDRESS', addrCheck.reason ?? 'Invalid recipient address.');
  }

  const tokenCheck = validateTokenCompatibility(params.tokenSymbol, cfg.name);
  if (!tokenCheck.compatible || !tokenCheck.config) {
    throw new WalletIntegrationError(
      'UNSUPPORTED_NETWORK',
      tokenCheck.reason ?? 'Token not supported on this network.'
    );
  }
  const tokenCfg = tokenCheck.config;

  if (params.walletMethod === 'connected') {
    const eth = getInjectedEthereum();
    if (!eth) {
      throw new WalletIntegrationError(
        'UNSUPPORTED_WALLET',
        'Browser wallet provider not found.'
      );
    }
    await switchBrowserNetwork(cfg.name);
    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();

    if (tokenCfg.isNative) {
      const tx = await signer.sendTransaction({
        to: params.recipientAddress,
        value: parseEther(params.amount),
      });
      return { txHash: tx.hash };
    }

    if (!tokenCfg.contractAddress) {
      throw new WalletIntegrationError('UNSUPPORTED_NETWORK', 'Token contract address is not configured.');
    }

    const erc20 = new Contract(
      tokenCfg.contractAddress,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      signer
    );
    const tx = await erc20.transfer(
      params.recipientAddress,
      parseUnits(params.amount, tokenCfg.decimals)
    );
    return { txHash: tx.hash };
  }

  // Created / Imported WDK wallet: sign locally in memory only; never persist or log phrase
  const phrase = (params.signingPhrase ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!phrase || !WDK.isValidSeed(phrase)) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'Enter your valid 12 or 24-word recovery phrase to sign this transaction locally.'
    );
  }

  const wdk = new WDK(phrase).registerWallet('ethereum', EvmManager, {
    provider: cfg.rpcUrl,
  } as never);

  try {
    const account = (await wdk.getAccount('ethereum', 0)) as unknown as {
      getAddress: () => Promise<string>;
      sendTransaction: (tx: { to: string; value: bigint }) => Promise<{ hash: string }>;
      transfer: (opts: { token: string; recipient: string; amount: bigint }) => Promise<{ hash: string }>;
    };
    const derived = await account.getAddress();
    if (derived.toLowerCase() !== params.senderAddress.toLowerCase()) {
      throw new WalletIntegrationError(
        'INVALID_SEED',
        'The entered recovery phrase does not match your active wallet address.'
      );
    }

    if (tokenCfg.isNative) {
      const res = await account.sendTransaction({
        to: params.recipientAddress,
        value: parseEther(params.amount),
      });
      return { txHash: res.hash };
    }

    if (!tokenCfg.contractAddress) {
      throw new WalletIntegrationError('UNSUPPORTED_NETWORK', 'Token contract address is not configured.');
    }

    const res = await account.transfer({
      token: tokenCfg.contractAddress,
      recipient: params.recipientAddress,
      amount: parseUnits(params.amount, tokenCfg.decimals),
    });
    return { txHash: res.hash };
  } finally {
    wdk.dispose();
  }
}

export async function pollTransactionReceipt(
  txHash: string,
  network: string = DEFAULT_DEMO_NETWORK,
  timeoutMs = 20000
): Promise<'confirmed' | 'failed' | 'pending'> {
  const cfg = getNetworkConfig(network);
  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        return receipt.status === 1 ? 'confirmed' : 'failed';
      }
    } catch {
      // transient RPC error; retry until timeout
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  return 'pending';
}

export async function signChallengeMessage(params: {
  message: string;
  expectedAddress: string;
  network: string;
  walletMethod: 'created' | 'connected' | 'imported';
  signingPhrase?: string;
}): Promise<string> {
  const cfg = getNetworkConfig(params.network);

  if (params.walletMethod === 'connected') {
    const eth = getInjectedEthereum();
    if (!eth) {
      throw new WalletIntegrationError(
        'UNSUPPORTED_WALLET',
        'Browser wallet provider not found.'
      );
    }
    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    const signerAddr = await signer.getAddress();
    if (signerAddr.toLowerCase() !== params.expectedAddress.toLowerCase()) {
      throw new WalletIntegrationError(
        'UNSUPPORTED_WALLET',
        `Connected wallet (${signerAddr}) does not match expected address (${params.expectedAddress}).`
      );
    }
    return signer.signMessage(params.message);
  }

  const phrase = (params.signingPhrase ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!phrase || !WDK.isValidSeed(phrase)) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'Enter your valid 12 or 24-word recovery phrase to sign the verification challenge.'
    );
  }

  const wdk = new WDK(phrase).registerWallet('ethereum', EvmManager, {
    provider: cfg.rpcUrl,
  } as never);

  try {
    const account = (await wdk.getAccount('ethereum', 0)) as unknown as {
      getAddress: () => Promise<string>;
      sign: (msg: string) => Promise<string>;
    };
    const derived = await account.getAddress();
    if (derived.toLowerCase() !== params.expectedAddress.toLowerCase()) {
      throw new WalletIntegrationError(
        'INVALID_SEED',
        'The entered recovery phrase does not match the recipient wallet address.'
      );
    }
    return account.sign(params.message);
  } finally {
    wdk.dispose();
  }
}

/**
 * Signs an EIP-712 structured approval payload using either a connected EIP-1193
 * browser wallet or an ephemeral WDK recovery phrase (cleared from memory after signing).
 */
export async function signTypedDataMessage(params: {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  message: Record<string, unknown>;
  expectedAddress: string;
  network: string;
  walletMethod: 'created' | 'connected' | 'imported';
  signingPhrase?: string;
}): Promise<string> {
  const cfg = getNetworkConfig(params.network);

  if (params.walletMethod === 'connected') {
    const eth = getInjectedEthereum();
    if (!eth) {
      throw new WalletIntegrationError(
        'UNSUPPORTED_WALLET',
        'Browser wallet provider not found.'
      );
    }
    const provider = new BrowserProvider(eth);
    const networkInfo = await provider.getNetwork();
    if (Number(networkInfo.chainId) !== cfg.chainId) {
      await switchBrowserNetwork(cfg.name);
    }
    const activeProvider = new BrowserProvider(eth);
    const signer = await activeProvider.getSigner();
    const signerAddr = await signer.getAddress();
    if (signerAddr.toLowerCase() !== params.expectedAddress.toLowerCase()) {
      throw new WalletIntegrationError(
        'UNSUPPORTED_WALLET',
        `Connected wallet (${signerAddr}) does not match expected address (${params.expectedAddress}).`
      );
    }
    return signer.signTypedData(params.domain, params.types, params.message);
  }

  const phrase = (params.signingPhrase ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!phrase || !WDK.isValidSeed(phrase)) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'Enter your valid 12 or 24-word recovery phrase to sign this EIP-712 approval.'
    );
  }

  const derivedWallet = HDNodeWallet.fromPhrase(phrase);
  if (derivedWallet.address.toLowerCase() !== params.expectedAddress.toLowerCase()) {
    throw new WalletIntegrationError(
      'INVALID_SEED',
      'The entered recovery phrase does not match your registered Word wallet address.'
    );
  }
  return derivedWallet.signTypedData(params.domain, params.types, params.message);
}
