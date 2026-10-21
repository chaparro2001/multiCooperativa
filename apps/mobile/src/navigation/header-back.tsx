import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/ui/theme';

import { parentRoute } from './parent-route';

/**
 * Header back button for screens opened without history (reload or deep link on web): it goes to
 * the logical parent instead of leaving a dead arrow. With history the stack's own button is used.
 */
export function HeaderBack() {
  const { t } = useTranslation();
  const pathname = usePathname();
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
      <Text style={styles.arrow}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 8, paddingVertical: 4 },
  arrow: { fontSize: 32, lineHeight: 32, color: colors.primary },
});
