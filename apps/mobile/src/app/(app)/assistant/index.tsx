import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { type ChatMessage, citationTarget, suggestedQuestions } from '@/features/assistant/chat';
import { MarkdownText } from '@/features/assistant/markdown-text';
import {
  useConversation,
  useConversationExists,
  useCreateConversation,
  useRateMessage,
  useSendMessage,
} from '@/features/assistant/queries';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { Button } from '@/ui/button';
import { Card, Chip, Text, TextInput, useTheme } from '@/ui/paper';
import { ErrorText } from '@/ui/screen';

/**
 * Keyed by cooperative: switching cooperative mounts a new chat, so a new conversation
 * starts (US-AI-04).
 */
export default function AssistantScreen() {
  const { cooperativeId } = useActiveCooperative();
  return <Chat key={cooperativeId ?? 'none'} />;
}

function Chat() {
  const { t } = useTranslation();
  const { permissions } = useActiveCooperative();
  const { colors } = useTheme();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const rateMessage = useRateMessage();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const busy = createConversation.isPending || sendMessage.isPending;
  // US-AI-04: the history opens a conversation with `conversation`, or starts a new one with `fresh`.
  const { conversation: openId, fresh } = useLocalSearchParams<{
    conversation?: string;
    fresh?: string;
  }>();
  const opened = useConversation(openId);
  const exists = useConversationExists();

  function reset() {
    setMessages([]);
    setConversationId(null);
    setError(null);
    router.setParams({ conversation: undefined, fresh: undefined });
  }

  // Reopened conversation: its messages come from the server once, then the chat continues locally.
  useEffect(() => {
    if (!openId || opened.isFetching) return;
    if (opened.data && opened.data.id !== conversationId) {
      setConversationId(opened.data.id);
      setMessages(opened.data.messages);
      setError(null);
    } else if (opened.error) {
      setError(messageFor(opened.error));
    }
  }, [openId, opened.data, opened.error, opened.isFetching, conversationId]);

  // "New conversation" from the history.
  const lastFresh = useRef(fresh);
  useEffect(() => {
    if (fresh && fresh !== lastFresh.current) reset();
    lastFresh.current = fresh;
  }, [fresh]);

  // Coming back from the history, the open conversation may have been deleted there.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return;
      let current = true;
      void exists(conversationId).then((found) => {
        if (current && !found) reset();
      });
      return () => {
        current = false;
      };
    }, [conversationId]),
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setDraft('');
    const pending: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content,
      citations: [],
      rating: null,
      pending: true,
    };
    setMessages((current) => [...current, pending]);
    try {
      const id = conversationId ?? (await createConversation.mutateAsync()).id;
      setConversationId(id);
      const { userMessage, answer } = await sendMessage.mutateAsync({
        conversationId: id,
        content,
      });
      setMessages((current) => [
        ...current.filter((message) => message.id !== pending.id),
        userMessage,
        answer,
      ]);
    } catch (failure) {
      setMessages((current) => current.filter((message) => message.id !== pending.id));
      setDraft(content);
      setError(messageFor(failure));
    }
  }

  async function rate(messageId: string, rating: 'helpful' | 'not_helpful') {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, rating } : message)),
    );
    try {
      await rateMessage.mutateAsync({ messageId, rating });
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  const suggestions = suggestedQuestions(permissions?.permissions);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderAction
                href="/assistant/history"
                icon="history"
                label={t('assistant.history.open')}
                testID="assistant-history"
              />
              {messages.length > 0 && (
                <HeaderAction
                  onPress={reset}
                  icon="square-edit-outline"
                  label={t('assistant.newConversation')}
                  testID="new-conversation"
                />
              )}
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        ref={list}
        testID="assistant-messages"
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="titleLarge">{t('assistant.emptyTitle')}</Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
              {t('assistant.emptyHint')}
            </Text>
            {suggestions.map((key) => (
              <Card
                key={key}
                mode="outlined"
                accessibilityRole="button"
                onPress={() => send(t(`assistant.suggestions.${key}`))}
                style={{ borderColor: colors.primary, backgroundColor: colors.primaryContainer }}
                testID={`suggestion-${key}`}
              >
                <Card.Content style={styles.suggestion}>
                  <Text variant="bodyMedium">{t(`assistant.suggestions.${key}`)}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble message={item} onRate={(rating) => rate(item.id, rating)} />
        )}
        ListFooterComponent={
          busy ? (
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
              {t('assistant.thinking')}
            </Text>
          ) : null
        }
      />
      {error ? (
        <View style={styles.error}>
          <ErrorText>{error}</ErrorText>
        </View>
      ) : null}
      <View style={[styles.composer, { borderTopColor: colors.outlineVariant }]}>
        <TextInput
          mode="outlined"
          dense
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('assistant.placeholder')}
          accessibilityLabel={t('assistant.placeholder')}
          multiline
          maxLength={2000}
          editable={!busy}
          testID="assistant-input"
        />
        <Button
          title={t('assistant.send')}
          onPress={() => send(draft)}
          disabled={!draft.trim()}
          loading={busy}
          testID="assistant-send"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  onRate,
}: {
  message: ChatMessage;
  onRate(rating: 'helpful' | 'not_helpful'): void;
}) {
  const { t } = useTranslation();
  const mine = message.role === 'user';
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? [styles.mine, { backgroundColor: colors.primary }]
          : [styles.theirs, { backgroundColor: colors.surfaceVariant }],
        message.pending && styles.dim,
      ]}
    >
      {mine ? (
        <Text variant="bodyLarge" style={{ color: colors.onPrimary }} selectable>
          {message.content}
        </Text>
      ) : (
        <MarkdownText source={message.content} />
      )}
      {message.citations.length > 0 && (
        <View style={styles.citations} testID="citations">
          <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
            {t('assistant.sources')}
          </Text>
          {message.citations.map((citation) => (
            <Card
              key={citation.ref}
              mode="outlined"
              accessibilityRole="link"
              accessibilityLabel={t('assistant.openSource', { title: citation.title })}
              onPress={() => router.push(citationTarget(citation))}
              style={{ backgroundColor: colors.surface }}
              testID={`citation-${citation.ref}`}
            >
              <Card.Content style={styles.citation}>
                <Text variant="labelLarge" style={{ color: colors.primary }}>
                  {citation.page
                    ? t('assistant.citationPage', { title: citation.title, page: citation.page })
                    : citation.title}
                </Text>
                {citation.excerpt ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: colors.onSurfaceVariant }}
                    numberOfLines={2}
                  >
                    {citation.excerpt}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          ))}
        </View>
      )}
      {!mine && !message.pending && (
        <View style={styles.rating}>
          {(['helpful', 'not_helpful'] as const).map((rating) => (
            <Chip
              key={rating}
              compact
              selected={message.rating === rating}
              onPress={() => onRate(rating)}
              testID={`rate-${rating}`}
            >
              {t(`assistant.rating.${rating}`)}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  messages: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { gap: 12, paddingTop: 24 },
  suggestion: { paddingVertical: 12 },
  bubble: { borderRadius: 14, padding: 12, gap: 8, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  dim: { opacity: 0.6 },
  citations: { gap: 6 },
  citation: { paddingVertical: 8, gap: 2 },
  rating: { flexDirection: 'row', gap: 8 },
  error: { paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  input: { flex: 1, maxHeight: 120 },
});
