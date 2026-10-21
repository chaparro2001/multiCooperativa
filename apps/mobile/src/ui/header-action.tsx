import { type Href, Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useBrandColor } from '@/branding/brand';

interface HeaderActionProps {
  title: string;
  /** Navigates with an expo-router link (role "link"). */
  href?: Href;
  /** Runs an action (role "button"). */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Text action for a Stack `headerRight`, in the cooperative's brand color. */
export function HeaderAction({
  title,
  href,
  onPress,
  accessibilityLabel,
  testID,
}: HeaderActionProps) {
  const color = useBrandColor();
  const label = <Text style={[styles.text, { color }]}>{title}</Text>;

  if (href !== undefined) {
    return (
      <Link href={href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={accessibilityLabel}
          hitSlop={8}
          testID={testID}
        >
          {label}
        </Pressable>
      </Link>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      {label}
    </Pressable>
  );
}

/**
 * Container of one or more `HeaderAction`s. The web header puts `headerRight`
 * flush against the window edge, so the group gets a right margin there.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: Platform.OS === 'web' ? 16 : 0,
  },
  text: { fontSize: 16 },
});
