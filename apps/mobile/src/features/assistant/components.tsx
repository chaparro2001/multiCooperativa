import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import type { ReactNode } from 'react';

import type { IconName } from '@/ui/paper-settings';
import { Icon, IconButton, Text, useTheme } from '@/ui/paper';
import { PressableBox } from '@/ui/pressable-box';
import { layout, radius, shadow, size, space } from '@/ui/theme';

/**
 * Message of the assistant chat. User: right, brand fill. Assistant: left, `surfaceVariant`.
 * Max width 92 %, radius 14 with the sender-side bottom corner at 4. A string child is wrapped
 * in a coloured `Text`; pass your own element (the markdown view) for formatted answers.
 * `pending` dims a message still being sent.
 */
export function ChatBubble({
  role,
  pending = false,
  children,
  testID,
}: {
  role: 'user' | 'assistant';
  pending?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const user = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        user ? styles.userCorner : styles.assistantCorner,
        {
          alignSelf: user ? 'flex-end' : 'flex-start',
          backgroundColor: user ? colors.primary : colors.surfaceVariant,
          opacity: pending ? 0.6 : 1,
        },
      ]}
      testID={testID}
    >
      {typeof children === 'string' ? (
        <Text variant="bodyLarge" style={{ color: user ? colors.onPrimary : colors.onSurface }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

/** The assistant's wait ("Pensando…"), as an assistant bubble. */
export function Thinking({ testID }: { testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <ChatBubble role="assistant" testID={testID}>
      <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
        {t('assistant.thinking')}
      </Text>
    </ChatBubble>
  );
}

/**
 * One citation under an answer: outlined, numbered disc, title in `labelLarge` ("Título · pág.
 * N"), two-line muted excerpt and a trailing icon for the kind of source. Without `onPress` it is
 * not tappable.
 */
export function SourceCard({
  title,
  excerpt,
  n,
  icon = 'file-document-outline',
  onPress,
  testID,
}: {
  title: string;
  excerpt?: string;
  n?: number;
  icon?: IconName;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      {n !== undefined ? (
        <View style={[styles.disc, { backgroundColor: colors.primaryContainer }]}>
          <Text variant="labelMedium" style={{ color: colors.onPrimaryContainer }}>
            {n}
          </Text>
        </View>
      ) : null}
      <View style={styles.sourceText}>
        <Text variant="labelLarge">{title}</Text>
        {excerpt ? (
          <Text variant="bodyMedium" numberOfLines={2} style={{ color: colors.onSurfaceVariant }}>
            {excerpt}
          </Text>
        ) : null}
      </View>
      <Icon source={icon} size={20} color={colors.secondary} />
    </>
  );
  const frame = [
    styles.source,
    { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
  ];
  return onPress ? (
    <PressableBox style={frame} onPress={onPress} accessibilityRole="button" testID={testID}>
      {body}
    </PressableBox>
  ) : (
    <View style={frame} testID={testID}>
      {body}
    </View>
  );
}

/**
 * The assistant input bar: a multiline field that grows to 120 and a round 48 send button
 * labelled "Enviar". Disabled while the field is empty or `disabled` (a reply is pending). Sits
 * on `surface` with a top hairline; place it as the screen's last child.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  disabled = false,
  maxLength = 2000,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText(value: string): void;
  onSend(): void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canSend = !disabled && value.trim().length > 0;
  return (
    <View
      style={[
        styles.composer,
        { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
      ]}
    >
      <View style={styles.composerInner}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={maxLength}
          placeholder={placeholder ?? t('assistant.placeholder')}
          placeholderTextColor={colors.onSurfaceVariant}
          accessibilityLabel={placeholder ?? t('assistant.placeholder')}
          style={[styles.input, { borderColor: colors.outline, color: colors.onSurface }]}
          testID={testID}
        />
        <IconButton
          icon="send"
          mode="contained"
          size={24}
          containerColor={colors.primary}
          iconColor={colors.onPrimary}
          disabled={!canSend}
          onPress={onSend}
          accessibilityLabel={t('assistant.send')}
          style={styles.send}
          testID={testID ? `${testID}-send` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: layout.bubbleMax,
    borderRadius: radius.bubble,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  userCorner: { borderBottomRightRadius: radius.xs },
  assistantCorner: { borderBottomLeftRadius: radius.xs },
  disc: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    marginLeft: space[2],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sourceText: { flex: 1, gap: 2 },
  composer: {
    borderTopWidth: 1,
    boxShadow: shadow[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  composerInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: size.control,
    maxHeight: size.composerMax,
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontSize: 16,
  },
  send: { width: size.control, height: size.control, borderRadius: radius.full, margin: 0 },
});
