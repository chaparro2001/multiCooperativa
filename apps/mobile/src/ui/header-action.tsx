import { Ionicons } from '@expo/vector-icons';
import { type Href, Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ComponentProps, createElement, type ReactNode } from 'react';

import { useBrandColor } from '@/branding/brand';

type IconName = ComponentProps<typeof Ionicons>['name'];

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
}

/** The glyph is an Ionicons name (tinted with the brand color) or an emoji (decorative text). */
type HeaderActionProps = HeaderActionBase & ({ icon: IconName } | { emoji: string });

/** Minimum touch target of an icon action (44x44, Apple HIG and WCAG 2.5.5). */
export const HEADER_ACTION_SIZE = 44;

/** Icon action for a Stack `headerRight`; vector icons use the cooperative's brand color. */
export function HeaderAction(props: HeaderActionProps) {
  const { label, href, onPress, testID } = props;
  const color = useBrandColor();
  const glyph =
    'icon' in props ? (
      <Ionicons name={props.icon} size={24} color={color} />
    ) : (
      <Text style={styles.emoji}>{props.emoji}</Text>
    );

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
  emoji: { fontSize: 22 },
});
