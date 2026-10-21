import { Badge as PaperBadge, useTheme } from 'react-native-paper';

import { colors } from './theme';

/** Height of the pill; the label sets its width. */
const SIZE = 22;

// Warning and danger keep their meaning whatever the cooperative's colour is.
const FIXED_TONES = {
  warning: { backgroundColor: colors.warningContainer, color: colors.warning },
  danger: { backgroundColor: colors.dangerContainer, color: colors.danger },
} as const;

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'info' | 'warning' | 'danger';
}) {
  const { colors: theme } = useTheme();
  // The info tone follows the cooperative's colour (through the theme); the others keep their meaning.
  const { backgroundColor, color } =
    tone === 'info'
      ? { backgroundColor: theme.primaryContainer, color: theme.onPrimaryContainer }
      : tone === 'neutral'
        ? { backgroundColor: theme.surfaceVariant, color: theme.onSurfaceVariant }
        : FIXED_TONES[tone];
  return (
    <PaperBadge size={SIZE} style={{ alignSelf: 'flex-start', backgroundColor, color }}>
      {label}
    </PaperBadge>
  );
}
