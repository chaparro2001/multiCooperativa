import { type ReactNode, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type FormApi, FormScope, ScrollerProvider } from '@/forms/use-form';

import { useBrandColor } from '../branding/brand';
import { colors } from './theme';

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
      style={styles.flex}
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
