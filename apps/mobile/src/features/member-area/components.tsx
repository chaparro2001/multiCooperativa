import type { CapitalMovement, MemberRecord } from '@multicooperativa/contracts';
import { memo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, type ListRenderItem, StyleSheet, View } from 'react-native';

import { Fact, useEuros } from '@/features/invoicing/components';
import { formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { Card } from '@/ui/card';
import { HeroCard } from '@/ui/hero-card';
import { ListRow } from '@/ui/list-row';
import { Text, useTheme } from '@/ui/paper';
import { SCREEN_MAX_WIDTH, SCREEN_PADDING } from '@/ui/screen';
import { EmptyState, ListFooter } from '@/ui/states';
import { space } from '@/ui/theme';

import { capitalChange } from './capital';

const STATUS_TONE = {
  active: 'info',
  invited: 'warning',
  suspended: 'danger',
  removed: 'neutral',
} as const;

/** US-MEM-01: member number, joining date, profile and contact details. */
export function RecordCard({ member }: { member: MemberRecord }) {
  const { t } = useTranslation();
  return (
    <Card testID="member-record" style={styles.card}>
      <View style={styles.titleRow}>
        <Text variant="titleLarge" style={styles.name}>
          {member.name}
        </Text>
        <Badge
          label={t(`enums.membershipStatus.${member.status}`)}
          tone={STATUS_TONE[member.status]}
        />
      </View>
      {member.isPartner ? (
        <Fact label={t('memberArea.fields.partnerNumber')}>
          {member.partnerNumber ?? t('memberArea.fields.noPartnerNumber')}
        </Fact>
      ) : null}
      {member.isPartner ? (
        <Fact label={t('memberArea.fields.nif')}>{member.nif ?? t('memberArea.fields.noNif')}</Fact>
      ) : null}
      <Fact label={t('memberArea.fields.joinedAt')}>{formatDay(member.joinedAt)}</Fact>
      <Fact label={t('memberArea.fields.profile')}>{member.profileName}</Fact>
      <Fact label={t('memberArea.fields.email')}>{member.email}</Fact>
    </Card>
  );
}

/** The total share capital: the screen's one figure, brand fill (ADR-018). */
export function CapitalTotal({
  label,
  amount,
  testID = 'capital-total',
}: {
  label: string;
  amount: string;
  testID?: string;
}) {
  return <HeroCard label={label} amount={amount} amountTestID={testID} />;
}

/** US-MEM-02: date, type, concept and signed amount of one movement; a refund shows as money out. */
const MovementRow = memo(function MovementRow({ movement }: { movement: CapitalMovement }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const change = capitalChange(movement.type, movement.amount);
  return (
    <ListRow
      title={movement.concept}
      meta={`${formatDay(movement.date)} · ${t(`enums.capitalMovementType.${movement.type}`)}`}
      amount={change}
      accessibilityLabel={`${movement.concept}, ${t('memberArea.movements.amountLabel', { amount: euros(change) })}`}
      testID={`movement-${movement.id}`}
    />
  );
});

const keyOf = (movement: CapitalMovement) => movement.id;
const renderMovement: ListRenderItem<CapitalMovement> = ({ item }) => (
  <MovementRow movement={item} />
);
const Separator = () => <View style={styles.separator} />;

/**
 * Screen of a member's statement: the record and the capital above (`header`), the movements
 * below, a page at a time (`onEndReached` asks for the next one).
 */
export function MovementsScreen({
  header,
  movements,
  onEndReached,
  loadingMore,
  testID,
}: {
  header: ReactElement;
  movements: CapitalMovement[];
  onEndReached(): void;
  loadingMore: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <FlatList
      testID={testID}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.screen}
      data={movements}
      keyExtractor={keyOf}
      renderItem={renderMovement}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={<View style={styles.header}>{header}</View>}
      ListEmptyComponent={
        <EmptyState
          icon="account-cash-outline"
          message={t('memberArea.movements.empty')}
          testID="no-movements"
        />
      }
      ListFooterComponent={<ListFooter loading={loadingMore} />}
      onEndReachedThreshold={0.4}
      onEndReached={onEndReached}
    />
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[2],
  },
  name: { flexShrink: 1 },
  // Same readable column as the Screen component.
  screen: {
    padding: SCREEN_PADDING,
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: { gap: space[4], marginBottom: space[4] },
  separator: { height: space[2] },
});
