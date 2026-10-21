import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useBrandColor } from '../branding/brand';
import { colors } from './theme';

export const SCREEN_PADDING = 24;
export const SCREEN_MAX_WIDTH = 960;

/** Scrollable screen body that keeps inputs above the keyboard. */
export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Loading() {
  const brand = useBrandColor();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={brand} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error} testID="error-message">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  // Capped and centred so wide browser windows (web build) keep a readable column; no effect on phones.
  content: {
    padding: SCREEN_PADDING,
    gap: 16,
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  error: { color: colors.danger, fontSize: 14 },
});
