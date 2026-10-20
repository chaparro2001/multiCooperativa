import type { VoteChoice } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { useCastVote } from '@/features/assemblies/queries';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { confirmAction } from '@/ui/confirm';

const CHOICES: VoteChoice[] = ['in_favor', 'against', 'abstention'];

/** US-ASM-05: one vote per item, confirmed because it cannot be changed (BR-ASM-03). */
export default function VoteScreen() {
  const { t } = useTranslation();
  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const vote = useCastVote();
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [cast, setCast] = useState<VoteChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!choice) return;
    confirmAction({
      title: t('assemblies.vote.confirmTitle'),
      message: t('assemblies.vote.confirmMessage', { choice: t(`enums.voteChoice.${choice}`) }),
      confirmLabel: t('assemblies.vote.cast'),
      cancelLabel: t('assemblies.vote.review'),
      onConfirm: async () => {
        setError(null);
        try {
          const result = await vote.mutateAsync({ pointId, choice });
          setCast(result.myVote);
        } catch (failure) {
          // US-ASM-05: if already voted, the vote that counts is shown.
          if (failure instanceof ApiError && failure.code === 'already_voted') {
            setCast((failure.details.choice as VoteChoice | undefined) ?? null);
          }
          setError(messageFor(failure));
        }
      },
    });
  }

  if (cast) {
    return (
      <Screen testID="vote-confirmed">
        <Stack.Screen options={{ title: t('assemblies.vote.recordedTitle') }} />
        <Text style={styles.done}>
          {t('assemblies.vote.recorded', { choice: t(`enums.voteChoice.${cast}`) })}
        </Text>
        {error && <Text style={styles.meta}>{error}</Text>}
        <Button title={t('assemblies.vote.backToAssembly')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="vote-screen">
      <Stack.Screen options={{ title: t('assemblies.vote.title') }} />
      <Text style={styles.text}>{t('assemblies.vote.choose')}</Text>
      <View style={styles.choices}>
        {CHOICES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === value }}
            onPress={() => setChoice(value)}
            style={[styles.choice, choice === value && styles.selected]}
            testID={`option-${value}`}
          >
            <Text style={[styles.choiceText, choice === value && styles.selectedText]}>
              {t(`enums.voteChoice.${value}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title={t('assemblies.vote.submit')}
        onPress={confirm}
        disabled={!choice}
        loading={vote.isPending}
        testID="cast-vote"
      />
      <Text style={styles.meta}>{t('assemblies.vote.advisory')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, color: colors.text },
  choices: { gap: 10 },
  choice: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  selected: { borderColor: colors.primary, backgroundColor: '#e3f0e8' },
  choiceText: { fontSize: 17, color: colors.text },
  selectedText: { fontWeight: '700', color: colors.primary },
  done: { fontSize: 18, fontWeight: '600', color: colors.primary },
  meta: { fontSize: 13, color: colors.muted },
});
