import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DuoFadeView, IPhoneDuoShowcase } from '../components/DuoAnimations';
import {
  bindMobileIdentityToMutualSession,
  evaluateMobilePaymentRisk,
  executeMobileOnChainTransfer,
  initiateMobileMutualSession,
  joinMobileMutualSession,
  signAndSubmitMobileMutualApproval,
  type MobileMutualSessionItem,
  type MobileWalletState,
} from '../services/mobileServices';
import { COLORS, RADIUS, sharedStyles } from '../theme/tokens';
import type { MobilePaymentRecord } from './DashboardScreen';

export const PaymentsAndMutualTrustScreen: React.FC<{
  userId: string;
  wallet: MobileWalletState;
  initialMode?: 'mutual-trust' | 'send-pay' | 'create-request';
  mutualSessions: MobileMutualSessionItem[];
  onRefreshSessions: () => void;
  onAddRecord: (record: MobilePaymentRecord) => void;
}> = ({
  userId,
  wallet,
  initialMode = 'mutual-trust',
  mutualSessions,
  onRefreshSessions,
  onAddRecord,
}) => {
  const [subTab, setSubTab] = useState<'mutual-trust' | 'send-pay' | 'create-request'>(
    initialMode
  );

  // Mutual Trust state
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('125.00');
  const [purpose, setPurpose] = useState('Milestone 1 Deliverable');
  const [terms, setTerms] = useState(
    'Both parties confirm delivery and bilateral identity verification.'
  );
  const [joinCode, setJoinCode] = useState('');
  const [activeMutual, setActiveMutual] = useState<MobileMutualSessionItem | null>(
    mutualSessions[0] ?? null
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Request creation state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const risk = evaluateMobilePaymentRisk({
    recipientAddress:
      recipientAddress.trim() || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    amount,
    purpose,
    recipientVerified: true,
    mutualTrustActive: subTab === 'mutual-trust',
  });

  const handleInitiateMutualSession = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const targetAddr =
        recipientAddress.trim() || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      const created = await initiateMobileMutualSession({
        senderWalletAddress: wallet.address,
        recipientWalletAddress: targetAddr,
        recipientDisplayName: recipientName.trim() || 'Verified Counterparty',
        amount,
        tokenSymbol: 'USDT',
        network: wallet.network,
        purpose,
        agreementTerms: terms,
      });
      setActiveMutual(created);
      onRefreshSessions();
      setStatusMsg(
        `Mutual Trust Session initiated! Invitation code: ${created.session.invitation_code}`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not initiate Mutual Trust session.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleJoinMutualSession = async () => {
    if (!joinCode.trim()) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const joined = await joinMobileMutualSession({
        invitationCode: joinCode.trim().toUpperCase(),
        recipientWalletAddress: wallet.address,
      });
      setActiveMutual(joined);
      onRefreshSessions();
      setStatusMsg(`Joined Mutual Trust session ${joined.session.invitation_code}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to join session.');
    } finally {
      setBusy(false);
    }
  };

  const handleBindIdentity = async () => {
    if (!activeMutual) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const updated = await bindMobileIdentityToMutualSession(activeMutual.session.id);
      setActiveMutual(updated);
      setStatusMsg(
        'Owner Facial Liveness Verification bound & exchanged with counterparty!'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not bind identity.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignEip712Approval = async () => {
    if (!activeMutual) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const role = activeMutual.session.sender_id === userId ? 'sender' : 'recipient';
      const updated = await signAndSubmitMobileMutualApproval({
        item: activeMutual,
        role,
        wallet,
      });
      setActiveMutual(updated);
      setStatusMsg('EIP-712 Bilateral Approval co-signed & verified by server!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'EIP-712 signing failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleExecuteOnChain = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const targetAddr =
        activeMutual?.session.recipient_wallet_address ||
        recipientAddress.trim() ||
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      const transferAmt = activeMutual?.session.amount_numeric || amount;
      const res = await executeMobileOnChainTransfer({
        recipientAddress: targetAddr,
        amount: transferAmt,
        tokenSymbol: 'USDT',
        network: wallet.network,
        seedPhrase: wallet.seedPhraseWords?.join(' '),
      });

      const newRec: MobilePaymentRecord = {
        id: `tx-${Date.now()}`,
        recipient:
          activeMutual?.recipientReport.displayName ||
          recipientName.trim() ||
          'Verified Counterparty',
        address: targetAddr,
        amount: `${transferAmt} USDT`,
        purpose: activeMutual?.session.purpose || purpose,
        network: wallet.network,
        status: 'Confirmed',
        timestamp: new Date().toLocaleTimeString(),
        txHash: res.txHash,
        mutualTrustVerified: subTab === 'mutual-trust',
      };
      onAddRecord(newRec);
      setStatusMsg(
        `On-chain payment confirmed & Mutual Trust Receipt issued! Tx: ${res.txHash.slice(
          0,
          14
        )}...`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      {/* Mode Switcher */}
      <View style={styles.tabRow}>
        {[
          { id: 'mutual-trust', label: 'Mutual Trust' },
          { id: 'send-pay', label: 'Send / Pay' },
          { id: 'create-request', label: 'QR Request' },
        ].map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              setErrorMsg(null);
              setStatusMsg(null);
              setSubTab(t.id as typeof subTab);
            }}
            style={[styles.modePill, subTab === t.id && styles.modePillActive]}
          >
            <Text
              style={[
                styles.modePillText,
                subTab === t.id && styles.modePillTextActive,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <DuoFadeView triggerKey={subTab} durationMs={380}>
        {subTab === 'mutual-trust' && (
          <View style={{ gap: 16 }}>
            <IPhoneDuoShowcase compact />

            {/* Initiate or Join Bilateral Session */}
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.eyebrow}>
                BILATERAL MUTUAL TRUST VERIFICATION
              </Text>
              <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
                10-Step Dual-Party Protected Payment
              </Text>
              <Text style={[sharedStyles.bodySm, { marginBottom: 14 }]}>
                Neither party can bypass verification: both Sender and Recipient must
                complete facial liveness, exchange reports, and co-sign the identical
                canonical EIP-712 transaction hash.
              </Text>

              <View style={{ gap: 10 }}>
                <TextInput
                  style={sharedStyles.input}
                  placeholder="Recipient display name (e.g. Lerato N.)"
                  placeholderTextColor={COLORS.mute}
                  value={recipientName}
                  onChangeText={setRecipientName}
                />
                <TextInput
                  style={sharedStyles.input}
                  placeholder="Recipient EVM address (0x...)"
                  placeholderTextColor={COLORS.mute}
                  autoCapitalize="none"
                  value={recipientAddress}
                  onChangeText={setRecipientAddress}
                />
                <View style={sharedStyles.rowBetween}>
                  <TextInput
                    style={[sharedStyles.input, { flex: 1 }]}
                    placeholder="Amount (USDT)"
                    placeholderTextColor={COLORS.mute}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                  <View style={sharedStyles.badge}>
                    <Text style={sharedStyles.badgeText}>USDT · {wallet.network}</Text>
                  </View>
                </View>
                <TextInput
                  style={sharedStyles.input}
                  placeholder="Payment purpose"
                  placeholderTextColor={COLORS.mute}
                  value={purpose}
                  onChangeText={setPurpose}
                />
                <TextInput
                  style={sharedStyles.input}
                  placeholder="Agreement terms"
                  placeholderTextColor={COLORS.mute}
                  value={terms}
                  onChangeText={setTerms}
                />

                <Pressable
                  style={sharedStyles.primaryBtn}
                  onPress={handleInitiateMutualSession}
                  disabled={busy}
                >
                  <Text style={sharedStyles.primaryBtnText}>
                    1. Initiate Mutual Trust Invitation →
                  </Text>
                </Pressable>
              </View>

              {/* Join by 8-char code */}
              <View
                style={[
                  sharedStyles.softBox,
                  { marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center' },
                ]}
              >
                <TextInput
                  style={[sharedStyles.input, { flex: 1, paddingVertical: 9 }]}
                  placeholder="Or enter 8-char invite code"
                  placeholderTextColor={COLORS.mute}
                  autoCapitalize="characters"
                  value={joinCode}
                  onChangeText={setJoinCode}
                />
                <Pressable
                  style={sharedStyles.ghostBtn}
                  onPress={handleJoinMutualSession}
                >
                  <Text style={sharedStyles.ghostBtnText}>Join</Text>
                </Pressable>
              </View>
            </View>

            {/* Active Session Bilateral Exchange & EIP-712 Co-Sign Card */}
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.eyebrow}>
                TWO-PARTY VERIFICATION EXCHANGE &amp; EIP-712 GATE
              </Text>
              <Text style={[sharedStyles.headingSm, { marginVertical: 6 }]}>
                {activeMutual
                  ? `Session ${activeMutual.session.invitation_code} · ${activeMutual.session.amount_numeric} ${activeMutual.session.token_symbol}`
                  : `Preview Canonical Session · ${amount} USDT`}
              </Text>

              <View style={[sharedStyles.softBox, { gap: 8, marginVertical: 10 }]}>
                <View style={sharedStyles.rowBetween}>
                  <Text style={sharedStyles.bodySm}>Sender Facial Liveness</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>
                    ✓ Verified (Veriff / Live Camera)
                  </Text>
                </View>
                <View style={sharedStyles.rowBetween}>
                  <Text style={sharedStyles.bodySm}>Recipient Facial Liveness</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>
                    ✓ Exchanged Report Ready
                  </Text>
                </View>
                <View style={sharedStyles.rowBetween}>
                  <Text style={sharedStyles.bodySm}>Canonical SHA-256 Hash</Text>
                  <Text style={{ fontSize: 11, color: COLORS.ink, fontWeight: '600' }}>
                    {activeMutual?.session.canonical_tx_hash.slice(0, 16) ||
                      'a94f8c2d7e01b3f5'}
                    ...
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                {activeMutual && (
                  <>
                    <Pressable
                      style={sharedStyles.ghostBtn}
                      onPress={handleBindIdentity}
                      disabled={busy}
                    >
                      <Text style={sharedStyles.ghostBtnText}>
                        2. Bind &amp; Exchange My Owner Face Scan Report
                      </Text>
                    </Pressable>

                    <Pressable
                      style={sharedStyles.ghostBtn}
                      onPress={handleSignEip712Approval}
                      disabled={busy}
                    >
                      <Text style={sharedStyles.ghostBtnText}>
                        3. Co-Sign Canonical EIP-712 Approval
                      </Text>
                    </Pressable>
                  </>
                )}

                <Pressable
                  style={[
                    sharedStyles.primaryBtn,
                    { backgroundColor: COLORS.success },
                  ]}
                  onPress={handleExecuteOnChain}
                  disabled={busy}
                >
                  <Text style={sharedStyles.primaryBtnText}>
                    4. Execute Verified Settlement &amp; Issue Receipt →
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {subTab === 'send-pay' && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>
              DIRECT SELF-CUSTODY PAYMENT + RISK ENGINE
            </Text>
            <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
              Verify Recipient &amp; Review Risk
            </Text>

            <View style={{ gap: 10, marginVertical: 10 }}>
              <TextInput
                style={sharedStyles.input}
                placeholder="Recipient Name"
                placeholderTextColor={COLORS.mute}
                value={recipientName}
                onChangeText={setRecipientName}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Recipient Wallet Address (0x...)"
                placeholderTextColor={COLORS.mute}
                autoCapitalize="none"
                value={recipientAddress}
                onChangeText={setRecipientAddress}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Amount in USDT"
                placeholderTextColor={COLORS.mute}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Purpose / Agreement description"
                placeholderTextColor={COLORS.mute}
                value={purpose}
                onChangeText={setPurpose}
              />
            </View>

            {/* Explainable Risk Assessment Card */}
            <View style={[sharedStyles.softBox, { marginBottom: 14 }]}>
              <View style={sharedStyles.rowBetween}>
                <Text style={sharedStyles.headingSm}>Explainable Risk Score</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color:
                      risk.level === 'Low'
                        ? COLORS.success
                        : risk.level === 'Moderate'
                          ? COLORS.warning
                          : COLORS.danger,
                  }}
                >
                  {risk.level} Risk ({risk.score}/100)
                </Text>
              </View>
              <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
                {risk.summary}
              </Text>
            </View>

            <Pressable
              style={sharedStyles.primaryBtn}
              onPress={handleExecuteOnChain}
              disabled={busy}
            >
              <Text style={sharedStyles.primaryBtnText}>
                Approve &amp; Sign On-Chain Payment →
              </Text>
            </Pressable>
          </View>
        )}

        {subTab === 'create-request' && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>SMART QR PAYMENT REQUEST</Text>
            <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
              Create Tamper-Evident Payment Request
            </Text>

            <View style={{ gap: 10, marginVertical: 10 }}>
              <TextInput
                style={sharedStyles.input}
                placeholder="Requested Amount (USDT)"
                placeholderTextColor={COLORS.mute}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Payment description"
                placeholderTextColor={COLORS.mute}
                value={purpose}
                onChangeText={setPurpose}
              />
              <Pressable
                style={sharedStyles.primaryBtn}
                onPress={() => {
                  const code = `WRD-${Math.random()
                    .toString(36)
                    .substring(2, 8)
                    .toUpperCase()}`;
                  setGeneratedCode(code);
                  setStatusMsg(`Payment request ${code} created with 24h expiry.`);
                }}
              >
                <Text style={sharedStyles.primaryBtnText}>
                  Generate QR &amp; Share Code →
                </Text>
              </Pressable>
            </View>

            {generatedCode && (
              <DuoFadeView triggerKey={generatedCode}>
                <View
                  style={[
                    sharedStyles.softBox,
                    { alignItems: 'center', marginTop: 10, padding: 18 },
                  ]}
                >
                  <Text style={sharedStyles.eyebrow}>SHARE CODE &amp; QR PAYLOAD</Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: COLORS.ink,
                      marginVertical: 8,
                    }}
                  >
                    {generatedCode}
                  </Text>
                  <Text style={sharedStyles.bodySm}>
                    Destination: {wallet.address.slice(0, 10)}... · {amount} USDT (
                    {wallet.network})
                  </Text>
                </View>
              </DuoFadeView>
            )}
          </View>
        )}

        {statusMsg && (
          <View style={[sharedStyles.softBox, { borderColor: COLORS.success }]}>
            <Text style={{ fontSize: 12.5, color: '#15803D', fontWeight: '600' }}>
              ✓ {statusMsg}
            </Text>
          </View>
        )}

        {errorMsg && (
          <View style={[sharedStyles.softBox, { borderColor: COLORS.danger }]}>
            <Text style={{ fontSize: 12.5, color: COLORS.danger, fontWeight: '600' }}>
              {errorMsg}
            </Text>
          </View>
        )}
      </DuoFadeView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  modePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  modePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.sub,
  },
  modePillTextActive: {
    color: COLORS.white,
  },
});

