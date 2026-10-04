import type { VoteChoice } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { CHOICE_LABEL } from '@/features/assemblies/agenda';
import { useCastVote } from '@/features/assemblies/queries';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

const CHOICES: VoteChoice[] = ['a_favor', 'en_contra', 'abstencion'];

/** HU-ASA-05: one vote per item, confirmed because it cannot be changed (RN-ASA-03). */
export default function VoteScreen() {
  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const vote = useCastVote();
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [cast, setCast] = useState<VoteChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!choice) return;
    Alert.alert(
      'Confirmar voto',
      `Vas a votar «${CHOICE_LABEL[choice]}». El voto no se puede cambiar.`,
      [
        { text: 'Revisar', style: 'cancel' },
        {
          text: 'Votar',
          onPress: async () => {
            setError(null);
            try {
              const result = await vote.mutateAsync({ pointId, choice });
              setCast(result.myVote);
            } catch (failure) {
              // HU-ASA-05: if already voted, the vote that counts is shown.
              if (failure instanceof ApiError && failure.code === 'already_voted') {
                setCast((failure.details.choice as VoteChoice | undefined) ?? null);
              }
              setError(messageFor(failure));
            }
          },
        },
      ],
    );
  }

  if (cast) {
    return (
      <Screen testID="voto-confirmado">
        <Stack.Screen options={{ title: 'Voto registrado' }} />
        <Text style={styles.done}>Tu voto ha quedado registrado: {CHOICE_LABEL[cast]}</Text>
        {error && <Text style={styles.meta}>{error}</Text>}
        <Button title="Volver a la asamblea" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="pantalla-votar">
      <Stack.Screen options={{ title: 'Votar' }} />
      <Text style={styles.text}>Elige tu voto:</Text>
      <View style={styles.choices}>
        {CHOICES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === value }}
            onPress={() => setChoice(value)}
            style={[styles.choice, choice === value && styles.selected]}
            testID={`opcion-${value}`}
          >
            <Text style={[styles.choiceText, choice === value && styles.selectedText]}>
              {CHOICE_LABEL[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title="Emitir voto"
        onPress={confirm}
        disabled={!choice}
        loading={vote.isPending}
        testID="emitir-voto"
      />
      <Text style={styles.meta}>
        La votación es consultiva y de apoyo a la asamblea presencial.
      </Text>
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
