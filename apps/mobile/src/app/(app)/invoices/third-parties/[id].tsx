import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { Fact, InvoiceRow, NoteRow } from '@/features/invoicing/components';
import { useThirdPartySheet, useUpdateThirdParty } from '@/features/invoicing/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Money } from '@/ui/money';
import { ErrorState, Skeleton } from '@/ui/states';
import { ErrorText, Screen } from '@/ui/screen';
import { SectionTitle } from '@/ui/section-title';
import { Text, useTheme } from '@/ui/paper';
import { space } from '@/ui/theme';

/** US-INV-06: record of a third party with its documents and outstanding balance. BR-INV-14: it is deactivated, not deleted. */
export default function ThirdPartyScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('invoicing');
  const sheet = useThirdPartySheet(id);
  const update = useUpdateThirdParty();
  const [error, setError] = useState<string | null>(null);

  if (sheet.isPending) {
    return (
      <Screen>
        <Skeleton variant="detail" />
      </Screen>
    );
  }
  if (sheet.isError) {
    return (
      <Screen>
        <ErrorState message={messageFor(sheet.error)} onRetry={() => sheet.refetch()} />
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
      <Text variant="headlineSmall">{party.name}</Text>
      <View style={styles.badges}>
        {party.isSupplier && <Badge label={t('invoicing.thirdParties.supplier')} tone="info" />}
        {party.isCustomer && <Badge label={t('invoicing.thirdParties.customer')} tone="info" />}
        {!party.active && <Badge label={t('invoicing.thirdParties.inactive')} tone="danger" />}
      </View>
      <Card style={styles.block}>
        <Fact label={t('invoicing.thirdParties.nif')}>{party.nif}</Fact>
        {party.email ? <Fact label={t('invoicing.thirdParties.email')}>{party.email}</Fact> : null}
        {party.phone ? <Fact label={t('invoicing.thirdParties.phone')}>{party.phone}</Fact> : null}
      </Card>

      <View style={styles.block} testID="balance">
        <SectionTitle>{t('invoicing.thirdParties.balance')}</SectionTitle>
        {party.isSupplier && (
          <Fact label={t('invoicing.summary.toPay')}>
            <Money amount={party.balance.toPay.pending} variant="bodyMedium" />
          </Fact>
        )}
        {party.isCustomer && (
          <Fact label={t('invoicing.summary.toCollect')}>
            <Money amount={party.balance.toCollect.pending} variant="bodyMedium" />
          </Fact>
        )}
      </View>

      <SectionTitle>{t('invoicing.home.invoices')}</SectionTitle>
      {party.invoices.length === 0 && (
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('invoicing.home.noInvoices')}
        </Text>
      )}
      {party.invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
      <SectionTitle>{t('invoicing.home.notes')}</SectionTitle>
      {party.deliveryNotes.length === 0 && (
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('invoicing.home.noNotes')}
        </Text>
      )}
      {party.deliveryNotes.map((note) => (
        <NoteRow key={note.id} note={note} />
      ))}

      {error ? <ErrorText>{error}</ErrorText> : null}
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  block: { gap: space[2] },
});
