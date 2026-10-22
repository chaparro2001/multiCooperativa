import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { formatDate } from '@/i18n/format';
import { Button } from '@/ui/button';
import { Text, useTheme } from '@/ui/paper';
import { radius, shadow, space } from '@/ui/theme';

/** The browser share sheet exists only on some web platforms; native always has one. */
const canShare = Platform.OS !== 'web' || typeof globalThis.navigator?.share === 'function';

/**
 * US-ACC-08 (ADR-016): the server has no email provider, so the administrator receives the
 * single-use link and passes it on. It is shown here and nowhere else.
 */
export function InvitationLinkCard({ url, expiresAt }: { url: string; expiresAt: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const expiry = formatDate(new Date(expiresAt));

  async function copy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  }

  async function share() {
    try {
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
    } catch {
      // Dismissing the sheet is not an error; the link stays visible to copy.
    }
  }

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, boxShadow: shadow[3] }]}
      testID="invitation-link-card"
    >
      <Text variant="bodyMedium">{t('members.invitationLink.explanation', { date: expiry })}</Text>
      <Text
        selectable
        variant="bodySmall"
        style={[styles.link, { color: colors.onSurfaceVariant }]}
        testID="invitation-link"
      >
        {url}
      </Text>
      <View style={styles.actions}>
        <Button
          title={copied ? t('members.invitationLink.copied') : t('members.invitationLink.copy')}
          variant="secondary"
          onPress={() => void copy()}
          testID="invitation-link-copy"
        />
        {canShare && (
          <Button
            title={t('members.invitationLink.share')}
            variant="secondary"
            onPress={() => void share()}
            testID="invitation-link-share"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space[4], gap: space[3] },
  link: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  actions: { gap: space[2] },
});
