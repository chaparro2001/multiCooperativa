import type { AssemblyDetail, VotingView } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  ASSEMBLY_STATUS as STATUS,
  ASSEMBLY_TYPE_LABEL as TYPE_LABEL,
  CHOICE_LABEL,
  OUTCOME_LABEL,
  participation,
} from '@/features/assemblies/agenda';
import {
  useAddPointDocument,
  useAssembly,
  useAssemblyAction,
  useVotingControl,
} from '@/features/assemblies/queries';
import { formatDateTime, formatSize } from '@/features/shared/format';
import { pickPdf } from '@/features/shared/pdf-upload';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

type Point = AssemblyDetail['points'][number];

/** HU-ASA-03 (agenda), HU-ASA-04 (control), HU-ASA-06 (results). */
export default function AssemblyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('asambleas');
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

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  const confirm = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
    ]);

  return (
    <Screen testID="pantalla-asamblea">
      <Stack.Screen options={{ title: 'Asamblea' }} />
      <Badge label={STATUS[data.status].label} tone={STATUS[data.status].tone} />
      <Text style={styles.title}>{TYPE_LABEL[data.type]}</Text>
      <Text style={styles.meta}>Primera convocatoria: {formatDateTime(data.firstCallAt)}</Text>
      {data.secondCallAt && (
        <Text style={styles.meta}>Segunda convocatoria: {formatDateTime(data.secondCallAt)}</Text>
      )}
      <Text style={styles.meta}>{data.place}</Text>

      <Text style={styles.section}>Orden del día</Text>
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
            if (url) await WebBrowser.openBrowserAsync(url);
          }}
        />
      ))}

      {error && <ErrorText>{error}</ErrorText>}

      {canManage && (
        <View style={styles.actions}>
          {data.status === 'borrador' && (
            <>
              <Button
                title="Editar convocatoria"
                variant="secondary"
                onPress={() => router.push({ pathname: '/asambleas/editor', params: { id } })}
                testID="editar-asamblea"
              />
              <Button
                title="Convocar"
                loading={action.isPending}
                onPress={() =>
                  confirm(
                    'Convocar asamblea',
                    'Será visible para todos los miembros y se les avisará.',
                    () => run(() => action.mutateAsync({ id, action: 'convocar' })),
                  )
                }
                testID="convocar-asamblea"
              />
            </>
          )}
          {data.status === 'convocada' && (
            <>
              <Button
                title="Cerrar asamblea (celebrada)"
                variant="secondary"
                onPress={() =>
                  confirm(
                    'Cerrar asamblea',
                    'Quedará como celebrada. Las votaciones deben estar cerradas.',
                    () => run(() => action.mutateAsync({ id, action: 'cerrar' })),
                  )
                }
              />
              <Button
                title="Cancelar asamblea"
                variant="danger"
                onPress={() =>
                  confirm('Cancelar asamblea', 'No se puede deshacer.', () =>
                    run(() => action.mutateAsync({ id, action: 'cancelar' })),
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
  const control = useVotingControl();
  const addDocument = useAddPointDocument();
  const canEditDocs =
    canManage && (assemblyStatus === 'borrador' || assemblyStatus === 'convocada');

  async function run(task: () => Promise<unknown>) {
    onError(null);
    try {
      await task();
    } catch (failure) {
      onError(messageFor(failure));
    }
  }

  return (
    <View style={styles.point} testID={`punto-${point.position}`}>
      <Text style={styles.pointTitle}>
        {point.position}. {point.title}
      </Text>
      {point.description ? <Text style={styles.body}>{point.description}</Text> : null}
      {point.votable && (
        <Text style={styles.meta}>
          Se vota por mayoría {point.majority === 'reforzada' ? 'reforzada (2/3)' : 'simple'}
        </Text>
      )}

      {point.attachments.map((attachment) => (
        <Pressable
          key={attachment.id}
          accessibilityRole="button"
          onPress={() => run(() => onOpenAttachment(attachment.id))}
          style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
        >
          <Text style={styles.attachmentName}>{attachment.name}</Text>
          <Text style={styles.meta}>{formatSize(attachment.size)}</Text>
        </Pressable>
      ))}
      {canEditDocs && (
        <Button
          title="Añadir documentación"
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

      {canManage && point.voting && assemblyStatus === 'convocada' && (
        <>
          {point.voting.status === 'pendiente' && (
            <Button
              title="Abrir votación"
              loading={control.isPending}
              onPress={() => run(() => control.mutateAsync({ pointId: point.id, action: 'abrir' }))}
              testID={`abrir-votacion-${point.position}`}
            />
          )}
          {point.voting.status === 'abierta' && (
            <Button
              title="Cerrar votación"
              variant="secondary"
              loading={control.isPending}
              onPress={() =>
                Alert.alert(
                  'Cerrar votación',
                  'Se calculará el resultado y no se admitirán más votos.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Cerrar',
                      style: 'destructive',
                      onPress: () =>
                        run(() => control.mutateAsync({ pointId: point.id, action: 'cerrar' })),
                    },
                  ],
                )
              }
              testID={`cerrar-votacion-${point.position}`}
            />
          )}
        </>
      )}
    </View>
  );
}

function VotingBlock({ pointId, voting }: { pointId: string; voting: VotingView }) {
  if (voting.status === 'pendiente') {
    return <Badge label="Votación pendiente de abrir" />;
  }
  return (
    <View style={styles.voting}>
      <View style={styles.row}>
        <Badge
          label={voting.status === 'abierta' ? 'Votación abierta' : 'Votación cerrada'}
          tone={voting.status === 'abierta' ? 'warning' : 'neutral'}
        />
        {voting.result && (
          <Badge
            label={OUTCOME_LABEL[voting.result.outcome]}
            tone={voting.result.outcome === 'aprobado' ? 'info' : 'danger'}
          />
        )}
      </View>
      <Text style={styles.meta}>
        Participación: {participation(voting.votesCast, voting.censusSize)}
      </Text>
      {/* RN-ASA-11: the server hides the tally while open without «gestión». */}
      {voting.tally && (
        <Text style={styles.tally} testID="recuento">
          A favor {voting.tally.inFavor} · En contra {voting.tally.against} · Abstenciones{' '}
          {voting.tally.abstentions}
        </Text>
      )}
      {voting.result && (
        <Text style={styles.meta}>
          {voting.result.quorumReached ? 'Con quórum' : 'Sin quórum'} en{' '}
          {voting.result.call === 'primera' ? 'primera' : 'segunda'} convocatoria
        </Text>
      )}
      {voting.myVote && <Text style={styles.myVote}>Tu voto: {CHOICE_LABEL[voting.myVote]}</Text>}
      {voting.canVote && (
        <Button
          title="Votar"
          onPress={() => router.push({ pathname: '/asambleas/votar', params: { pointId } })}
          testID="ir-a-votar"
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
});
