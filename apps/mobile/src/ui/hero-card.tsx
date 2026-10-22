import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { Money } from './money';
import { radius, space } from './theme';

/**
 * The screen's one figure ("Capital aportado"): brand fill, `on-primary` text, amount in
 * `displaySmall`. `amount` is an exact decimal string. Only one per screen.
 */
export function HeroCard({
  label,
  amount,
  meta,
  testID,
  amountTestID,
}: {
  label: string;
  amount: string;
  meta?: string;
  testID?: string;
  /** testID of the amount text (e.g. `capital-total`). */
  amountTestID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: colors.primary }]} testID={testID}>
      <Text variant="bodyMedium" style={{ color: colors.onPrimary }}>
        {label}
      </Text>
      <Money
        amount={amount}
        variant="displaySmall"
        color={colors.onPrimary}
        testID={amountTestID}
      />
      {meta ? (
        <Text variant="bodyMedium" style={{ color: colors.onPrimary }}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space[5], gap: space[1] },
});
