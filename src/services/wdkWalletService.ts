import WDK from '@tetherto/wdk';
import WalletManagerEvm, { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm';
import { BrowserProvider, JsonRpcProvider, formatEther, formatUnits } from 'ethers';
import {
  DEFAULT_DEMO_NETWORK,
  NETWORK_CONFIGS,
  getNetworkByChainId,
  getNetworkConfig,
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
