import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { Fact, InvoiceRow, NoteRow, useEuros } from '@/features/invoicing/components';
import { useThirdPartySheet, useUpdateThirdParty } from '@/features/invoicing/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** US-INV-06: record of a third party with its documents and outstanding balance. BR-INV-14: it is deactivated, not deleted. */
export default function ThirdPartyScreen() {
  const { t } = useTranslation();
  const euros = useEuros();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('invoicing');
  const sheet = useThirdPartySheet(id);
  const update = useUpdateThirdParty();
  const [error, setError] = useState<string | null>(null);

  if (sheet.isPending) return <Loading />;
  if (sheet.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(sheet.error)}</ErrorText>
      </Screen>
    );
  }
  const party = sheet.data;

  async function toggleActive() {
    setError(null);
    try {
      await update.mutateAsync({
        id,
        name: party.name,
        isSupplier: party.isSupplier,
        isCustomer: party.isCustomer,
        email: party.email,
        phone: party.phone,
        active: !party.active,
      });
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="third-party-screen">
      <Stack.Screen options={{ title: party.name }} />
      <Text style={styles.title}>{party.name}</Text>
      <View style={styles.badges}>
        {party.isSupplier && <Badge label={t('invoicing.thirdParties.supplier')} tone="info" />}
        {party.isCustomer && <Badge label={t('invoicing.thirdParties.customer')} tone="info" />}
        {!party.active && <Badge label={t('invoicing.thirdParties.inactive')} tone="danger" />}
      </View>
      <View style={styles.block}>
        <Fact label={t('invoicing.thirdParties.nif')}>{party.nif}</Fact>
        {party.email && <Fact label={t('invoicing.thirdParties.email')}>{party.email}</Fact>}
        {party.phone && <Fact label={t('invoicing.thirdParties.phone')}>{party.phone}</Fact>}
      </View>

      <View style={styles.block} testID="balance">
        <Text style={styles.sectionTitle}>{t('invoicing.thirdParties.balance')}</Text>
        {party.isSupplier && (
          <Fact label={t('invoicing.summary.toPay')}>{euros(party.balance.toPay.pending)}</Fact>
        )}
        {party.isCustomer && (
          <Fact label={t('invoicing.summary.toCollect')}>
            {euros(party.balance.toCollect.pending)}
          </Fact>
        )}
      </View>

      <Text style={styles.sectionTitle}>{t('invoicing.home.invoices')}</Text>
      {party.invoices.length === 0 && (
        <Text style={styles.detail}>{t('invoicing.home.noInvoices')}</Text>
      )}
      {party.invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
      <Text style={styles.sectionTitle}>{t('invoicing.home.notes')}</Text>
      {party.deliveryNotes.length === 0 && (
        <Text style={styles.detail}>{t('invoicing.home.noNotes')}</Text>
      )}
      {party.deliveryNotes.map((note) => (
        <NoteRow key={note.id} note={note} />
      ))}

      {error && <ErrorText>{error}</ErrorText>}
      {canManage && (
        <View style={styles.block}>
          <Button
            title={t('common.actions.edit')}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/invoices/third-parties/editor', params: { id } })
            }
            testID="edit-third-party"
          />
          <Button
            title={
              party.active
                ? t('invoicing.thirdParties.deactivate')
                : t('invoicing.thirdParties.reactivate')
            }
            variant={party.active ? 'danger' : 'secondary'}
            loading={update.isPending}
            onPress={toggleActive}
            testID="toggle-active"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  block: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  detail: { fontSize: 14, color: colors.muted },
});
