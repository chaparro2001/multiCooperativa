import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { PaperProvider } from 'react-native-paper';

/** Glyph name of MaterialCommunityIcons, the icon set of the app (ADR-020). */
export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type PaperSettings = NonNullable<ComponentProps<typeof PaperProvider>['settings']>;

/** Paper draws its own icons (text-input adornments, checkbox…) with the same icon set. */
export const paperSettings: PaperSettings = {
  icon: ({ name, color, size, direction, testID }) => (
    <MaterialCommunityIcons
      name={name as IconName}
      color={color}
      size={size}
      testID={testID}
      style={{ transform: [{ scaleX: direction === 'rtl' ? -1 : 1 }] }}
    />
  ),
};
