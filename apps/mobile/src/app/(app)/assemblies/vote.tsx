import type { VoteChoice } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { useCastVote } from '@/features/assemblies/queries';
import { Button } from '@/ui/button';
import { Text, useTheme } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';
import { space } from '@/ui/theme';
import { confirmAction } from '@/ui/confirm';
import { VoteOption } from '@/ui/vote-option';

const CHOICES: VoteChoice[] = ['in_favor', 'against', 'abstention'];

/** US-ASM-05: one vote per item, confirmed because it cannot be changed (BR-ASM-03). */
export default function VoteScreen() {
  const { colors } = useTheme();
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
        <Text variant="headlineSmall">{t('assemblies.vote.recordedTitle')}</Text>
        <Text variant="titleMedium" style={{ color: colors.primary }}>
          {t('assemblies.vote.recorded', { choice: t(`enums.voteChoice.${cast}`) })}
        </Text>
        {error ? (
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {error}
          </Text>
        ) : null}
        <Button title={t('assemblies.vote.backToAssembly')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="vote-screen">
      <Stack.Screen options={{ title: t('assemblies.vote.title') }} />
      <Text variant="bodyLarge">{t('assemblies.vote.choose')}</Text>
      <View style={styles.options}>
        {CHOICES.map((value) => (
          <VoteOption
            key={value}
            label={t(`enums.voteChoice.${value}`)}
            selected={choice === value}
            onPress={() => setChoice(value)}
            testID={`option-${value}`}
          />
        ))}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        title={t('assemblies.vote.submit')}
        block
        onPress={confirm}
        disabled={!choice}
        loading={vote.isPending}
        testID="cast-vote"
      />
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        {t('assemblies.vote.advisory')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: space[3] },
});
