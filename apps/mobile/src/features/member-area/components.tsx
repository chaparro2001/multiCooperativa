import type { CapitalMovement, MemberRecord } from '@multicooperativa/contracts';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useEuros } from '@/features/invoicing/components';
import { Fact } from '@/features/invoicing/components';
import { formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { Card, Text, useTheme } from '@/ui/paper';
import { colors as fixed } from '@/ui/theme';

import { capitalChange, changeTone } from './capital';

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
    <Card mode="contained" testID="member-record">
      <Card.Content style={styles.card}>
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
        <Fact label={t('memberArea.fields.joinedAt')}>{formatDay(member.joinedAt)}</Fact>
        <Fact label={t('memberArea.fields.profile')}>{member.profileName}</Fact>
        <Fact label={t('memberArea.fields.email')}>{member.email}</Fact>
      </Card.Content>
    </Card>
  );
}

/** The total share capital, large; keeps the brand colour (theme primary, ADR-018). */
export function CapitalTotal({
  label,
  amount,
  testID = 'capital-total',
}: {
  label: string;
  amount: string;
  testID?: string;
}) {
  const euros = useEuros();
  const { colors } = useTheme();
  return (
    <Card mode="contained" style={{ backgroundColor: colors.primary }}>
      <Card.Content style={styles.total}>
        <Text variant="bodyMedium" style={[styles.totalLabel, { color: colors.onPrimary }]}>
          {label}
        </Text>
        <Text variant="displaySmall" style={{ color: colors.onPrimary }} testID={testID}>
          {euros(amount)}
        </Text>
      </Card.Content>
    </Card>
  );
}

/** US-MEM-02: date, type, concept and amount of each movement; a refund shows as money out. */
export function MovementList({ movements }: { movements: CapitalMovement[] }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const { colors } = useTheme();
  if (movements.length === 0) {
    return (
      <Text
        variant="bodyLarge"
        style={[styles.empty, { color: colors.onSurfaceVariant }]}
        testID="no-movements"
      >
        {t('memberArea.movements.empty')}
      </Text>
    );
  }
  return (
    <View style={styles.list} testID="movement-list">
      {movements.map((movement) => {
        const change = capitalChange(movement.type, movement.amount);
        const tone = changeTone(change);
        return (
          <Card key={movement.id} mode="contained" testID={`movement-${movement.id}`}>
            <Card.Content style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="titleMedium">{movement.concept}</Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                  {formatDay(movement.date)} · {t(`enums.capitalMovementType.${movement.type}`)}
                </Text>
              </View>
              <Text
                variant="titleMedium"
                style={[
                  styles.amount,
                  { color: tone === 'danger' ? fixed.danger : colors.primary },
                ]}
                accessibilityLabel={t('memberArea.movements.amountLabel', {
                  amount: euros(change),
                })}
              >
                {tone === 'info' ? '+' : ''}
                {euros(change)}
              </Text>
            </Card.Content>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
  total: { gap: 4 },
  totalLabel: { opacity: 0.9 },
  empty: { paddingVertical: 8 },
  list: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  // Never wraps: "-100,00 €" split over two lines reads as two numbers.
  amount: { flexShrink: 0 },
});
