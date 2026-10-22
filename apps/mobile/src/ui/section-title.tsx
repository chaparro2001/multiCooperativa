import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { space } from './theme';

/** Heading of a block inside a screen (`titleMedium`, 20 above). `small` for sub-headings. */
export function SectionTitle({
  children,
  small = false,
  testID,
}: {
  children: ReactNode;
  small?: boolean;
  testID?: string;
}) {
  return (
    <Text
      variant={small ? 'titleSmall' : 'titleMedium'}
      accessibilityRole="header"
      style={styles.title}
      testID={testID}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space[5] },
});
