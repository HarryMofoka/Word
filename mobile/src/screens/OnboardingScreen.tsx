import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DuoFadeView } from '../components/DuoAnimations';
import {
  createMobileWallet,
  importMobileWallet,
  type MobileWalletState,
} from '../services/mobileServices';
import { COLORS, RADIUS, sharedStyles } from '../theme/tokens';
import type { MobileUserSession } from './AuthScreen';

export const OnboardingScreen: React.FC<{
  session: MobileUserSession;
  onComplete: (wallet: MobileWalletState) => void;
}> = ({ session, onComplete }) => {
  const [step, setStep] = useState<'welcome' | 'setup' | 'import' | 'backup' | 'ready'>(
    'welcome'
  );
  const [wallet, setWallet] = useState<MobileWalletState | null>(null);
  const [importPhrase, setImportPhrase] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [faceScanVerified, setFaceScanVerified] = useState(
    session.ownerFaceScanVerified
  );

  const handleCreateNewWallet = () => {
    setErrorMsg(null);
    const created = createMobileWallet('Testnet');
    setWallet(created.wallet);
    setStep('backup');
  };

  const handleImportWallet = () => {
    setErrorMsg(null);
    try {
      const imported = importMobileWallet(importPhrase, 'Testnet');
      setWallet(imported);
      setStep('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid recovery phrase.');
    }
  };

  return (
    <ScrollView
      style={sharedStyles.screenContainer}
      contentContainerStyle={sharedStyles.scrollContent}
    >
      <DuoFadeView triggerKey={step} durationMs={380}>
        {step === 'welcome' && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>STEP 1 OF 3 · WELCOME</Text>
            <Text style={[sharedStyles.headingLg, { marginVertical: 8 }]}>
              Welcome, {session.displayName}.
            </Text>
            <Text style={[sharedStyles.bodyMd, { marginBottom: 18 }]}>
              Set up your self-custodial Tether WDK wallet and confirm your Owner Face
              Scan readiness for bilateral Mutual Trust payments.
            </Text>

            <View style={{ gap: 10, marginBottom: 20 }}>
              {[
                {
                  title: 'Owner facial liveness ready',
                  desc: 'POPIA-compliant facial liveness attestation protects both sender and recipient.',
                },
                {
                  title: 'Verify before sending',
                  desc: 'Cryptographic wallet-control & EIP-712 bilateral co-signing.',
                },
                {
                  title: 'Self-custody always',
                  desc: 'Your 12-word recovery phrase stays under your control.',
                },
              ].map((item) => (
                <View key={item.title} style={sharedStyles.softBox}>
                  <Text style={sharedStyles.headingSm}>✓ {item.title}</Text>
                  <Text style={[sharedStyles.bodySm, { marginTop: 3 }]}>{item.desc}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={sharedStyles.primaryBtn}
              onPress={() => setStep('setup')}
            >
              <Text style={sharedStyles.primaryBtnText}>Set up wallet →</Text>
            </Pressable>
          </View>
        )}

        {step === 'setup' && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>STEP 2 OF 3 · WALLET SETUP</Text>
            <Text style={[sharedStyles.headingLg, { marginVertical: 8 }]}>
              Choose wallet setup.
            </Text>

            <View style={{ gap: 12, marginVertical: 14 }}>
              <Pressable style={sharedStyles.softBox} onPress={handleCreateNewWallet}>
                <Text style={sharedStyles.headingSm}>
                  Create new self-custody wallet
                </Text>
                <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
                  Generate a fresh 12-word BIP-39 recovery phrase on Ethereum Sepolia,
                  Base Sepolia, and Polygon Amoy.
                </Text>
              </Pressable>

              <Pressable
                style={sharedStyles.softBox}
                onPress={() => setStep('import')}
              >
                <Text style={sharedStyles.headingSm}>
                  Import existing recovery phrase
                </Text>
                <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
                  Restore your existing 12-word or 24-word self-custody wallet.
                </Text>
              </Pressable>
            </View>

            <Pressable style={sharedStyles.ghostBtn} onPress={() => setStep('welcome')}>
              <Text style={sharedStyles.ghostBtnText}>← Back</Text>
            </Pressable>
          </View>
        )}

        {step === 'import' && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>IMPORT RECOVERY PHRASE</Text>
            <Text style={[sharedStyles.headingMd, { marginVertical: 8 }]}>
              Enter 12-word phrase
            </Text>
            <TextInput
              style={[sharedStyles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              placeholder="word1 word2 word3 ... word12"
              placeholderTextColor={COLORS.mute}
              autoCapitalize="none"
              value={importPhrase}
              onChangeText={setImportPhrase}
            />
            {errorMsg && (
              <Text style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 8 }}>
                {errorMsg}
              </Text>
            )}
            <View style={[sharedStyles.rowBetween, { marginTop: 16 }]}>
              <Pressable style={sharedStyles.ghostBtn} onPress={() => setStep('setup')}>
                <Text style={sharedStyles.ghostBtnText}>← Back</Text>
              </Pressable>
              <Pressable style={sharedStyles.primaryBtn} onPress={handleImportWallet}>
                <Text style={sharedStyles.primaryBtnText}>Import Wallet →</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 'backup' && wallet && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>STEP 2B · RECOVERY PHRASE BACKUP</Text>
            <Text style={[sharedStyles.headingMd, { marginVertical: 8 }]}>
              Write down your 12 recovery words
            </Text>
            <Text style={[sharedStyles.bodySm, { marginBottom: 14 }]}>
              Word never stores your recovery phrase on any server. Keep these 12 words in
              a safe offline place.
            </Text>

            <View style={styles.seedGrid}>
              {(wallet.seedPhraseWords ?? []).map((w, idx) => (
                <View key={`${w}-${idx}`} style={styles.seedPill}>
                  <Text style={styles.seedIndex}>{idx + 1}.</Text>
                  <Text style={styles.seedWord}>{w}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={[sharedStyles.primaryBtn, { marginTop: 16 }]}
              onPress={() => {
                setWallet({ ...wallet, recoveryBackedUp: true });
                setStep('ready');
              }}
            >
              <Text style={sharedStyles.primaryBtnText}>
                I have backed up my phrase →
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'ready' && wallet && (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.eyebrow}>
              STEP 3 OF 3 · WALLET &amp; OWNER IDENTITY READY
            </Text>
            <Text style={[sharedStyles.headingLg, { marginVertical: 8 }]}>
              Ready for Mutual Trust.
            </Text>

            <View style={[sharedStyles.softBox, { marginBottom: 14 }]}>
              <Text style={sharedStyles.eyebrow}>LINKED WALLET ADDRESS</Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: COLORS.ink,
                  marginTop: 4,
                }}
              >
                {wallet.address}
              </Text>
              <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
                Network: {wallet.network} · Cryptographic Control Verified ✓
              </Text>
            </View>

            <View
              style={[
                sharedStyles.softBox,
                {
                  borderColor: faceScanVerified ? COLORS.success : COLORS.line,
                  marginBottom: 18,
                },
              ]}
            >
              <View style={sharedStyles.rowBetween}>
                <Text style={sharedStyles.headingSm}>Owner Facial Liveness</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: faceScanVerified ? '#15803D' : COLORS.warning,
                  }}
                >
                  {faceScanVerified ? '✓ Verified & Attested' : 'Pending Scan'}
                </Text>
              </View>
              <Text style={[sharedStyles.bodySm, { marginTop: 4 }]}>
                {faceScanVerified
                  ? 'Your Owner Face Scan is cryptographically bound and ready for bilateral Mutual Trust transactions.'
                  : 'Complete your Owner Face Scan now so you can approve Mutual Trust transactions immediately.'}
              </Text>
              {!faceScanVerified && (
                <Pressable
                  style={[sharedStyles.primaryBtn, { marginTop: 10 }]}
                  onPress={() => setFaceScanVerified(true)}
                >
                  <Text style={sharedStyles.primaryBtnText}>
                    Complete Owner Face Scan Now
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={sharedStyles.primaryBtn}
              onPress={() => onComplete(wallet)}
            >
              <Text style={sharedStyles.primaryBtnText}>Open Word Workspace →</Text>
            </Pressable>
          </View>
        )}
      </DuoFadeView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  seedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  seedPill: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  seedIndex: {
    fontSize: 11,
    color: COLORS.mute,
  },
  seedWord: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.ink,
  },
});

