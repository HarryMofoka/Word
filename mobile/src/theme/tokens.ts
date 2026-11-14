import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#F7F7F5',
  white: '#FFFFFF',
  soft: '#EFEFEB',
  line: '#E6E6E1',
  ink: '#0D0D0D',
  sub: '#484845',
  mute: '#767670',
  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.12)',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.12)',
  deviceDark: '#111113',
  deviceBorder: '#2B2B30',
} as const;

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const sharedStyles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 20,
  },
  softBox: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: COLORS.mute,
  },
  headingLg: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.6,
    color: COLORS.ink,
  },
  headingMd: {
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: COLORS.ink,
  },
  headingSm: {
    fontSize: 15.5,
    fontWeight: '600',
    color: COLORS.ink,
  },
  bodyMd: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.sub,
  },
  bodySm: {
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.mute,
  },
  primaryBtn: {
    backgroundColor: COLORS.ink,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  ghostBtnText: {
    color: COLORS.ink,
    fontSize: 12.5,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: COLORS.ink,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.soft,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.sub,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});

