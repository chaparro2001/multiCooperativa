import { type Href, Link } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { createElement, type ReactNode } from 'react';
import { IconButton } from 'react-native-paper';

import { useBrandColor } from '@/branding/brand';

import type { IconName } from './paper-settings';

export type { IconName };

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
  /** MaterialCommunityIcons name, tinted with the brand color (decorative: the label names the action). */
  icon: IconName;
}

/** Minimum touch target of an icon action (44x44, Apple HIG and WCAG 2.5.5). */
export const HEADER_ACTION_SIZE = 44;

/** Icon action for a Stack `headerRight`; vector icons use the cooperative's brand color. */
export function HeaderAction({ label, href, onPress, testID, icon }: HeaderActionBase) {
  const color = useBrandColor();
  const button = (role: 'link' | 'button') => (
    <IconButton
      icon={icon}
      iconColor={color}
      size={24}
      accessibilityLabel={label}
      accessibilityRole={role}
      style={styles.target}
      onPress={onPress}
      testID={testID}
    />
  );

  const action =
    href !== undefined ? (
      <Link href={href} asChild>
        {button('link')}
      </Link>
    ) : (
      button('button')
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
  target: { width: HEADER_ACTION_SIZE, height: HEADER_ACTION_SIZE, margin: 0 },
});
