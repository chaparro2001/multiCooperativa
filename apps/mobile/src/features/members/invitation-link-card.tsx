import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/ui/button';
import { colors } from '@/ui/theme';

/** The browser share sheet exists only on some web platforms; native always has one. */
const canShare = Platform.OS !== 'web' || typeof globalThis.navigator?.share === 'function';

/**
 * US-ACC-08 (ADR-016): the server has no email provider, so the administrator receives the
 * single-use link and passes it on. It is shown here and nowhere else.
 */
export function InvitationLinkCard({ url, expiresAt }: { url: string; expiresAt: string }) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const expiry = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(expiresAt));

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
    <View style={styles.card} testID="invitation-link-card">
      <Text style={styles.explanation}>
        {t('members.invitationLink.explanation', { date: expiry })}
      </Text>
      <Text selectable style={styles.link} testID="invitation-link">
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
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  explanation: { fontSize: 15, color: colors.text },
  link: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  actions: { gap: 8 },
});
