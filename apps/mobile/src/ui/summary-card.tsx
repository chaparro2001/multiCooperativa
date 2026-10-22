import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { Money } from './money';
import { colors as fixed, radius, space } from './theme';

/**
 * One of the two cards at the top of the invoice list ("Pendiente de pagar", "Pendiente de
 * cobrar"): outlined, amount in `headlineSmall`, count line in muted and, when overdue, a red
 * line. Lay two side by side with `flex: 1` via `style`. Keep the `summary-*` testIDs.
 */
export function SummaryCard({
  label,
  amount,
  meta,
  overdue,
  testID,
  amountTestID,
  style,
}: {
  label: string;
  amount: string;
  meta?: string;
  overdue?: string;
  testID?: string;
  amountTestID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
        style,
      ]}
      testID={testID}
    >
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Money amount={amount} variant="headlineSmall" testID={amountTestID} />
      {meta ? (
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {meta}
        </Text>
      ) : null}
      {overdue ? (
        <Text variant="bodyMedium" style={{ color: fixed.danger }}>
          {overdue}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space[5], gap: space[1] },
});
