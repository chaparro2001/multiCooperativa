import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  type ListRenderItem,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

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
import { ChatBubble, Composer, SourceCard, Thinking } from '@/features/assistant/components';
import { Banner } from '@/ui/banner';
import { Card } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { Text, useTheme } from '@/ui/paper';
import { space } from '@/ui/theme';

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
  // The error branch must fire once per failed load, which render-time adjusting cannot express.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs a server query into local chat state */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
    }, [conversationId, exists]),
  );

  /** Resolves to false when the send failed, so the composer can give the text back. */
  async function send(text: string): Promise<boolean> {
    const content = text.trim();
    if (!content || busy) return false;
    setError(null);
    const pending: ChatMessage = {
      // eslint-disable-next-line react-hooks/purity -- runs in an event handler, never during render
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
      return true;
    } catch (failure) {
      setMessages((current) => current.filter((message) => message.id !== pending.id));
      setError(messageFor(failure));
      return false;
    }
  }

  const { mutateAsync: rateAsync } = rateMessage;
  const rate = useCallback(
    async (messageId: string, rating: 'helpful' | 'not_helpful') => {
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? { ...message, rating } : message)),
      );
      try {
        await rateAsync({ messageId, rating });
      } catch (failure) {
        setError(messageFor(failure));
      }
    },
    [rateAsync],
  );
  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => <MessageBubble message={item} onRate={rate} />,
    [rate],
  );

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
                onPress={() => void send(t(`assistant.suggestions.${key}`))}
                style={{ borderColor: colors.primary, backgroundColor: colors.primaryContainer }}
                testID={`suggestion-${key}`}
              >
                <Text variant="bodyMedium" style={{ color: colors.onPrimaryContainer }}>
                  {t(`assistant.suggestions.${key}`)}
                </Text>
              </Card>
            ))}
          </View>
        }
        renderItem={renderItem}
        ListFooterComponent={
          <View style={styles.footer}>
            {busy ? <Thinking /> : null}
            {error ? (
              <Banner tone="danger" testID="error-message">
                {error}
              </Banner>
            ) : null}
          </View>
        }
      />
      <ComposerBar busy={busy} onSend={send} />
    </KeyboardAvoidingView>
  );
}

/** Owns the draft, so typing re-renders only the composer and not the message list. */
function ComposerBar({ busy, onSend }: { busy: boolean; onSend(text: string): Promise<boolean> }) {
  const [draft, setDraft] = useState('');

  async function submit() {
    const text = draft;
    if (!text.trim() || busy) return;
    setDraft('');
    if (!(await onSend(text))) setDraft(text);
  }

  return (
    <Composer
      value={draft}
      onChangeText={setDraft}
      onSend={() => void submit()}
      disabled={busy}
      testID="assistant-input"
      sendTestID="assistant-send"
    />
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  onRate,
}: {
  message: ChatMessage;
  onRate(messageId: string, rating: 'helpful' | 'not_helpful'): void;
}) {
  const { t } = useTranslation();
  const mine = message.role === 'user';
  const { colors } = useTheme();
  return (
    <ChatBubble role={message.role} pending={message.pending}>
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
          {message.citations.map((citation, index) => (
            <SourceCard
              key={citation.ref}
              n={index + 1}
              title={
                citation.page
                  ? t('assistant.citationPage', { title: citation.title, page: citation.page })
                  : citation.title
              }
              excerpt={citation.excerpt ?? undefined}
              accessibilityLabel={t('assistant.openSource', { title: citation.title })}
              onPress={() => router.push(citationTarget(citation))}
              testID={`citation-${citation.ref}`}
            />
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
              onPress={() => onRate(message.id, rating)}
              testID={`rate-${rating}`}
            >
              {t(`assistant.rating.${rating}`)}
            </Chip>
          ))}
        </View>
      )}
    </ChatBubble>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  messages: { padding: space[4], gap: space[3], flexGrow: 1 },
  empty: { gap: space[3], paddingTop: space[6] },
  footer: { gap: space[3] },
  citations: { gap: space[2] },
  rating: { flexDirection: 'row', gap: space[2] },
});
