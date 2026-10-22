import { type ComponentProps } from 'react';
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { currentLocale } from '@/i18n/format';

import { formatMoney } from './money-format';

/**
 * Euros with tabular figures. `amount` is an exact decimal string ("1234.50", never a number).
 * A negative amount reads with a true minus sign and in the danger colour; `signed` adds "+" to
 * positive ones (movement lists). `color` overrides the text colour (on a filled card) but the
 * minus sign stays. `variant` is any Paper text variant.
 */
export function Money({
  amount,
  signed = false,
  variant = 'bodyLarge',
  color,
  style,
  testID,
  accessibilityLabel,
}: {
  amount: string;
  signed?: boolean;
  variant?: ComponentProps<typeof Text>['variant'];
  color?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const { text, negative } = formatMoney(amount, currentLocale(), { signed });
  return (
    <Text
      variant={variant}
      style={[
        styles.figures,
        { color: negative ? colors.error : (color ?? colors.onSurface) },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  figures: { fontVariant: ['tabular-nums'] },
});
