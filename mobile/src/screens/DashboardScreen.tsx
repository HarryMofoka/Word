import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DuoFadeView, IPhoneDuoShowcase } from '../components/DuoAnimations';
import type {
  MobileMutualSessionItem,
  MobileWalletState,
  WalletBalances,
} from '../services/mobileServices';
import { COLORS, RADIUS, sharedStyles } from '../theme/tokens';
import type { MobileUserSession } from './AuthScreen';

export interface MobilePaymentRecord {
  id: string;
  recipient: string;
  address: string;
  amount: string;
  purpose: string;
  network: string;
  status: 'Confirmed' | 'Pending' | 'Failed';
  timestamp: string;
  txHash?: string;
  mutualTrustVerified?: boolean;
}

export const DashboardScreen: React.FC<{
  session: MobileUserSession;
  wallet: MobileWalletState;
  balances: WalletBalances | null;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  mutualSessions: MobileMutualSessionItem[];
  records: MobilePaymentRecord[];
  onNavigateTab: (
    tab: 'dashboard' | 'payments' | 'records' | 'assistant' | 'profile'
  ) => void;
  onOpenMutualTrust: () => void;
}> = ({
  session,
  wallet,
  balances,
  balanceHidden,
  onToggleBalance,
  mutualSessions,
  records,
  onNavigateTab,
  onOpenMutualTrust,
}) => {
  const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      {/* 1. Available Balance Card with Smooth Duo Fade-In / Fade-Out */}
      <DuoFadeView triggerKey="balance-card" delayMs={20}>
        <View style={sharedStyles.card}>
          <View style={sharedStyles.rowBetween}>
            <Text style={sharedStyles.eyebrow}>AVAILABLE BALANCE</Text>
            <Pressable style={sharedStyles.ghostBtn} onPress={onToggleBalance}>
              <Text style={sharedStyles.ghostBtnText}>
                {balanceHidden ? 'Show' : 'Hide'}
              </Text>
            </Pressable>
          </View>

          <DuoFadeView triggerKey={String(balanceHidden)} durationMs={320}>
            <Text style={styles.balanceAmount}>
              {balanceHidden
                ? '•••••• USDT'
                : `${balances?.usdtBalance ?? '0.00'} USDT`}
            </Text>
            <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
              {balances?.networkLabel ?? wallet.network} ·{' '}
              {balanceHidden
                ? '••••'
                : `${balances?.nativeBalance ?? '0.0000'} ${
                    balances?.nativeSymbol ?? 'ETH'
                  }`}{' '}
              · {session.displayName}
            </Text>
          </DuoFadeView>

          <View style={styles.quickActionsGrid}>
            <Pressable
              style={styles.quickBtn}
              onPress={() => onNavigateTab('payments')}
            >
              <Text style={styles.quickIcon}>↗</Text>
              <Text style={styles.quickLabel}>Send / Pay</Text>
            </Pressable>

            <Pressable style={styles.quickBtn} onPress={onOpenMutualTrust}>
              <Text style={styles.quickIcon}>⇄</Text>
              <Text style={styles.quickLabel}>Mutual Trust</Text>
            </Pressable>

            <Pressable
              style={styles.quickBtn}
              onPress={() => onNavigateTab('assistant')}
            >
              <Text style={styles.quickIcon}>✦</Text>
              <Text style={styles.quickLabel}>AI Assistant</Text>
            </Pressable>

            <Pressable
              style={styles.quickBtn}
              onPress={() => onNavigateTab('records')}
            >
              <Text style={styles.quickIcon}>▤</Text>
              <Text style={styles.quickLabel}>Records</Text>
            </Pressable>
          </View>
        </View>
      </DuoFadeView>

      {/* 2. Signature iPhone Duo Fade-In / Fade-Out Bilateral Trust Showcase */}
      <DuoFadeView triggerKey="duo-showcase" delayMs={90}>
        <IPhoneDuoShowcase
          shortWalletAddress={shortAddr}
          onLaunchMutualTrust={onOpenMutualTrust}
        />
      </DuoFadeView>

      {/* 3. Wallet Overview & Owner Biometric Readiness */}
      <DuoFadeView triggerKey="wallet-overview" delayMs={160}>
        <View style={sharedStyles.card}>
          <View style={sharedStyles.rowBetween}>
            <Text style={sharedStyles.eyebrow}>SELF-CUSTODY WALLET &amp; OWNER SCAN</Text>
            <View style={sharedStyles.badge}>
              <Text style={sharedStyles.badgeText}>{wallet.network}</Text>
            </View>
          </View>

          <Text style={[sharedStyles.headingSm, { marginTop: 8 }]}>
            {shortAddr} · Verified Control ✓
          </Text>

          <View style={[sharedStyles.softBox, { marginTop: 12, gap: 6 }]}>
            <View style={sharedStyles.rowBetween}>
              <Text style={sharedStyles.bodySm}>Owner Face Scan</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#15803D' }}>
                ✓ Verified &amp; Ready
              </Text>
            </View>
            <View style={sharedStyles.rowBetween}>
              <Text style={sharedStyles.bodySm}>Custody Model</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: COLORS.ink }}>
                User-Controlled Keys
              </Text>
            </View>
          </View>
        </View>
      </DuoFadeView>

      {/* 4. Active Mutual Trust Sessions */}
      {mutualSessions.length > 0 && (
        <DuoFadeView triggerKey="mutual-active" delayMs={210}>
          <View style={sharedStyles.card}>
            <View style={sharedStyles.rowBetween}>
              <Text style={sharedStyles.eyebrow}>
                ACTIVE MUTUAL TRUST ({mutualSessions.length})
              </Text>
              <Pressable onPress={onOpenMutualTrust}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: COLORS.ink }}>
                  Open →
                </Text>
              </Pressable>
            </View>
            {mutualSessions.slice(0, 3).map((item) => (
              <View key={item.session.id} style={styles.recordRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sharedStyles.headingSm}>
                    {item.session.amount_numeric} {item.session.token_symbol} ·{' '}
                    {item.session.purpose}
                  </Text>
                  <Text style={sharedStyles.bodySm}>
                    Code: {item.session.invitation_code} · State:{' '}
                    {item.session.session_state}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </DuoFadeView>
      )}

      {/* 5. Recent Transactions */}
      <DuoFadeView triggerKey="recent-tx" delayMs={250}>
        <View style={sharedStyles.card}>
          <View style={sharedStyles.rowBetween}>
            <Text style={sharedStyles.eyebrow}>RECENT TRANSACTIONS</Text>
            <Pressable onPress={() => onNavigateTab('records')}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: COLORS.ink }}>
                View all →
              </Text>
            </Pressable>
          </View>

          {records.length === 0 ? (
            <Text style={[sharedStyles.bodySm, { marginTop: 10 }]}>
              No transactions yet. Start a Mutual Trust payment or create a payment
              request.
            </Text>
          ) : (
            records.slice(0, 4).map((rec) => (
              <View key={rec.id} style={styles.recordRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sharedStyles.headingSm}>
                    {rec.recipient} · {rec.amount}
                  </Text>
                  <Text style={sharedStyles.bodySm}>
                    {rec.purpose} · {rec.network}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color:
                        rec.status === 'Confirmed' ? COLORS.success : COLORS.warning,
                    }}
                  >
                    ✓ {rec.status}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: COLORS.mute }}>
                    {rec.timestamp}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </DuoFadeView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  balanceAmount: {
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1,
    color: COLORS.ink,
    marginTop: 10,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  quickBtn: {
    width: '48%',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 13,
    gap: 6,
  },
  quickIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    gap: 10,
  },
});

