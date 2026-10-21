import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';

import { useBrandColor } from '@/branding/brand';
import { IconButton } from '@/ui/paper';

import { parentRoute } from './parent-route';

// Same glyph as the stack's own back button: a chevron on iOS, an arrow on Android and web.
const BACK_ICON = Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left';

/**
 * Header back button for screens opened without history (reload or deep link on web): it goes to
 * the logical parent instead of leaving a dead arrow. With history the stack's own button is used.
 */
export function HeaderBack() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const brand = useBrandColor();
  const parent = parentRoute(pathname);
  if (parent === null) return null;
  return (
    <IconButton
      icon={BACK_ICON}
      size={24}
      iconColor={brand}
      accessibilityLabel={t('common.actions.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(parent as '/'))}
      style={styles.button}
      testID="header-back"
    />
  );
}

const styles = StyleSheet.create({
  button: { margin: 0 },
});
