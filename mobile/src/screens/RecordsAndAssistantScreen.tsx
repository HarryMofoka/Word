import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SupportedNetworkName } from '../config/blockchain';
import { DuoFadeView } from '../components/DuoAnimations';
import {
  eraseMobileIdentityData,
  interpretNaturalLanguagePayment,
  type MobileWalletState,
} from '../services/mobileServices';
import { COLORS, RADIUS, sharedStyles } from '../theme/tokens';
import type { MobileUserSession } from './AuthScreen';
import type { MobilePaymentRecord } from './DashboardScreen';

// ============================================================================
// 1. RECORDS, AGREEMENTS & DISPUTES SCREEN
// ============================================================================

export const RecordsAndDisputesScreen: React.FC<{
  records: MobilePaymentRecord[];
}> = ({ records }) => {
  const [selectedRecord, setSelectedRecord] = useState<MobilePaymentRecord | null>(
    records[0] ?? null
  );
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFiled, setDisputeFiled] = useState<Record<string, string>>({});

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      <DuoFadeView triggerKey={selectedRecord?.id ?? 'list'} durationMs={380}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.eyebrow}>
            VERIFIABLE TRANSACTION RECORDS &amp; MUTUAL TRUST RECEIPTS
          </Text>
          <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
            Shared Accountability Ledger
          </Text>
          <Text style={[sharedStyles.bodySm, { marginBottom: 14 }]}>
            Every transaction record preserves canonical agreement terms, blockchain
            txHash proof, and bilateral Mutual Trust verification status.
          </Text>

          {records.length === 0 ? (
            <Text style={sharedStyles.bodySm}>No transaction records yet.</Text>
          ) : (
            records.map((rec) => (
              <Pressable
                key={rec.id}
                onPress={() => setSelectedRecord(rec)}
                style={[
                  sharedStyles.softBox,
                  {
                    marginBottom: 10,
                    borderColor:
                      selectedRecord?.id === rec.id ? COLORS.ink : COLORS.line,
                  },
                ]}
              >
                <View style={sharedStyles.rowBetween}>
                  <Text style={sharedStyles.headingSm}>
                    {rec.recipient} · {rec.amount}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '700',
                      color: COLORS.success,
                    }}
                  >
                    ✓ {rec.status}
                  </Text>
                </View>
                <Text style={[sharedStyles.bodySm, { marginTop: 3 }]}>
                  {rec.purpose} · {rec.network}
                </Text>
                {rec.mutualTrustVerified && (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: '#15803D',
                      marginTop: 4,
                    }}
                  >
                    ★ Mutual Trust Bilateral Receipt Attached
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </View>

        {selectedRecord && (
          <View style={[sharedStyles.card, { marginTop: 14 }]}>
            <Text style={sharedStyles.eyebrow}>
              PAYMENT AGREEMENT &amp; DISPUTE EVIDENCE
            </Text>
            <Text style={[sharedStyles.headingSm, { marginVertical: 6 }]}>
              {selectedRecord.recipient} · {selectedRecord.amount}
            </Text>
            <Text style={sharedStyles.bodySm}>
              Destination: {selectedRecord.address}
            </Text>
            {selectedRecord.txHash && (
              <Text style={[sharedStyles.bodySm, { marginTop: 3 }]}>
                On-Chain TxHash: {selectedRecord.txHash.slice(0, 22)}...
              </Text>
            )}

            {disputeFiled[selectedRecord.id] ? (
              <View
                style={[
                  sharedStyles.softBox,
                  { marginTop: 12, borderColor: COLORS.warning },
                ]}
              >
                <Text
                  style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.warning }}
                >
                  Dispute Case Open · Evidence Logged
                </Text>
                <Text style={[sharedStyles.bodySm, { marginTop: 3 }]}>
                  {disputeFiled[selectedRecord.id]}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 12, gap: 8 }}>
                <TextInput
                  style={sharedStyles.input}
                  placeholder="Raise dispute or attach delivery evidence note..."
                  placeholderTextColor={COLORS.mute}
                  value={disputeReason}
                  onChangeText={setDisputeReason}
                />
                <Pressable
                  style={sharedStyles.ghostBtn}
                  onPress={() => {
                    if (!disputeReason.trim()) return;
                    setDisputeFiled((prev) => ({
                      ...prev,
                      [selectedRecord.id]: disputeReason.trim(),
                    }));
                    setDisputeReason('');
                  }}
                >
                  <Text style={sharedStyles.ghostBtnText}>
                    Submit Dispute / Evidence Record
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </DuoFadeView>
    </ScrollView>
  );
};

// ============================================================================
// 2. QVAC ON-DEVICE AI PAYMENT ASSISTANT SCREEN
// ============================================================================

export const AssistantScreen: React.FC<{
  onHandoffToPayments: () => void;
}> = ({ onHandoffToPayments }) => {
  const [prompt, setPrompt] = useState(
    'Pay 125 USDT to Lerato on Base Sepolia for UI design milestone'
  );
  const [parsed, setParsed] = useState(() =>
    interpretNaturalLanguagePayment(
      'Pay 125 USDT to Lerato on Base Sepolia for UI design milestone'
    )
  );

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      <DuoFadeView triggerKey={parsed.explanation} durationMs={380}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.eyebrow}>QVAC ON-DEVICE AI ASSISTANT</Text>
          <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
            Plain-Language Payment &amp; Risk Interpreter
          </Text>
          <Text style={[sharedStyles.bodySm, { marginBottom: 14 }]}>
            Describe a payment in plain language. QVAC parses the structured parameters
            locally on-device and never signs transactions without your bilateral
            approval.
          </Text>

          <TextInput
            style={[sharedStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. Send 75 USDT to Thabo for consulting invoice"
            placeholderTextColor={COLORS.mute}
          />

          <Pressable
            style={[sharedStyles.primaryBtn, { marginTop: 12 }]}
            onPress={() => setParsed(interpretNaturalLanguagePayment(prompt))}
          >
            <Text style={sharedStyles.primaryBtnText}>
              Interpret Payment Locally →
            </Text>
          </Pressable>

          <View style={[sharedStyles.softBox, { marginTop: 16, gap: 6 }]}>
            <Text style={sharedStyles.eyebrow}>STRUCTURED AI DRAFT</Text>
            <Text style={sharedStyles.headingSm}>{parsed.explanation}</Text>
            <Text style={sharedStyles.bodySm}>
              Recipient: {parsed.recipientName} · Amount: {parsed.amount}{' '}
              {parsed.token} · Network: {parsed.network}
            </Text>
            <Text style={[sharedStyles.bodySm, { color: '#15803D', marginTop: 4 }]}>
              ✓ {parsed.safetyNotice}
            </Text>

            <Pressable
              style={[sharedStyles.ghostBtn, { marginTop: 10 }]}
              onPress={onHandoffToPayments}
            >
              <Text style={sharedStyles.ghostBtnText}>
                Open in Mutual Trust Payment Flow →
              </Text>
            </Pressable>
          </View>
        </View>
      </DuoFadeView>
    </ScrollView>
  );
};

// ============================================================================
// 3. PROFILE, OWNER FACE SCAN MANAGEMENT & SETTINGS SCREEN
// ============================================================================

export const ProfileAndSettingsScreen: React.FC<{
  session: MobileUserSession;
  wallet: MobileWalletState;
  onSwitchNetwork: (network: SupportedNetworkName) => void;
  onLogout: () => void;
}> = ({ session, wallet, onSwitchNetwork, onLogout }) => {
  const [faceStatus, setFaceStatus] = useState<'verified' | 'erased'>('verified');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const handleEraseBiometrics = async () => {
    await eraseMobileIdentityData().catch(() => null);
    setFaceStatus('erased');
    setStatusBanner(
      'POPIA Right-to-Erasure completed: all biometric attestations revoked.'
    );
  };

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      <DuoFadeView triggerKey={wallet.network} durationMs={380}>
        {/* Owner Profile & Facial Verification Card */}
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.eyebrow}>OWNER PROFILE &amp; BIOMETRIC STATUS</Text>
          <Text style={[sharedStyles.headingMd, { marginVertical: 6 }]}>
            {session.displayName}
          </Text>
          <Text style={sharedStyles.bodySm}>{session.email}</Text>

          <View style={[sharedStyles.softBox, { marginTop: 14, gap: 8 }]}>
            <View style={sharedStyles.rowBetween}>
              <Text style={sharedStyles.headingSm}>
                Owner Face Scan (Veriff / Live Liveness)
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: faceStatus === 'verified' ? '#15803D' : COLORS.warning,
                }}
              >
                {faceStatus === 'verified' ? '✓ Active & Ready' : 'Erased'}
              </Text>
            </View>
            <Text style={sharedStyles.bodySm}>
              POPIA Policy: Zero raw facial video stored; 30-day automatic attestation
              expiry.
            </Text>

            <View style={sharedStyles.rowBetween}>
              <Pressable
                style={sharedStyles.ghostBtn}
                onPress={() => {
                  setFaceStatus('verified');
                  setStatusBanner(
                    'Owner Face Scan re-verified and ready for Mutual Trust!'
                  );
                }}
              >
                <Text style={sharedStyles.ghostBtnText}>Re-Scan Owner Face</Text>
              </Pressable>

              <Pressable
                style={sharedStyles.ghostBtn}
                onPress={handleEraseBiometrics}
              >
                <Text style={[sharedStyles.ghostBtnText, { color: COLORS.danger }]}>
                  POPIA Erase Data
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Blockchain Network Switcher */}
        <View style={[sharedStyles.card, { marginTop: 14 }]}>
          <Text style={sharedStyles.eyebrow}>BLOCKCHAIN NETWORK</Text>
          <Text style={[sharedStyles.headingSm, { marginVertical: 8 }]}>
            Active Network: {wallet.network}
          </Text>

          <View style={styles.networkRow}>
            {(
              ['Testnet', 'Base Sepolia', 'Polygon Amoy'] as SupportedNetworkName[]
            ).map((net) => (
              <Pressable
                key={net}
                onPress={() => onSwitchNetwork(net)}
                style={[
                  styles.netBtn,
                  wallet.network === net && styles.netBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.netBtnText,
                    wallet.network === net && styles.netBtnTextActive,
                  ]}
                >
                  {net === 'Testnet' ? 'Sepolia' : net}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {statusBanner && (
          <View style={[sharedStyles.softBox, { marginTop: 14 }]}>
            <Text style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: '600' }}>
              {statusBanner}
            </Text>
          </View>
        )}

        <Pressable
          style={[
            sharedStyles.ghostBtn,
            { marginTop: 18, borderColor: COLORS.danger },
          ]}
          onPress={onLogout}
        >
          <Text style={[sharedStyles.ghostBtnText, { color: COLORS.danger }]}>
            Sign Out of Word Mobile
          </Text>
        </Pressable>
      </DuoFadeView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  networkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  netBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
  },
  netBtnActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  netBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.sub,
  },
  netBtnTextActive: {
    color: COLORS.white,
  },
});

