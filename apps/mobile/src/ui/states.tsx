import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { ActivityIndicator, Icon, Text, useTheme } from 'react-native-paper';

import { Button } from './button';
import type { IconName } from './paper-settings';
import { colors as fixed, radius, size, space } from './theme';
import { useReducedMotion } from './use-reduced-motion';

/**
 * A centred, calm message for an empty list: the module's own 48 px icon, the per-screen copy in
 * `bodyLarge` muted and, for managers, the create action underneath (`action`, a `Button`).
 */
export function EmptyState({
  message,
  icon = 'inbox-outline',
  title,
  action,
  testID,
}: {
  message: string;
  icon?: IconName;
  title?: string;
  action?: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.state} testID={testID}>
      <Icon source={icon} size={size.iconEmpty} color={colors.secondary} />
      {title ? (
        <Text variant="titleMedium" style={styles.centered}>
          {title}
        </Text>
      ) : null}
      <Text variant="bodyLarge" style={[styles.centered, { color: colors.onSurfaceVariant }]}>
        {message}
      </Text>
      {action}
    </View>
  );
}

/**
 * Replaces a screen's content when it cannot load: icon, red message announced as an alert and a
 * secondary "Reintentar" button. Without `onRetry` (or `onRetry={false}`) there is no button:
 * permission errors use `icon="lock-outline"` and no retry.
 */
export function ErrorState({
  message,
  icon = 'cloud-off-outline',
  onRetry,
  testID,
}: {
  message: string;
  icon?: IconName;
  onRetry?: (() => void) | false;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.state} testID={testID}>
      <Icon source={icon} size={size.iconEmpty} color={fixed.danger} />
      <Text
        variant="bodyLarge"
        accessibilityRole="alert"
        style={[styles.centered, { color: fixed.danger }]}
        testID="error-message"
      >
        {message}
      </Text>
      {onRetry ? (
        <Button
          variant="secondary"
          title={t('common.actions.retry')}
          onPress={onRetry}
          testID="retry-button"
        />
      ) : null}
    </View>
  );
}

function Block({ width = '100%', height = 16 }: { width?: DimensionValue; height?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ width, height, borderRadius: radius.xs, backgroundColor: colors.surfaceVariant }}
    />
  );
}

function RowSkeleton() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.rowCard,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
      ]}
    >
      <Block width="65%" height={20} />
      <Block width="40%" />
    </View>
  );
}

/**
 * Placeholder for the first load, shaped like the real content: `list` (row cards) or `detail`
 * (title, meta, body lines). A slow opacity shimmer that stays still under reduced motion. It
 * carries no testID: Maestro waits for the real screen's ids.
 */
export function Skeleton({
  variant = 'list',
  rows = 4,
}: {
  variant?: 'list' | 'detail';
  rows?: number;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <Animated.View
      style={[styles.skeleton, { opacity: pulse }]}
      accessibilityRole="progressbar"
      accessibilityLabel={t('ui.loading')}
    >
      {variant === 'detail' ? (
        <>
          <Block width="70%" height={28} />
          <Block width="45%" />
          <View style={styles.lines}>
            <Block />
            <Block />
            <Block width="85%" />
            <Block width="60%" />
          </View>
        </>
      ) : (
        Array.from({ length: rows }, (_, index) => <RowSkeleton key={index} />)
      )}
    </Animated.View>
  );
}

/** Small spinner at the end of an infinite list while the next page loads; nothing otherwise. */
export function ListFooter({ loading }: { loading: boolean }) {
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: space[3], padding: space[8] },
  centered: { textAlign: 'center' },
  skeleton: { gap: space[3], padding: space[4] },
  rowCard: { borderRadius: radius.md, borderWidth: 1, padding: space[4], gap: space[2] },
  lines: { gap: space[2], marginTop: space[2] },
  footer: { paddingVertical: space[4], alignItems: 'center' },
});
