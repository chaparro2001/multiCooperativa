import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { IconName } from './paper-settings';
import { colors, radius, size, space } from './theme';

// Warning and danger keep their meaning whatever the cooperative's colour is.
const FIXED_TONES = {
  warning: { backgroundColor: colors.warningContainer, color: colors.warning },
  danger: { backgroundColor: colors.dangerContainer, color: colors.danger },
} as const;

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger';

/**
 * Status in words, a 22 px pill. Colour is the tone, the word is the meaning. A row carries one
 * filled badge (the most urgent); secondary states use `quiet` (icon and text, no fill). The
 * optional 14 px `icon` reinforces the word, never replaces it.
 */
export function Badge({
  label,
  tone = 'neutral',
  quiet = false,
  icon,
  testID,
}: {
  label: string;
  tone?: BadgeTone;
  quiet?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  const { colors: theme } = useTheme();
  // The info tone follows the cooperative's colour (through the theme); the others keep their meaning.
  const { backgroundColor, color } =
    tone === 'info'
      ? { backgroundColor: theme.primaryContainer, color: theme.onPrimaryContainer }
      : tone === 'neutral'
        ? { backgroundColor: theme.surfaceVariant, color: theme.onSurface }
        : FIXED_TONES[tone];
  const ring = tone === 'neutral' ? theme.outlineVariant : 'transparent';
  return (
    <View
      style={[
        styles.pill,
        quiet ? styles.quiet : { backgroundColor, borderColor: ring, borderWidth: 1 },
      ]}
      testID={testID}
    >
      {icon ? (
        <Icon
          source={icon}
          size={14}
          color={quiet && tone === 'neutral' ? theme.onSurfaceVariant : color}
        />
      ) : null}
      <Text
        variant="labelMedium"
        style={{ color: quiet && tone === 'neutral' ? theme.onSurfaceVariant : color }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: size.badge,
    paddingHorizontal: space[2],
    borderRadius: radius.full,
  },
  quiet: { paddingHorizontal: 0 },
});
