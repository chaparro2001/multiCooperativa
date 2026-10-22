import type { AssemblySummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { messageFor } from '@/api/api-error';
import { ASSEMBLY_STATUS_TONE } from '@/features/assemblies/agenda';
import { useAssemblyList } from '@/features/assemblies/queries';
import { formatDateTime } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { ListRow } from '@/ui/list-row';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-ASM-03: upcoming first, then the celebrated ones (ordered by the server). */
export default function AssemblyListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('assemblies');
  const list = useAssemblyList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const renderItem = useCallback(
    ({ item }: { item: AssemblySummary }) => <AssemblyRow item={item} />,
    [],
  );
  const keyExtractor = useCallback((item: AssemblySummary) => item.id, []);

  if (list.isPending) return <Skeleton variant="list" />;
  if (list.isError) {
    return <ErrorState message={messageFor(list.error)} onRetry={() => list.refetch()} />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/assemblies/editor"
                    icon="plus"
                    label={t('assemblies.list.new')}
                    testID="new-assembly"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <FlatList
        testID="assembly-list"
        data={list.data.items}
        keyExtractor={keyExtractor}
        contentContainerStyle={list.data.items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <EmptyState icon="hand-back-left-outline" message={t('assemblies.list.empty')} />
        }
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

const AssemblyRow = memo(function AssemblyRow({ item }: { item: AssemblySummary }) {
  const { t } = useTranslation();
  const open = useCallback(() => router.push(`/assemblies/${item.id}`), [item.id]);
  const meta = [
    formatDateTime(item.firstCallAt),
    item.place,
    t('assemblies.list.pointCount', { count: item.pointCount }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={t(`enums.assemblyType.${item.type}`)}
      meta={meta}
      status={
        <Badge
          label={t(`enums.assemblyStatus.${item.status}`)}
          tone={ASSEMBLY_STATUS_TONE[item.status]}
        />
      }
      badges={
        item.openVotings > 0 ? (
          <Badge
            label={t('assemblies.list.openVotings', { count: item.openVotings })}
            tone="warning"
            quiet
          />
        ) : undefined
      }
      onPress={open}
      testID={`assembly-${item.id}`}
    />
  );
});

const styles = StyleSheet.create({
  list: { padding: space[4], gap: space[3] },
  center: { flexGrow: 1, justifyContent: 'center' },
});
