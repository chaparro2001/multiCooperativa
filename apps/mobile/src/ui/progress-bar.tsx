import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { clampMark, ratio } from './progress';
import { radius, space } from './theme';

/**
 * Labelled 8 px bar ("Participación: 42 de 120 (35 %)"). The caller writes the numbers in
 * `label`; the bar only illustrates. `mark` (0..1) draws a 2 px threshold line such as the
 * quorum; the outcome is still written in text below.
 */
export function ProgressBar({
  label,
  value,
  total,
  mark,
  testID,
}: {
  label: string;
  value: number;
  total: number;
  mark?: number | null;
  testID?: string;
}) {
  const { colors } = useTheme();
  const markAt = clampMark(mark);
  return (
    <View
      style={styles.wrapper}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: Math.max(total, 0),
        now: Math.min(Math.max(value, 0), Math.max(total, 0)),
      }}
      testID={testID}
    >
      <Text variant="bodyMedium">{label}</Text>
      <View style={styles.barArea}>
        <View
          style={[
            styles.track,
            { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant },
          ]}
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.primary, width: `${ratio(value, total) * 100}%` },
            ]}
          />
        </View>
        {markAt === null ? null : (
          <View
            style={[styles.mark, { backgroundColor: colors.onSurface, left: `${markAt * 100}%` }]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space[2] },
  barArea: { height: 14, justifyContent: 'center' },
  track: { height: 8, borderRadius: radius.full, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
  mark: { position: 'absolute', top: 0, width: 2, height: 14, marginLeft: -1 },
});
