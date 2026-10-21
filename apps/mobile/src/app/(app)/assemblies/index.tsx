import type { AssemblySummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { ASSEMBLY_STATUS_TONE } from '@/features/assemblies/agenda';
import { useAssemblyList } from '@/features/assemblies/queries';
import { formatDateTime } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ASM-03: upcoming first, then the celebrated ones (ordered by the server). */
export default function AssemblyListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('assemblies');
  const list = useAssemblyList();
  const { colors } = useTheme();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const renderItem = useCallback(
    ({ item }: { item: AssemblySummary }) => <AssemblyRow item={item} />,
    [],
  );

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
        style={{ backgroundColor: colors.background }}
        data={list.data.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={list.data.items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
            {t('assemblies.list.empty')}
          </Text>
        }
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

const AssemblyRow = memo(function AssemblyRow({ item }: { item: AssemblySummary }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      onPress={() => router.push(`/assemblies/${item.id}`)}
      testID={`assembly-${item.id}`}
    >
      <Card.Content style={styles.content}>
        <Text variant="titleMedium">{t(`enums.assemblyType.${item.type}`)}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {formatDateTime(item.firstCallAt)} · {item.place}
        </Text>
        <View style={styles.meta}>
          <Badge
            label={t(`enums.assemblyStatus.${item.status}`)}
            tone={ASSEMBLY_STATUS_TONE[item.status]}
          />
          {item.openVotings > 0 ? (
            <Badge
              label={t('assemblies.list.openVotings', { count: item.openVotings })}
              tone="warning"
            />
          ) : null}
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {t('assemblies.list.pointCount', { count: item.pointCount })}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  content: { gap: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
