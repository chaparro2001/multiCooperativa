import { type ReactNode, useState } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from 'react-native-paper';

import { focusRing, shadow } from './theme';

/**
 * Pressable surface shared by the kit's cards, tiles and options: a pressed style on top of the
 * base one, and the keyboard focus ring on the web. Not for screens (use `Card`, `ListRow`…).
 */
export function PressableBox({
  style,
  pressedColor,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Fill while pressed; defaults to the tonal elevation-1 surface. */
  pressedColor?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const web = Platform.OS === 'web';
  return (
    <Pressable
      {...rest}
      onFocus={web ? () => setFocused(true) : undefined}
      onBlur={web ? () => setFocused(false) : undefined}
      style={({ pressed }) => [
        style,
        pressed
          ? { backgroundColor: pressedColor ?? colors.elevation.level1, boxShadow: shadow[1] }
          : null,
        web && focused ? focusRing(colors.primary) : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
