import type { CapitalMovement, MemberRecord } from '@multicooperativa/contracts';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useEuros } from '@/features/invoicing/components';
import { Fact } from '@/features/invoicing/components';
import { formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { colors } from '@/ui/theme';

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
    <View style={styles.card} testID="member-record">
      <View style={styles.titleRow}>
        <Text style={styles.name}>{member.name}</Text>
        <Badge
          label={t(`enums.membershipStatus.${member.status}`)}
          tone={STATUS_TONE[member.status]}
        />
      </View>
      <Fact label={t('memberArea.fields.partnerNumber')}>
        {member.partnerNumber ?? t('memberArea.fields.noPartnerNumber')}
      </Fact>
      <Fact label={t('memberArea.fields.joinedAt')}>{formatDay(member.joinedAt)}</Fact>
      <Fact label={t('memberArea.fields.profile')}>
        {member.profileName}
        {member.isPartner ? ` · ${t('common.partner')}` : ''}
      </Fact>
      <Fact label={t('memberArea.fields.email')}>{member.email}</Fact>
    </View>
  );
}

/** The total share capital, large. */
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
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalAmount} testID={testID}>
        {euros(amount)}
      </Text>
    </View>
  );
}

/** US-MEM-02: date, type, concept and amount of each movement; a refund shows as money out. */
export function MovementList({ movements }: { movements: CapitalMovement[] }) {
  const { t } = useTranslation();
  const euros = useEuros();
  if (movements.length === 0) {
    return (
      <Text style={styles.empty} testID="no-movements">
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
          <View key={movement.id} style={styles.row} testID={`movement-${movement.id}`}>
            <View style={styles.rowText}>
              <Text style={styles.concept}>{movement.concept}</Text>
              <Text style={styles.detail}>
                {formatDay(movement.date)} · {t(`enums.capitalMovementType.${movement.type}`)}
              </Text>
            </View>
            <Text
              style={[styles.amount, tone === 'danger' && styles.amountOut]}
              accessibilityLabel={t('memberArea.movements.amountLabel', { amount: euros(change) })}
            >
              {tone === 'info' ? '+' : ''}
              {euros(change)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export const memberAreaStyles = StyleSheet.create({
  section: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text, flexShrink: 1 },
  total: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, gap: 4 },
  totalLabel: { fontSize: 14, color: '#fff', opacity: 0.9 },
  totalAmount: { fontSize: 32, fontWeight: '700', color: '#fff' },
  empty: { color: colors.muted, fontSize: 15, paddingVertical: 8 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  rowText: { flexShrink: 1, gap: 2 },
  concept: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.muted },
  amount: { fontSize: 16, fontWeight: '600', color: colors.primary },
  amountOut: { color: colors.danger },
});
