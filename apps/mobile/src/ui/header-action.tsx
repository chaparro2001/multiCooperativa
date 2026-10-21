import { type Href, Link } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { createElement, type ReactNode } from 'react';

import { useBrandColor } from '@/branding/brand';

interface HeaderActionBase {
  /**
   * Accessible name of the action (i18n). Screen readers read it and the web shows it as a
   * tooltip, since the action itself is only an icon.
   */
  label: string;
  /** Navigates with an expo-router link (role "link"). */
  href?: Href;
  /** Runs an action (role "button"). */
  onPress?: () => void;
  testID?: string;
  /** Lucide icon component, tinted with the brand color (decorative: the label names the action). */
  icon: LucideIcon;
}

/** Minimum touch target of an icon action (44x44, Apple HIG and WCAG 2.5.5). */
export const HEADER_ACTION_SIZE = 44;

/** Icon action for a Stack `headerRight`; icons use the cooperative's brand color. */
export function HeaderAction({ label, href, onPress, testID, icon: Icon }: HeaderActionBase) {
  const color = useBrandColor();
  const glyph = <Icon size={24} strokeWidth={1.75} color={color} aria-hidden />;

  const action =
    href !== undefined ? (
      <Link href={href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={label}
          style={styles.target}
          testID={testID}
        >
          {glyph}
        </Pressable>
      </Link>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.target}
        onPress={onPress}
        testID={testID}
      >
        {glyph}
      </Pressable>
    );
  return withTooltip(label, action);
}

/**
 * Web tooltip. react-native-web drops the `title` prop, so a layout-neutral DOM wrapper
 * (`display: contents`) carries it; hovering the icon shows the label. Native has no hover.
 */
function withTooltip(label: string, child: ReactNode): ReactNode {
  if (Platform.OS !== 'web') return child;
  return createElement('div', { title: label, style: { display: 'contents' } }, child);
}

/**
 * Container of one or more `HeaderAction`s. The web header puts `headerRight` flush against
 * the window edge, so the group gets a right margin there.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Platform.OS === 'web' ? 8 : 0,
  },
  target: {
    minWidth: HEADER_ACTION_SIZE,
    minHeight: HEADER_ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
