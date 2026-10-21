import { StyleSheet, Text } from 'react-native';

import { useBrandColor, useBrandTint } from '../branding/brand';
import { colors } from './theme';

const TONES = {
  neutral: { backgroundColor: colors.surface, color: colors.muted },
  info: { backgroundColor: '#e3f0e8', color: colors.primary },
  warning: { backgroundColor: '#fff4d6', color: '#7a5600' },
  danger: { backgroundColor: '#fde7e6', color: colors.danger },
} as const;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONES }) {
  const brand = useBrandColor();
  const tint = useBrandTint();
  // The info tone follows the cooperative's colour; the others keep their meaning.
  const { backgroundColor, color } =
    tone === 'info' ? { backgroundColor: tint, color: brand } : TONES[tone];
  return <Text style={[styles.badge, { backgroundColor, color }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
