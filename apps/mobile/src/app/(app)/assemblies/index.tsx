import type { AssemblySummary } from '@multicooperativa/contracts';
import { Link, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { ASSEMBLY_STATUS_TONE } from '@/features/assemblies/agenda';
import { useAssemblyList } from '@/features/assemblies/queries';
import { formatDateTime } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-ASM-03: upcoming first, then the celebrated ones (ordered by the server). */
export default function AssemblyListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('assemblies');
  const list = useAssemblyList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);

  if (list.isPending) return <Loading />;
  if (list.isError) {
    return (
      <View style={styles.center}>
        <ErrorText>{messageFor(list.error)}</ErrorText>
        <Button title={t('common.actions.retry')} onPress={() => list.refetch()} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <Link href="/assemblies/editor" testID="new-assembly">
                  <Text style={styles.headerLink}>{t('assemblies.list.new')}</Text>
                </Link>
              )
            : undefined,
        }}
      />
      <FlatList
        testID="assembly-list"
        data={list.data.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={list.data.items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('assemblies.list.empty')}</Text>}
        renderItem={({ item }) => <AssemblyRow item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

function AssemblyRow({ item }: { item: AssemblySummary }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/assemblies/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`assembly-${item.id}`}
    >
      <Text style={styles.title}>{t(`enums.assemblyType.${item.type}`)}</Text>
      <Text style={styles.detail}>
        {formatDateTime(item.firstCallAt)} · {item.place}
      </Text>
      <View style={styles.meta}>
        <Badge
          label={t(`enums.assemblyStatus.${item.status}`)}
          tone={ASSEMBLY_STATUS_TONE[item.status]}
        />
        {item.openVotings > 0 && (
          <Badge
            label={t('assemblies.list.openVotings', { count: item.openVotings })}
            tone="warning"
          />
        )}
        <Text style={styles.detail}>
          {t('assemblies.list.pointCount', { count: item.pointCount })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { color: colors.muted, fontSize: 16 },
  headerLink: { color: colors.primary, fontSize: 16 },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: colors.muted },
});
