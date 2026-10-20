import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import {
  useCreateThirdParty,
  useThirdPartySheet,
  useUpdateThirdParty,
} from '@/features/invoicing/queries';
import { Chip } from '@/features/invoicing/segmented';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** US-INV-01: create (the tax ID is validated by the server, NFR-INV-06) or edit a third party. */
export default function ThirdPartyEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Editor id={id} /> : <Form />;
}

function Editor({ id }: { id: string }) {
  const sheet = useThirdPartySheet(id);
  if (sheet.isPending) return <Loading />;
  if (sheet.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(sheet.error)}</ErrorText>
      </Screen>
    );
  }
  return <Form existing={{ ...sheet.data }} />;
}

function Form({
  existing,
}: {
  existing?: {
    id: string;
    nif: string;
    name: string;
    isSupplier: boolean;
    isCustomer: boolean;
    email: string | null;
    phone: string | null;
    active: boolean;
  };
}) {
  const { t } = useTranslation();
  const create = useCreateThirdParty();
  const update = useUpdateThirdParty();
  const [nif, setNif] = useState(existing?.nif ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [isSupplier, setSupplier] = useState(existing?.isSupplier ?? true);
  const [isCustomer, setCustomer] = useState(existing?.isCustomer ?? false);
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  useEffect(() => setError(null), [nif, name, isSupplier, isCustomer]);

  async function submit() {
    setError(null);
    setDuplicate(null);
    const common = {
      name: name.trim(),
      isSupplier,
      isCustomer,
      email: email.trim() || null,
      phone: phone.trim() || null,
    };
    try {
      if (existing)
        await update.mutateAsync({ id: existing.id, ...common, active: existing.active });
      else await create.mutateAsync({ nif: nif.trim(), ...common });
      router.back();
    } catch (failure) {
      // US-INV-01: with a tax ID already registered the existing one is offered.
      if (failure instanceof ApiError && failure.code === 'third_party_exists') {
        setDuplicate(String(failure.details.thirdPartyId ?? ''));
      }
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="third-party-editor">
      <TextField
        label={t('invoicing.thirdParties.nif')}
        value={nif}
        onChangeText={setNif}
        autoCapitalize="characters"
        editable={!existing}
        maxLength={20}
        testID="third-party-nif"
      />
      <TextField
        label={t('invoicing.thirdParties.name')}
        value={name}
        onChangeText={setName}
        maxLength={200}
        testID="third-party-name"
      />
      <Text style={styles.label}>{t('invoicing.thirdParties.roles')}</Text>
      <View style={styles.chips}>
        <Chip
          label={t('invoicing.thirdParties.supplier')}
          selected={isSupplier}
          onPress={() => setSupplier(!isSupplier)}
          testID="role-supplier"
        />
        <Chip
          label={t('invoicing.thirdParties.customer')}
          selected={isCustomer}
          onPress={() => setCustomer(!isCustomer)}
          testID="role-customer"
        />
      </View>
      <TextField
        label={t('invoicing.thirdParties.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="third-party-email"
      />
      <TextField
        label={t('invoicing.thirdParties.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        testID="third-party-phone"
      />
      {error && <ErrorText>{error}</ErrorText>}
      {duplicate ? (
        <Button
          title={t('invoicing.thirdParties.openExisting')}
          variant="secondary"
          onPress={() => router.replace(`/invoices/third-parties/${duplicate}`)}
        />
      ) : null}
      <Button
        title={t('common.actions.save')}
        onPress={submit}
        loading={create.isPending || update.isPending}
        disabled={!name.trim() || (!existing && !nif.trim()) || (!isSupplier && !isCustomer)}
        testID="save-third-party"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
