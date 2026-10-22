import { Button as PaperButton, useTheme } from 'react-native-paper';

import { useBrandColor } from '../branding/brand';
import type { IconName } from './paper-settings';
import { size } from './theme';

/**
 * Variants map to Paper modes: `primary` is a filled (contained) button in the brand colour,
 * `secondary` an outlined one, `danger` a filled one in the error colour, `text` a low-emphasis
 * link-like action in the brand colour ("Rellenar a mano", "Quitar"). Every one keeps a 48 hit
 * area. `block` makes it full width; `icon` is a MaterialCommunityIcons name before the label.
 */
export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  color,
  icon,
  block = false,
  testID,
}: {
  title: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  /** Overrides the cooperative's brand colour (the appearance preview). */
  color?: string;
  icon?: IconName;
  block?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const brand = useBrandColor();
  const accent = color ?? brand;
  const inactive = disabled || loading;
  const outlined = variant === 'secondary';
  const filled = variant === 'primary' || variant === 'danger';
  return (
    <PaperButton
      mode={outlined ? 'outlined' : variant === 'text' ? 'text' : 'contained'}
      buttonColor={
        variant === 'danger' ? theme.colors.error : variant === 'primary' ? accent : undefined
      }
      textColor={filled ? theme.colors.onPrimary : accent}
      style={[outlined ? { borderColor: accent } : null, block ? { alignSelf: 'stretch' } : null]}
      contentStyle={{ minHeight: size.control }}
      icon={icon}
      loading={loading}
      // Loading keeps the colours of an enabled button; it only ignores presses.
      disabled={disabled}
      onPress={inactive ? undefined : onPress}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
    >
      {title}
    </PaperButton>
  );
}
