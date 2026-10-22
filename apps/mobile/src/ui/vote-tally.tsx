import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { tallyShares } from './progress';
import { radius, space } from './theme';

/**
 * Horizontal bars for "A favor · En contra · Abstenciones" with the counts written at the end.
 * Render it only when the API sends `tally` (members get `null` while voting is open, BR-ASM-11).
 * Bars differ in lightness and every row is labelled, so it reads without colour.
 */
export function VoteTally({
  favor,
  against,
  abstentions,
  testID,
}: {
  favor: number;
  against: number;
  abstentions: number;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fill = {
    favor: { backgroundColor: colors.primary },
    against: { backgroundColor: colors.onSurface },
    abstentions: { backgroundColor: colors.onSurfaceVariant, opacity: 0.5 },
  } as const;
  return (
    <View style={styles.tally} testID={testID}>
      {tallyShares({ favor, against, abstentions }).map(({ key, count, share }) => (
        <View
          key={key}
          style={styles.row}
          accessible
          accessibilityLabel={`${t(`ui.tally.${key}`)}: ${count}`}
        >
          <View style={styles.head}>
            <Text variant="bodyMedium">{t(`ui.tally.${key}`)}</Text>
            <Text variant="titleSmall">{count}</Text>
          </View>
          <View
            style={[
              styles.track,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant },
            ]}
          >
            <View style={[styles.fill, fill[key], { width: `${share * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tally: { gap: space[3] },
  row: { gap: space[1] },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.full, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});
