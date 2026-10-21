import type { AssemblyDetail, VotingView } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { ASSEMBLY_STATUS_TONE, participation } from '@/features/assemblies/agenda';
import {
  useAddPointDocument,
  useAssembly,
  useAssemblyAction,
  useVotingControl,
} from '@/features/assemblies/queries';
import { pickPdf } from '@/features/shared/pdf-upload';
import { formatDateTime, formatSize } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { useBrandColor } from '@/branding/brand';
import { colors } from '@/ui/theme';
import { openUrl } from '@/ui/open-url';
import { confirmAction } from '@/ui/confirm';

type Point = AssemblyDetail['points'][number];

/** US-ASM-03 (agenda), US-ASM-04 (control), US-ASM-06 (results). */
export default function AssemblyScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('assemblies');
  const assembly = useAssembly(id);
  const action = useAssemblyAction();
  const [error, setError] = useState<string | null>(null);

  if (assembly.isPending) return <Loading />;
  if (assembly.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(assembly.error)}</ErrorText>
      </Screen>
    );
  }
  const data = assembly.data;
  const canReschedule =
    canManage &&
    data.status === 'convened' &&
    data.points.every((point) => !point.voting || point.voting.status === 'pending');
  const moved = data.rescheduledFrom;

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  const confirm = (title: string, message: string, onConfirm: () => void) =>
    confirmAction({
      title,
      message,
      confirmLabel: t('common.actions.confirm'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm,
    });

  return (
    <Screen testID="assembly-screen">
      <Stack.Screen
        options={{
          title: t('assemblies.detail.title'),
          // US-ASM-09: only while no voting was opened (the server enforces it too).
          headerRight: canReschedule
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    icon="calendar-month-outline"
                    label={t('assemblies.detail.reschedule')}
                    href={{ pathname: '/assemblies/reschedule', params: { id } }}
                    testID="reschedule-assembly"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <Badge
        label={t(`enums.assemblyStatus.${data.status}`)}
        tone={ASSEMBLY_STATUS_TONE[data.status]}
      />
      <Text style={styles.title}>{t(`enums.assemblyType.${data.type}`)}</Text>
      <Text style={styles.meta}>
        {t('assemblies.detail.firstCall', { date: formatDateTime(data.firstCallAt) })}
      </Text>
      {data.secondCallAt && (
        <Text style={styles.meta}>
          {t('assemblies.detail.secondCall', { date: formatDateTime(data.secondCallAt) })}
        </Text>
      )}
      <Text style={styles.meta}>{data.place}</Text>
      {moved && (
        <View style={styles.note} testID="rescheduled-note">
          <Text style={styles.noteTitle}>
            {t('assemblies.detail.rescheduledNote', {
              at: formatDateTime(moved.at),
              date: formatDateTime(moved.firstCallAt),
            })}
          </Text>
          {moved.place !== data.place && (
            <Text style={styles.meta}>
              {t('assemblies.detail.rescheduledPlace', { place: moved.place })}
            </Text>
          )}
          {moved.reason && (
            <Text style={styles.meta}>
              {t('assemblies.detail.rescheduledReason', { reason: moved.reason })}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.section}>{t('assemblies.agenda')}</Text>
      {data.points.map((point) => (
        <PointCard
          key={point.id}
          point={point}
          assemblyStatus={data.status}
          canManage={canManage}
          onError={setError}
          onOpenAttachment={async (attachmentId) => {
            // Fresh 5-minute links right before opening.
            const fresh = await assembly.refetch();
            const url = fresh.data?.points
              .flatMap((p) => p.attachments)
              .find((a) => a.id === attachmentId)?.url;
            if (url) await openUrl(url);
          }}
        />
      ))}

      {error && <ErrorText>{error}</ErrorText>}

      {canManage && (
        <View style={styles.actions}>
          {data.status === 'draft' && (
            <>
              <Button
                title={t('assemblies.detail.editConvocation')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/assemblies/editor', params: { id } })}
                testID="edit-assembly"
              />
              <Button
                title={t('assemblies.detail.convene')}
                loading={action.isPending}
                onPress={() =>
                  confirm(
                    t('assemblies.detail.conveneTitle'),
                    t('assemblies.detail.conveneMessage'),
                    () => run(() => action.mutateAsync({ id, action: 'convene' })),
                  )
                }
                testID="convene-assembly"
              />
            </>
          )}
          {data.status === 'convened' && (
            <>
              <Button
                title={t('assemblies.detail.closeAssembly')}
                variant="secondary"
                onPress={() =>
                  confirm(
                    t('assemblies.detail.closeTitle'),
                    t('assemblies.detail.closeMessage'),
                    () => run(() => action.mutateAsync({ id, action: 'close' })),
                  )
                }
              />
              <Button
                title={t('assemblies.detail.cancelAssembly')}
                variant="danger"
                onPress={() =>
                  confirm(
                    t('assemblies.detail.cancelTitle'),
                    t('assemblies.detail.cancelMessage'),
                    () => run(() => action.mutateAsync({ id, action: 'cancel' })),
                  )
                }
              />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function PointCard({
  point,
  assemblyStatus,
  canManage,
  onError,
  onOpenAttachment,
}: {
  point: Point;
  assemblyStatus: AssemblyDetail['status'];
  canManage: boolean;
  onError(message: string | null): void;
  onOpenAttachment(attachmentId: string): Promise<void>;
}) {
  const brand = useBrandColor();
  const { t } = useTranslation();
  const control = useVotingControl();
  const addDocument = useAddPointDocument();
  const canEditDocs = canManage && (assemblyStatus === 'draft' || assemblyStatus === 'convened');

  async function run(task: () => Promise<unknown>) {
    onError(null);
    try {
      await task();
    } catch (failure) {
      onError(messageFor(failure));
    }
  }

  return (
    <View style={styles.point} testID={`point-${point.position}`}>
      <Text style={styles.pointTitle}>
        {point.position}. {point.title}
      </Text>
      {point.description ? <Text style={styles.body}>{point.description}</Text> : null}
      {point.votable && (
        <Text style={styles.meta}>
          {t('assemblies.detail.votedByMajority', {
            majority: t(
              point.majority === 'reinforced'
                ? 'assemblies.detail.majorityReinforced'
                : 'assemblies.detail.majoritySimple',
            ),
          })}
        </Text>
      )}

      {point.attachments.map((attachment) => (
        <Pressable
          key={attachment.id}
          accessibilityRole="button"
          onPress={() => run(() => onOpenAttachment(attachment.id))}
          style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
        >
          <Text style={[styles.attachmentName, { color: brand }]}>{attachment.name}</Text>
          <Text style={styles.meta}>{formatSize(attachment.size)}</Text>
        </Pressable>
      ))}
      {canEditDocs && (
        <Button
          title={t('assemblies.detail.addDocumentation')}
          variant="secondary"
          loading={addDocument.isPending}
          onPress={() =>
            run(async () => {
              const pdf = await pickPdf();
              if (pdf) await addDocument.mutateAsync({ pointId: point.id, pdf });
            })
          }
        />
      )}

      {point.voting && <VotingBlock pointId={point.id} voting={point.voting} />}

      {canManage && point.voting && assemblyStatus === 'convened' && (
        <>
          {point.voting.status === 'pending' && (
            <Button
              title={t('assemblies.detail.openVoting')}
              loading={control.isPending}
              onPress={() => run(() => control.mutateAsync({ pointId: point.id, action: 'open' }))}
              testID={`open-voting-${point.position}`}
            />
          )}
          {point.voting.status === 'open' && (
            <Button
              title={t('assemblies.detail.closeVoting')}
              variant="secondary"
              loading={control.isPending}
              onPress={() =>
                confirmAction({
                  title: t('assemblies.detail.closeVotingTitle'),
                  message: t('assemblies.detail.closeVotingMessage'),
                  confirmLabel: t('common.actions.close'),
                  cancelLabel: t('common.actions.cancel'),
                  destructive: true,
                  onConfirm: () =>
                    run(() => control.mutateAsync({ pointId: point.id, action: 'close' })),
                })
              }
              testID={`close-voting-${point.position}`}
            />
          )}
        </>
      )}
    </View>
  );
}

function VotingBlock({ pointId, voting }: { pointId: string; voting: VotingView }) {
  const brand = useBrandColor();
  const { t } = useTranslation();
  if (voting.status === 'pending') {
    return <Badge label={t('enums.votingStatus.pending')} />;
  }
  return (
    <View style={styles.voting}>
      <View style={styles.row}>
        <Badge
          label={t(`enums.votingStatus.${voting.status}`)}
          tone={voting.status === 'open' ? 'warning' : 'neutral'}
        />
        {voting.result && (
          <Badge
            label={t(`enums.votingOutcome.${voting.result.outcome}`)}
            tone={voting.result.outcome === 'approved' ? 'info' : 'danger'}
          />
        )}
      </View>
      <Text style={styles.meta}>
        {t('assemblies.detail.participation', {
          value: participation(voting.votesCast, voting.censusSize),
        })}
      </Text>
      {/* BR-ASM-11: the server hides the tally while open without the manage level. */}
      {voting.tally && (
        <Text style={styles.tally} testID="tally">
          {t('assemblies.detail.tally', {
            inFavor: voting.tally.inFavor,
            against: voting.tally.against,
            abstentions: voting.tally.abstentions,
          })}
        </Text>
      )}
      {voting.result && (
        <Text style={styles.meta}>
          {t(
            voting.result.quorumReached
              ? 'assemblies.detail.quorumReached'
              : 'assemblies.detail.quorumMissed',
            { call: t(`enums.call.${voting.result.call}`) },
          )}
        </Text>
      )}
      {voting.myVote && (
        <Text style={[styles.myVote, { color: brand }]}>
          {t('assemblies.detail.myVote', { choice: t(`enums.voteChoice.${voting.myVote}`) })}
        </Text>
      )}
      {voting.canVote && (
        <Button
          title={t('assemblies.detail.vote')}
          onPress={() => router.push({ pathname: '/assemblies/vote', params: { pointId } })}
          testID="go-to-vote"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  section: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 8 },
  point: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  pointTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  attachment: { backgroundColor: '#fff', borderRadius: 8, padding: 10, gap: 2 },
  attachmentName: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  voting: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', gap: 6 },
  tally: { fontSize: 14, color: colors.text },
  myVote: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  actions: { gap: 10, marginTop: 8 },
  note: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 4 },
  noteTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
});
