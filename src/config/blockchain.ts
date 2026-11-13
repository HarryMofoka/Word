import { isAddress } from 'ethers';

export type SupportedNetworkName = 'Testnet' | 'Base Sepolia' | 'Polygon Amoy';
export type SupportedTokenSymbol = 'USDT' | 'USDC' | 'ETH' | 'WETH';

export interface TokenConfig {
  symbol: SupportedTokenSymbol;
  name: string;
  decimals: number;
  isNative: boolean;
  contractAddress: string | null;
}

export interface NetworkConfig {
  name: SupportedNetworkName;
  label: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
  nativeSymbol: string;
  nativeDecimals: number;
  tokens: Partial<Record<SupportedTokenSymbol, TokenConfig>>;
}

export const DEFAULT_DEMO_NETWORK: SupportedNetworkName = 'Testnet';

export const NETWORK_CONFIGS: Record<SupportedNetworkName, NetworkConfig> = {
  Testnet: {
    name: 'Testnet',
    label: 'Ethereum Sepolia (Testnet)',
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    rpcUrl:
      import.meta.env.VITE_SEPOLIA_RPC_URL ||
      'https://ethereum-sepolia-rpc.publicnode.com',
    fallbackRpcUrls: [
      'https://rpc.sepolia.org',
      'https://sepolia.drpc.org',
    ],
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    tokens: {
      USDT: {
        symbol: 'USDT',
        name: 'Tether USD (Sepolia Testnet)',
        decimals: 6,
        isNative: false,
        contractAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      },
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin (Sepolia Testnet)',
        decimals: 6,
        isNative: false,
        contractAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      },
      ETH: {
        symbol: 'ETH',
        name: 'Sepolia Ether',
        decimals: 18,
        isNative: true,
        contractAddress: null,
      },
      WETH: {
        symbol: 'WETH',
        name: 'Wrapped Ether (Sepolia)',
        decimals: 18,
        isNative: false,
        contractAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      },
    },
  },
  'Base Sepolia': {
    name: 'Base Sepolia',
    label: 'Base Sepolia (Testnet)',
    chainId: 84532,
    chainIdHex: '0x14a34',
    rpcUrl:
      import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    fallbackRpcUrls: ['https://base-sepolia-rpc.publicnode.com'],
    explorerUrl: 'https://sepolia.basescan.org',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    tokens: {
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin (Base Sepolia)',
        decimals: 6,
        isNative: false,
        contractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      },
      ETH: {
        symbol: 'ETH',
        name: 'Base Sepolia Ether',
        decimals: 18,
        isNative: true,
        contractAddress: null,
      },
    },
  },
  'Polygon Amoy': {
    name: 'Polygon Amoy',
    label: 'Polygon Amoy (Testnet)',
    chainId: 80002,
    chainIdHex: '0x13882',
    rpcUrl:
      import.meta.env.VITE_POLYGON_AMOY_RPC_URL ||
      'https://rpc-amoy.polygon.technology',
    fallbackRpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com'],
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeSymbol: 'POL',
    nativeDecimals: 18,
    tokens: {
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin (Polygon Amoy)',
        decimals: 6,
        isNative: false,
        contractAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      },
      ETH: {
        symbol: 'ETH',
        name: 'Wrapped ETH (Polygon Amoy)',
        decimals: 18,
        isNative: true,
        contractAddress: null,
      },
    },
  },
};

export function getNetworkConfig(network: string): NetworkConfig {
  if (network in NETWORK_CONFIGS) {
    return NETWORK_CONFIGS[network as SupportedNetworkName];
  }
  return NETWORK_CONFIGS[DEFAULT_DEMO_NETWORK];
}

export function getNetworkByChainId(chainId: number): NetworkConfig | null {
  return (
    Object.values(NETWORK_CONFIGS).find((cfg) => cfg.chainId === chainId) ?? null
  );
}

export function isSupportedNetworkName(network: string): network is SupportedNetworkName {
  return network in NETWORK_CONFIGS;
}

export function isValidWalletAddress(address: string): boolean {
  return typeof address === 'string' && isAddress(address.trim());
}

export function validateWalletAddress(
  address: string,
  label = 'Wallet address'
): { valid: boolean; reason?: string } {
  if (!address || !address.trim()) {
    return { valid: false, reason: `${label} is required.` };
  }
  if (!isAddress(address.trim())) {
    return {
      valid: false,
      reason: `${label} is not a valid checksummed or hex EVM address.`,
    };
  }
  return { valid: true };
}

export function validateNetworkCompatibility(
  walletNetwork: string,
  targetNetwork: string
): { compatible: boolean; reason?: string } {
  if (!isSupportedNetworkName(targetNetwork)) {
    return {
      compatible: false,
      reason: `Network "${targetNetwork}" is not supported in this Word testnet configuration.`,
    };
  }
  if (walletNetwork !== targetNetwork) {
    return {
      compatible: false,
      reason: `Wallet is on ${walletNetwork}, but the payment specifies ${targetNetwork}. Switch networks to match.`,
    };
  }
  return { compatible: true };
}

export function validateTokenCompatibility(
  tokenSymbol: string,
  network: string
): { compatible: boolean; config?: TokenConfig; reason?: string } {
  if (!isSupportedNetworkName(network)) {
    return {
      compatible: false,
      reason: `Unsupported network "${network}".`,
    };
  }
  const netCfg = NETWORK_CONFIGS[network];
  const tokenCfg = netCfg.tokens[tokenSymbol as SupportedTokenSymbol];
  if (!tokenCfg) {
    const supportedList = Object.keys(netCfg.tokens).join(', ');
    return {
      compatible: false,
      reason: `${tokenSymbol} is not configured on ${netCfg.label}. Supported tokens: ${supportedList}.`,
    };
  }
  return { compatible: true, config: tokenCfg };
}

