import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useBrandColor } from '@/branding/brand';

import { parentRoute } from './parent-route';

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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.actions.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(parent as '/'))}
      hitSlop={8}
      style={styles.button}
      testID="header-back"
    >
      <MaterialCommunityIcons name="chevron-left" size={28} color={brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 8, paddingVertical: 4 },
});
