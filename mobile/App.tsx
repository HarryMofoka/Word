import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportedNetworkName } from './src/config/blockchain';
import { DuoFadeView } from './src/components/DuoAnimations';
import { AuthScreen, type MobileUserSession } from './src/screens/AuthScreen';
import {
  DashboardScreen,
  type MobilePaymentRecord,
} from './src/screens/DashboardScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PaymentsAndMutualTrustScreen } from './src/screens/PaymentsAndMutualTrustScreen';
import {
  AssistantScreen,
  ProfileAndSettingsScreen,
  RecordsAndDisputesScreen,
} from './src/screens/RecordsAndAssistantScreen';
import {
  fetchMobileBalances,
  listMobileMutualSessions,
  signOutMobile,
  type MobileMutualSessionItem,
  type MobileWalletState,
  type WalletBalances,
} from './src/services/mobileServices';
import { COLORS, RADIUS, sharedStyles } from './src/theme/tokens';

type MobileTab = 'dashboard' | 'payments' | 'records' | 'assistant' | 'profile';

const MOBILE_TABS: Array<{ id: MobileTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'payments', label: 'Payments' },
  { id: 'records', label: 'Records' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'profile', label: 'Profile' },
];

export default function App() {
  const [session, setSession] = useState<MobileUserSession | null>(null);
  const [wallet, setWallet] = useState<MobileWalletState | null>(null);
  const [activeTab, setActiveTab] = useState<MobileTab>('dashboard');
  const [paymentMode, setPaymentMode] = useState<
    'mutual-trust' | 'send-pay' | 'create-request'
  >('mutual-trust');

  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [mutualSessions, setMutualSessions] = useState<MobileMutualSessionItem[]>([]);
  const [records, setRecords] = useState<MobilePaymentRecord[]>([
    {
      id: 'tx-seed-1',
      recipient: 'Lerato N.',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amount: '150.00 USDT',
      purpose: 'Design Audit & Mutual Trust Milestone',
      network: 'Testnet',
      status: 'Confirmed',
      timestamp: 'Today',
      txHash:
        '0x8f92e4b019c0762f9bfcf9fb1e58725bfb0e75827169d38820dfd117c3fa1f22',
      mutualTrustVerified: true,
    },
  ]);

  const refreshMobileState = useCallback(
    async (targetWallet: MobileWalletState | null) => {
      if (!targetWallet?.address) return;
      const [bal, mSessions] = await Promise.all([
        fetchMobileBalances(targetWallet.address, targetWallet.network),
        listMobileMutualSessions(),
      ]);
      setBalances(bal);
      setMutualSessions(mSessions);
    },
    []
  );

  useEffect(() => {
    if (wallet) {
      void refreshMobileState(wallet);
    }
  }, [wallet, refreshMobileState]);

  const handleLogout = async () => {
    await signOutMobile().catch(() => null);
    setSession(null);
    setWallet(null);
    setActiveTab('dashboard');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Top Navigation Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>W</Text>
          </View>
          <Text style={styles.brandTitle}>Word</Text>
          <View style={sharedStyles.badge}>
            <Text style={sharedStyles.badgeText}>Mobile · Expo 58</Text>
          </View>
        </View>

        {wallet && (
          <View style={styles.walletChip}>
            <View style={styles.liveDot} />
            <Text style={styles.walletChipText}>
              {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            </Text>
          </View>
        )}
      </View>

      {/* Main Content with Smooth Duo Fade-In / Fade-Out Transitions */}
      <View style={{ flex: 1 }}>
        {!session ? (
          <AuthScreen onAuthenticated={(nextSession) => setSession(nextSession)} />
        ) : !wallet ? (
          <OnboardingScreen
            session={session}
            onComplete={(readyWallet) => {
              setWallet(readyWallet);
              setActiveTab('dashboard');
            }}
          />
        ) : (
          <DuoFadeView
            triggerKey={`${activeTab}-${paymentMode}`}
            durationMs={360}
            style={{ flex: 1 }}
          >
            {activeTab === 'dashboard' && (
              <DashboardScreen
                session={session}
                wallet={wallet}
                balances={balances}
                balanceHidden={balanceHidden}
                onToggleBalance={() => setBalanceHidden((p) => !p)}
                mutualSessions={mutualSessions}
                records={records}
                onNavigateTab={(t) => setActiveTab(t)}
                onOpenMutualTrust={() => {
                  setPaymentMode('mutual-trust');
                  setActiveTab('payments');
                }}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsAndMutualTrustScreen
                userId={session.id}
                wallet={wallet}
                initialMode={paymentMode}
                mutualSessions={mutualSessions}
                onRefreshSessions={() => void refreshMobileState(wallet)}
                onAddRecord={(rec) => setRecords((prev) => [rec, ...prev])}
              />
            )}

            {activeTab === 'records' && (
              <RecordsAndDisputesScreen records={records} />
            )}

            {activeTab === 'assistant' && (
              <AssistantScreen
                onHandoffToPayments={() => {
                  setPaymentMode('mutual-trust');
                  setActiveTab('payments');
                }}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileAndSettingsScreen
                session={session}
                wallet={wallet}
                onSwitchNetwork={(nextNet: SupportedNetworkName) => {
                  setWallet({ ...wallet, network: nextNet });
                }}
                onLogout={handleLogout}
              />
            )}
          </DuoFadeView>
        )}
      </View>

      {/* Bottom Tab Navigation Bar */}
      {session && wallet && (
        <View style={styles.bottomBar}>
          {MOBILE_TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                style={[styles.tabPill, active && styles.tabPillActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topHeader: {
    height: 60,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: COLORS.success,
  },
  walletChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    gap: 6,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: COLORS.ink,
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.sub,
  },
  tabTextActive: {
    color: COLORS.white,
  },
});

