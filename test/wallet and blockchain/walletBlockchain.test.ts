import { describe, expect, it } from 'vitest';
import { isAddress } from 'ethers';
import {
  DEFAULT_DEMO_NETWORK,
  NETWORK_CONFIGS,
  getNetworkByChainId,
  getNetworkConfig,
  isSupportedNetworkName,
  isValidWalletAddress,
  validateNetworkCompatibility,
  validateTokenCompatibility,
  validateWalletAddress,
} from '../../src/config/blockchain';
import {
  connectBrowserWallet,
  createWdkWallet,
  importWdkWallet,
} from '../../src/services/wdkWalletService';

describe('Phase 5A: Wallet & Blockchain Configuration', () => {
  it('sets Testnet (Sepolia) as default demo network', () => {
    expect(DEFAULT_DEMO_NETWORK).toBe('Testnet');
    expect(NETWORK_CONFIGS.Testnet.chainId).toBe(11155111);
    expect(NETWORK_CONFIGS.Testnet.chainIdHex).toBe('0xaa36a7');
    expect(NETWORK_CONFIGS.Testnet.nativeSymbol).toBe('ETH');
  });

  it('configures Base Sepolia and Polygon Amoy with valid explorer URLs and decimals', () => {
    expect(NETWORK_CONFIGS['Base Sepolia'].chainId).toBe(84532);
    expect(NETWORK_CONFIGS['Polygon Amoy'].chainId).toBe(80002);
    expect(NETWORK_CONFIGS['Polygon Amoy'].nativeSymbol).toBe('POL');
    expect(NETWORK_CONFIGS.Testnet.tokens.USDT?.decimals).toBe(6);
  });

  const chainIdCases: Array<[number, string | null]> = [
    [11155111, 'Testnet'],
    [84532, 'Base Sepolia'],
    [80002, 'Polygon Amoy'],
    [1, null],
    [137, null],
    [42161, null],
    [0, null],
    [-1, null],
  ];

  it.each(chainIdCases)('getNetworkByChainId(%s) -> %s', (chainId, expected) => {
    expect(getNetworkByChainId(chainId)?.name ?? null).toBe(expected);
  });

  const networkNameCases: Array<[string, boolean]> = [
    ['Testnet', true],
    ['Base Sepolia', true],
    ['Polygon Amoy', true],
    ['Mainnet', false],
    ['Sepolia', false],
    ['', false],
    ['Arbitrum', false],
  ];

  it.each(networkNameCases)('isSupportedNetworkName("%s") === %s', (name, expected) => {
    expect(isSupportedNetworkName(name)).toBe(expected);
  });

  it('getNetworkConfig falls back to default on unknown network', () => {
    expect(getNetworkConfig('UnknownNet').name).toBe('Testnet');
    expect(getNetworkConfig('Base Sepolia').chainId).toBe(84532);
  });

  const addressCases: Array<[string, boolean]> = [
    ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', true],
    ['0x7169d38820dfd117c3fa1f22a697dba58d90ba06', true],
    ['0x0000000000000000000000000000000000000000', true],
    ['0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', true],
    ['0x036CbD53842c5426634e7929541eC2318f3dCF7e', true],
    ['0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', true],
    ['0x1234', false],
    ['0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', false],
    ['not-an-address', false],
    ['', false],
  ];

  it.each(addressCases)('isValidWalletAddress("%s") === %s', (addr, expected) => {
    expect(isValidWalletAddress(addr)).toBe(expected);
  });

  it('validateWalletAddress returns custom label in error messages', () => {
    expect(validateWalletAddress('', 'Merchant').reason).toContain('Merchant');
    expect(validateWalletAddress('0xbad', 'Merchant').reason).toContain('Merchant');
    expect(validateWalletAddress('0x7169D38820dfd117C3FA1f22a697dBA58d90BA06').valid).toBe(true);
  });

  const tokenNetworkMatrix: Array<[string, string, boolean]> = [
    ['USDT', 'Testnet', true],
    ['USDC', 'Testnet', true],
    ['ETH', 'Testnet', true],
    ['WETH', 'Testnet', true],
    ['USDT', 'Base Sepolia', false],
    ['USDC', 'Base Sepolia', true],
    ['ETH', 'Base Sepolia', true],
    ['WETH', 'Base Sepolia', false],
    ['USDT', 'Polygon Amoy', false],
    ['USDC', 'Polygon Amoy', true],
    ['ETH', 'Polygon Amoy', true],
    ['BTC', 'Testnet', false],
    ['USDT', 'Mainnet', false],
  ];

  it.each(tokenNetworkMatrix)(
    'validateTokenCompatibility(%s, %s) === %s',
    (token, network, expected) => {
      expect(validateTokenCompatibility(token, network).compatible).toBe(expected);
    }
  );

  const networkCompatMatrix: Array<[string, string, boolean]> = [
    ['Testnet', 'Testnet', true],
    ['Base Sepolia', 'Base Sepolia', true],
    ['Polygon Amoy', 'Polygon Amoy', true],
    ['Testnet', 'Base Sepolia', false],
    ['Base Sepolia', 'Polygon Amoy', false],
    ['Testnet', 'Mainnet', false],
  ];

  it.each(networkCompatMatrix)(
    'validateNetworkCompatibility(%s, %s) === %s',
    (wNet, tNet, expected) => {
      expect(validateNetworkCompatibility(wNet, tNet).compatible).toBe(expected);
    }
  );

  it('createWdkWallet generates a valid address and 12-word phrase', async () => {
    const w = await createWdkWallet('Testnet');
    expect(isAddress(w.address)).toBe(true);
    expect(w.seedWords).toHaveLength(12);
    expect(w.network).toBe('Testnet');
  });

  it('importWdkWallet derives the identical address and normalizes whitespace/case', async () => {
    const w = await createWdkWallet('Base Sepolia');
    const imported = await importWdkWallet(`  ${w.seedWords.join('   ').toUpperCase()}  `, 'Base Sepolia');
    expect(imported.address.toLowerCase()).toBe(w.address.toLowerCase());
  });

  it.each(['', 'one two three', 'abandon '.repeat(11) + 'zzz'])(
    'importWdkWallet rejects invalid seed "%s"',
    async (badSeed) => {
      await expect(importWdkWallet(badSeed, 'Testnet')).rejects.toThrow();
    }
  );

  it('connectBrowserWallet rejects with UNSUPPORTED_WALLET when window.ethereum is absent', async () => {
    await expect(connectBrowserWallet('Testnet')).rejects.toThrow(/No EIP-1193 browser wallet/);
  });
});

