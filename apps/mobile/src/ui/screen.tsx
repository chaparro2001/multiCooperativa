import { type ReactNode, useCallback, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { type FormApi, FormScope, ScrollerProvider } from '@/forms/use-form';

export const SCREEN_PADDING = 24;
export const SCREEN_MAX_WIDTH = 960;

/** Distance kept above the invalid field the screen scrolls to. */
const SCROLL_MARGIN = 24;

/**
 * Scrollable screen body that keeps inputs above the keyboard. With `form`, its fields (those
 * with a `name`) show the form's errors and the screen scrolls to the first invalid one.
 */
export function Screen({
  children,
  testID,
  form,
}: {
  children: ReactNode;
  testID?: string;
  form?: FormApi;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);

  const scrollTo = useCallback((target: View) => {
    target.measureInWindow((_x, targetY) => {
      // ScrollView forwards the native view's measuring methods; its typings omit them.
      (scroll.current as unknown as View | null)?.measureInWindow((_sx, scrollY) => {
        scroll.current?.scrollTo({
          y: Math.max(0, offset.current + targetY - scrollY - SCROLL_MARGIN),
          animated: true,
        });
      });
    });
  }, []);

  const body = (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        testID={testID}
      >
        {form ? <FormScope form={form}>{children}</FormScope> : children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
  return <ScrollerProvider value={scrollTo}>{body}</ScrollerProvider>;
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      variant="bodyMedium"
      accessibilityRole="alert"
      style={{ color: colors.error }}
      testID="error-message"
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Capped and centred so wide browser windows (web build) keep a readable column; no effect on phones.
  content: {
    padding: SCREEN_PADDING,
    gap: 16,
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
