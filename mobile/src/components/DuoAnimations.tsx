import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { COLORS, RADIUS, sharedStyles } from '../theme/tokens';

/**
 * Smooth iPhone Duo Fade-In / Fade-Out container.
 * Animates opacity (0 -> 1), vertical translation (12 -> 0), and subtle scale (0.985 -> 1)
 * whenever `triggerKey` changes or on mount with optional stagger `delayMs`.
 */
export const DuoFadeView: React.FC<{
  children: React.ReactNode;
  triggerKey?: string | number | boolean;
  delayMs?: number;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}> = ({
  children,
  triggerKey = 'default',
  delayMs = 0,
  durationMs = 380,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(0.985)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    scale.setValue(0.985);

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    anim.start();
    return () => anim.stop();
  }, [triggerKey, delayMs, durationMs, opacity, translateY, scale]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

export const DUO_TRUST_STAGES = [
  {
    id: 'face-scan',
    step: '01 · OWNER LIVENESS',
    title: 'Independent Facial Liveness',
    desc: 'Sender & Recipient complete POPIA-compliant facial liveness checks on their own iPhones.',
    leftLabel: 'Sender · Liveness ✓',
    rightLabel: 'Recipient · Liveness ✓',
    bridgeBadge: 'Biometric Attested',
  },
  {
    id: 'report-exchange',
    step: '02 · BILATERAL EXCHANGE',
    title: 'Mutual Report Exchange',
    desc: 'Structured verification reports exchange automatically — zero raw biometric video shared.',
    leftLabel: 'Views Recipient Report',
    rightLabel: 'Views Sender Report',
    bridgeBadge: 'Reports Exchanged',
  },
  {
    id: 'eip712-cosign',
    step: '03 · DUAL AUTHORISATION',
    title: 'EIP-712 Co-Signed Approval',
    desc: 'Both wallets cryptographically sign the identical canonical transaction hash.',
    leftLabel: 'Sender EIP-712 Sig ✓',
    rightLabel: 'Recipient EIP-712 Sig ✓',
    bridgeBadge: 'Dual-Party Locked',
  },
  {
    id: 'settlement',
    step: '04 · ON-CHAIN RECEIPT',
    title: 'Verified Settlement & Receipt',
    desc: 'Backend execution gate unlocks on-chain transfer and mints a permanent Mutual Trust Receipt.',
    leftLabel: 'Sent · Receipt Issued',
    rightLabel: 'Received · Verified',
    bridgeBadge: 'Settled On-Chain',
  },
] as const;

/**
 * Signature iPhone Duo Fade-In / Fade-Out Bilateral Trust Animation.
 * Renders two synchronized floating iPhone silhouettes that smoothly fade out and fade in
 * as the 4 bilateral Mutual Trust stages cycle.
 */
export const IPhoneDuoShowcase: React.FC<{
  shortWalletAddress?: string;
  onLaunchMutualTrust?: () => void;
  compact?: boolean;
}> = ({ shortWalletAddress = '0x71C...89A', onLaunchMutualTrust, compact = false }) => {
  const [stageIdx, setStageIdx] = useState(0);
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const stageSlide = useRef(new Animated.Value(0)).current;
  const floatLeft = useRef(new Animated.Value(0)).current;
  const floatRight = useRef(new Animated.Value(0)).current;
  const bridgePulse = useRef(new Animated.Value(0.6)).current;

  // Continuous ambient floating of the two iPhones + bridge pulse
  useEffect(() => {
    const leftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatLeft, {
          toValue: -5,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatLeft, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const rightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatRight, {
          toValue: 4,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatRight, {
          toValue: -2,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bridgePulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bridgePulse, {
          toValue: 0.45,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    leftLoop.start();
    rightLoop.start();
    pulseLoop.start();

    return () => {
      leftLoop.stop();
      rightLoop.stop();
      pulseLoop.stop();
    };
  }, [floatLeft, floatRight, bridgePulse]);

  const transitionToStage = (nextIdx: number) => {
    // Smooth Fade-Out -> Swap -> Fade-In
    Animated.parallel([
      Animated.timing(stageOpacity, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stageSlide, {
        toValue: -6,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStageIdx(nextIdx);
      stageSlide.setValue(8);
      Animated.parallel([
        Animated.timing(stageOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stageSlide, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      transitionToStage((stageIdx + 1) % DUO_TRUST_STAGES.length);
    }, 3600);
    return () => clearInterval(timer);
  }, [stageIdx]);

  const activeStage = DUO_TRUST_STAGES[stageIdx];

  return (
    <View style={[sharedStyles.card, styles.showcaseCard]}>
      <View style={sharedStyles.rowBetween}>
        <Text style={sharedStyles.eyebrow}>IPHONE DUO · BILATERAL MUTUAL TRUST</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>Live Sync</Text>
        </View>
      </View>

      {/* Synchronized Two-iPhone Duo Stage */}
      <View style={[styles.phonesRow, compact && { marginVertical: 10 }]}>
        {/* Left iPhone (Sender) */}
        <Animated.View
          style={[
            styles.iphoneFrame,
            { transform: [{ translateY: floatLeft }, { rotate: '-2deg' }] },
          ]}
        >
          <View style={styles.dynamicIsland} />
          <Text style={styles.deviceTag}>IPHONE A · SENDER</Text>
          <Animated.View
            style={[
              styles.deviceStatusBox,
              {
                opacity: stageOpacity,
                transform: [{ translateY: stageSlide }],
              },
            ]}
          >
            <Text style={styles.deviceCheckIcon}>✓</Text>
            <Text style={styles.deviceStatusText}>{activeStage.leftLabel}</Text>
          </Animated.View>
          <Text style={styles.deviceFooterText}>{shortWalletAddress}</Text>
        </Animated.View>

        {/* Bilateral Exchange Bridge */}
        <Animated.View style={[styles.bridgeContainer, { opacity: bridgePulse }]}>
          <Text style={styles.bridgeArrows}>⇄</Text>
          <Animated.View
            style={[
              styles.bridgePill,
              {
                opacity: stageOpacity,
              },
            ]}
          >
            <Text style={styles.bridgePillText}>{activeStage.bridgeBadge}</Text>
          </Animated.View>
        </Animated.View>

        {/* Right iPhone (Recipient) */}
        <Animated.View
          style={[
            styles.iphoneFrame,
            { transform: [{ translateY: floatRight }, { rotate: '2deg' }] },
          ]}
        >
          <View style={styles.dynamicIsland} />
          <Text style={styles.deviceTag}>IPHONE B · RECIPIENT</Text>
          <Animated.View
            style={[
              styles.deviceStatusBox,
              {
                opacity: stageOpacity,
                transform: [{ translateY: stageSlide }],
              },
            ]}
          >
            <Text style={styles.deviceCheckIcon}>✓</Text>
            <Text style={styles.deviceStatusText}>{activeStage.rightLabel}</Text>
          </Animated.View>
          <Text style={styles.deviceFooterText}>Counterparty</Text>
        </Animated.View>
      </View>

      {/* Crossfading Stage Description */}
      <Animated.View
        style={{
          opacity: stageOpacity,
          transform: [{ translateY: stageSlide }],
          marginTop: 6,
        }}
      >
        <Text style={styles.stageStepLabel}>{activeStage.step}</Text>
        <Text style={[sharedStyles.headingSm, { marginTop: 2, marginBottom: 4 }]}>
          {activeStage.title}
        </Text>
        <Text style={sharedStyles.bodySm}>{activeStage.desc}</Text>
      </Animated.View>

      {/* Stage Dots + Action */}
      <View style={[sharedStyles.rowBetween, { marginTop: 14 }]}>
        <View style={styles.dotsRow}>
          {DUO_TRUST_STAGES.map((st, idx) => (
            <Pressable
              key={st.id}
              onPress={() => transitionToStage(idx)}
              style={[
                styles.stageDot,
                idx === stageIdx ? styles.stageDotActive : null,
              ]}
            />
          ))}
        </View>

        {onLaunchMutualTrust && (
          <Pressable style={sharedStyles.ghostBtn} onPress={onLaunchMutualTrust}>
            <Text style={sharedStyles.ghostBtnText}>Open Mutual Trust →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  showcaseCard: {
    backgroundColor: '#FAFAF8',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.successSoft,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.success,
  },
  livePillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#15803D',
  },
  phonesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 14,
    gap: 8,
  },
  iphoneFrame: {
    flex: 1,
    minHeight: 148,
    backgroundColor: COLORS.deviceDark,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.deviceBorder,
    padding: 10,
    justifyContent: 'space-between',
  },
  dynamicIsland: {
    width: 32,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#000000',
    alignSelf: 'center',
    marginBottom: 4,
  },
  deviceTag: {
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  deviceStatusBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginVertical: 6,
  },
  deviceCheckIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4ADE80',
    marginBottom: 2,
  },
  deviceStatusText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 14,
  },
  deviceFooterText: {
    fontSize: 9,
    color: '#A1A1AA',
    textAlign: 'center',
  },
  bridgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  bridgeArrows: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.success,
    marginBottom: 4,
  },
  bridgePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.successSoft,
  },
  bridgePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  stageStepLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#15803D',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageDot: {
    width: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.line,
  },
  stageDotActive: {
    width: 24,
    backgroundColor: COLORS.ink,
  },
});

