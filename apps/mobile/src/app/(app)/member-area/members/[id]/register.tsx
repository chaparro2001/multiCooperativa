import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { MOVEMENT_TYPES, movementRequest } from '@/features/member-area/capital';
import { useMemberMovements, useRegisterMovement } from '@/features/member-area/queries';
import { useEuros } from '@/features/invoicing/components';
import { Chip } from '@/features/invoicing/segmented';
import { today } from '@/i18n/format';
import { Button } from '@/ui/button';
import { DateField } from '@/ui/date-field';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

const parseDay = (day: string) => new Date(`${day}T12:00:00`);

/** US-MEM-03: register a contribution, refund or correction. Movements are immutable (BR-MEM-01). */
export default function RegisterMovementScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const euros = useEuros();
  const statement = useMemberMovements(id);
  const register = useRegisterMovement(id);
  const [type, setType] = useState<(typeof MOVEMENT_TYPES)[number]>('mandatory_contribution');
  const [date, setDate] = useState(today());
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (statement.isPending) return <Loading />;
  if (statement.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(statement.error)}</ErrorText>
      </Screen>
    );
  }
  const { member, capital } = statement.data;

  async function submit() {
    setError(null);
    const draft = movementRequest({ type, date, concept, amount });
    if (!draft.ok) {
      setError(t(`memberArea.register.errors.${draft.error}`));
      return;
    }
    try {
      await register.mutateAsync(draft.request);
      router.back();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="screen-register-movement">
      <Text style={styles.who}>{member.name}</Text>
      <Text style={styles.hint}>
        {t('memberArea.register.currentCapital', { amount: euros(capital) })}
      </Text>
      <Text style={styles.label}>{t('memberArea.register.type')}</Text>
      <View style={styles.chips}>
        {MOVEMENT_TYPES.map((value) => (
          <Chip
            key={value}
            label={t(`enums.capitalMovementType.${value}`)}
            selected={type === value}
            onPress={() => setType(value)}
            testID={`type-${value}`}
          />
        ))}
      </View>
      <DateField
        label={t('memberArea.register.date')}
        mode="date"
        value={parseDay(date)}
        onChange={(value) => value && setDate(today(value))}
        testID="movement-date"
      />
      <TextField
        label={t('memberArea.register.concept')}
        value={concept}
        onChangeText={setConcept}
        maxLength={200}
        testID="movement-concept"
      />
      <TextField
        label={t('memberArea.register.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numbers-and-punctuation"
        placeholder="0,00"
        testID="movement-amount"
      />
      {type === 'refund' && <Text style={styles.hint}>{t('memberArea.register.refundHint')}</Text>}
      {type === 'correction' && (
        <Text style={styles.hint}>{t('memberArea.register.correctionHint')}</Text>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title={t('memberArea.register.submit')}
        onPress={() => void submit()}
        loading={register.isPending}
        testID="submit-movement"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
