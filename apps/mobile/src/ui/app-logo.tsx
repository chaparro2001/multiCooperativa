import { Image, StyleSheet, View } from 'react-native';

import { Text, useTheme } from './paper';

// Metro resolves static image requires to an asset id; there are no module types for .png here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo: number = require('../../assets/images/logo.png');

/**
 * The app's own mark and name, for the screens shown before a cooperative is known (sign-in,
 * invitation). Once inside, the cooperative's logo (ADR-018) takes its place.
 */
export function AppLogo({ size = 72 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Image
        source={logo}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size }}
        testID="app-logo"
      />
      <Text variant="headlineMedium" style={{ color: colors.primary }}>
        multiCooperativa
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
