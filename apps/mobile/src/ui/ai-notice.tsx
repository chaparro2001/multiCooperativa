import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { IconName } from './paper-settings';
import { radius, space } from './theme';

const ICON: Record<AiNoticeKind, IconName> = {
  privacy: 'shield-lock-outline',
  proposal: 'creation',
  info: 'information-outline',
};

export type AiNoticeKind = 'privacy' | 'proposal' | 'info';

/**
 * The one recognisable style for every AI-related notice (privacy, "the AI only proposes", model
 * information): surface-variant fill, dashed edge unique to AI, uppercase kicker and icon by
 * `kind`. Keep the copy to what the product guarantees.
 */
export function AiNotice({
  kind = 'info',
  title,
  children,
  testID,
}: {
  kind?: AiNoticeKind;
  /** Replaces the kicker of the kind. */
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: colors.surfaceVariant, borderColor: colors.onSurfaceVariant },
      ]}
      testID={testID}
    >
      <Icon source={ICON[kind]} size={22} color={colors.secondary} />
      <View style={styles.body}>
        <Text variant="labelSmall" style={[styles.kicker, { color: colors.secondary }]}>
          {title ?? t(`ui.aiNotice.${kind}`)}
        </Text>
        <Text variant="bodyMedium">{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  body: { flex: 1, gap: space[1] },
  kicker: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
});
