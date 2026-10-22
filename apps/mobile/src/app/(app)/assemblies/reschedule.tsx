import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  isRescheduleField,
  RESCHEDULE_SERVER_MAPPING,
  validateReschedule,
} from '@/features/assemblies/form-validation';
import { useAssembly, useRescheduleAssembly } from '@/features/assemblies/queries';
import { formatDateTime } from '@/i18n/format';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { DateField } from '@/ui/date-field';
import { FormSummary } from '@/ui/field';
import { Text, useTheme } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { SwitchRow } from '@/ui/switch-row';
import { TextField } from '@/ui/text-field';

const HALF_AN_HOUR = 30 * 60 * 1000;
const REASON_MAX_LENGTH = 500;

/** US-ASM-09: new date and place for a convened assembly, with an optional notice to the members. */
export default function RescheduleAssemblyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const assembly = useAssembly(id);
  const reschedule = useRescheduleAssembly();
  const [loaded, setLoaded] = useState(false);
  const [firstCall, setFirstCall] = useState<Date>(() => new Date());
  const [secondCall, setSecondCall] = useState<Date | null>(null);
  const [place, setPlace] = useState('');
  const [reason, setReason] = useState('');
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    values: { firstCall, secondCall, place, reason, notifyMembers },
    validate: (values) => validateReschedule(values),
  });

  // Seeds the form from the server once (adjusting state during render, not in an effect).
  const data = assembly.data;
  if (!loaded && data) {
    setFirstCall(new Date(data.firstCallAt));
    setSecondCall(data.secondCallAt ? new Date(data.secondCallAt) : null);
    setPlace(data.place);
    setLoaded(true);
  }

  if (!loaded) {
    return assembly.isError ? (
      <ErrorState message={t('errors.generic')} onRetry={() => assembly.refetch()} />
    ) : (
      <Skeleton variant="detail" />
    );
  }
  const current = assembly.data!;

  async function send() {
    try {
      await reschedule.mutateAsync({
        id,
        input: {
          firstCallAt: firstCall.toISOString(),
          secondCallAt: secondCall?.toISOString() ?? null,
          place: place.trim(),
          reason: reason.trim() || null,
          notifyMembers,
        },
      });
      router.back();
    } catch (failure) {
      const routed = routeServerError(failure, RESCHEDULE_SERVER_MAPPING, isRescheduleField);
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  function submit() {
    setError(null);
    if (!form.validateAll()) return;
    confirmAction({
      title: t('assemblies.reschedule.confirmTitle'),
      message: t(
        notifyMembers
          ? 'assemblies.reschedule.confirmMessageNotify'
          : 'assemblies.reschedule.confirmMessage',
      ),
      confirmLabel: t('common.actions.confirm'),
      cancelLabel: t('common.actions.cancel'),
      onConfirm: send,
    });
  }

  return (
    <Screen testID="reschedule-screen" form={form}>
      <Stack.Screen options={{ title: t('assemblies.reschedule.title') }} />
      <Text variant="titleSmall">
        {t('assemblies.reschedule.current', {
          date: formatDateTime(current.firstCallAt),
          place: current.place,
        })}
      </Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        {t('assemblies.reschedule.noticeHint')}
      </Text>
      <DateField
        label={t('assemblies.editor.firstCall')}
        mode="datetime"
        name="firstCall"
        value={firstCall}
        onChange={(date) => {
          if (!date) return;
          // The second call keeps its distance from the first (usually half an hour).
          const gap = secondCall ? secondCall.getTime() - firstCall.getTime() : 0;
          if (secondCall && gap > 0) setSecondCall(new Date(date.getTime() + gap));
          setFirstCall(date);
        }}
        minimumDate={new Date()}
        testID="first-call-field"
      />
      <DateField
        label={t('assemblies.editor.secondCall')}
        mode="datetime"
        name="secondCall"
        value={secondCall}
        onChange={setSecondCall}
        minimumDate={firstCall}
        optional
        suggested={() => new Date(firstCall.getTime() + HALF_AN_HOUR)}
        testID="second-call-field"
      />
      <TextField
        label={t('assemblies.editor.place')}
        name="place"
        value={place}
        onChangeText={setPlace}
        maxLength={200}
        testID="place-field"
      />
      <TextField
        label={t('assemblies.reschedule.reason')}
        name="reason"
        value={reason}
        onChangeText={setReason}
        maxLength={REASON_MAX_LENGTH}
        multiline
        testID="reason-field"
      />
      <SwitchRow
        label={t('assemblies.reschedule.notifyMembers')}
        value={notifyMembers}
        onValueChange={setNotifyMembers}
        testID="notify-members"
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      <FormSummary form={form} />
      <Button
        title={t('assemblies.reschedule.submit')}
        onPress={submit}
        loading={reschedule.isPending}
        testID="reschedule-submit"
      />
    </Screen>
  );
}
