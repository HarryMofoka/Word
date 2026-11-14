export type SupportedNetworkName = 'Testnet' | 'Base Sepolia' | 'Polygon Amoy';

export interface NetworkConfig {
  id: SupportedNetworkName;
  chainId: number;
  chainIdHex: string;
  label: string;
  nativeSymbol: string;
  rpcUrl: string;
  explorerUrl: string;
  usdtContractAddress: string;
  usdtDecimals: number;
}

export const NETWORKS: Record<SupportedNetworkName, NetworkConfig> = {
  Testnet: {
    id: 'Testnet',
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    label: 'Ethereum Sepolia',
    nativeSymbol: 'ETH',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    usdtContractAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    usdtDecimals: 6,
  },
  'Base Sepolia': {
    id: 'Base Sepolia',
    chainId: 84532,
    chainIdHex: '0x14a34',
    label: 'Base Sepolia',
    nativeSymbol: 'ETH',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    usdtContractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdtDecimals: 6,
  },
  'Polygon Amoy': {
    id: 'Polygon Amoy',
    chainId: 80002,
    chainIdHex: '0x13882',
    label: 'Polygon Amoy',
    nativeSymbol: 'MATIC',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    usdtContractAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    usdtDecimals: 6,
  },
};

export function getNetworkConfig(network: string): NetworkConfig {
  if (network === 'Base Sepolia') return NETWORKS['Base Sepolia'];
  if (network === 'Polygon Amoy') return NETWORKS['Polygon Amoy'];
  return NETWORKS.Testnet;
}

