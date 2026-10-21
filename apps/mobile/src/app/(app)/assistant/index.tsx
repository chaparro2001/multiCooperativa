import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { messageFor } from '@/api/api-error';
import { useBrandColor, useBrandTint } from '@/branding/brand';
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
import { ErrorText } from '@/ui/screen';
import { colors } from '@/ui/theme';

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
  const brand = useBrandColor();
  const tint = useBrandTint();
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
      style={styles.screen}
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
            <Text style={styles.emptyTitle}>{t('assistant.emptyTitle')}</Text>
            <Text style={styles.muted}>{t('assistant.emptyHint')}</Text>
            {suggestions.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => send(t(`assistant.suggestions.${key}`))}
                style={[styles.suggestion, { borderColor: brand, backgroundColor: tint }]}
                testID={`suggestion-${key}`}
              >
                <Text style={styles.suggestionText}>{t(`assistant.suggestions.${key}`)}</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble message={item} onRate={(rating) => rate(item.id, rating)} />
        )}
        ListFooterComponent={
          busy ? <Text style={styles.muted}>{t('assistant.thinking')}</Text> : null
        }
      />
      {error && (
        <View style={styles.error}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}
      <View style={styles.composer}>
        <TextInput
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
  const brand = useBrandColor();
  return (
    <View
      style={[
        styles.bubble,
        mine ? [styles.mine, { backgroundColor: brand }] : styles.theirs,
        message.pending && styles.dim,
      ]}
    >
      {mine ? (
        <Text style={styles.mineText} selectable>
          {message.content}
        </Text>
      ) : (
        <MarkdownText source={message.content} style={styles.text} />
      )}
      {message.citations.length > 0 && (
        <View style={styles.citations} testID="citations">
          <Text style={styles.sources}>{t('assistant.sources')}</Text>
          {message.citations.map((citation) => (
            <Pressable
              key={citation.ref}
              accessibilityRole="link"
              accessibilityLabel={t('assistant.openSource', { title: citation.title })}
              onPress={() => router.push(citationTarget(citation))}
              style={styles.citation}
              testID={`citation-${citation.ref}`}
            >
              <Text style={[styles.citationTitle, { color: brand }]}>
                {citation.page
                  ? t('assistant.citationPage', { title: citation.title, page: citation.page })
                  : citation.title}
              </Text>
              {citation.excerpt && (
                <Text style={styles.excerpt} numberOfLines={2}>
                  {citation.excerpt}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
      {!mine && !message.pending && (
        <View style={styles.rating}>
          {(['helpful', 'not_helpful'] as const).map((rating) => (
            <Pressable
              key={rating}
              accessibilityRole="button"
              accessibilityState={{ selected: message.rating === rating }}
              onPress={() => onRate(rating)}
              style={[styles.rate, message.rating === rating && styles.rateSelected]}
              testID={`rate-${rating}`}
            >
              <Text style={styles.rateText}>{t(`assistant.rating.${rating}`)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  messages: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { gap: 12, paddingTop: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
  },
  suggestionText: { color: colors.text, fontSize: 15 },
  bubble: { borderRadius: 14, padding: 12, gap: 8, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  dim: { opacity: 0.6 },
  text: { color: colors.text, fontSize: 16 },
  mineText: { color: '#fff', fontSize: 16 },
  citations: { gap: 6 },
  sources: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  citation: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
    gap: 2,
  },
  citationTitle: { fontSize: 14, fontWeight: '600' },
  excerpt: { color: colors.muted, fontSize: 12 },
  rating: { flexDirection: 'row', gap: 8 },
  rate: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rateSelected: { backgroundColor: colors.border },
  rateText: { color: colors.muted, fontSize: 12 },
  error: { paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.text,
  },
});
