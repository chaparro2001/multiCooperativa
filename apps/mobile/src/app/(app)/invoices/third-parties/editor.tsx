import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  useCreateThirdParty,
  useThirdPartySheet,
  useUpdateThirdParty,
} from '@/features/invoicing/queries';
import { Chip } from '@/ui/chip';
import {
  THIRD_PARTY_FIELDS,
  THIRD_PARTY_SERVER_MAPPING,
  validateThirdParty,
} from '@/features/invoicing/third-party-validation';
import { ActionBar } from '@/ui/action-bar';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { FieldGroup, FormSummary } from '@/ui/field';
import { ErrorText, Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { TextField } from '@/ui/text-field';
import { Text } from '@/ui/paper';

/** US-INV-01: create (the tax ID is validated by the server, NFR-INV-06) or edit a third party. */
export default function ThirdPartyEditorScreen() {
  const { id, type } = useLocalSearchParams<{ id?: string; type?: string }>();
  const role = type === 'supplier' || type === 'customer' ? type : null;
  return id ? <Editor id={id} /> : <Form role={role} />;
}

function Editor({ id }: { id: string }) {
  const sheet = useThirdPartySheet(id);
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
  return <Form existing={{ ...sheet.data }} />;
}

function Form({
  existing,
  role = null,
}: {
  /** New record opened from the Suppliers or Customers list: the role is fixed to that one. */
  role?: 'supplier' | 'customer' | null;
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
  // A new record opened from the Customers list is a customer; otherwise it starts as a supplier.
  const [isSupplier, setSupplier] = useState(existing?.isSupplier ?? role !== 'customer');
  const [isCustomer, setCustomer] = useState(existing?.isCustomer ?? role === 'customer');
  // With a fixed role there is nothing to choose; editing later can still add the other one.
  const showRoles = existing !== undefined || role === null;
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const form = useForm({
    values: {
      nif,
      name,
      isSupplier,
      isCustomer,
      roles: `${isSupplier}-${isCustomer}`,
      email,
      phone,
    },
    validate: (values) => validateThirdParty(values, !existing),
  });

  // Editing any of these clears the last error (adjusting state during render, not in an effect).
  const errorScope = JSON.stringify([nif, name, isSupplier, isCustomer]);
  const [shownScope, setShownScope] = useState(errorScope);
  if (shownScope !== errorScope) {
    setShownScope(errorScope);
    setError(null);
  }

  async function submit() {
    setError(null);
    setDuplicate(null);
    if (!form.validateAll()) return;
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
      // An invalid or duplicate NIF is marked on the NIF field, the rest on theirs.
      const routed = routeServerError(failure, THIRD_PARTY_SERVER_MAPPING, (field) =>
        (THIRD_PARTY_FIELDS as readonly string[]).includes(field),
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  return (
    <Screen
      testID="third-party-editor"
      form={form}
      footer={
        <ActionBar>
          <FormSummary form={form} />
          <Button
            title={t('common.actions.save')}
            block
            onPress={submit}
            loading={create.isPending || update.isPending}
            testID="save-third-party"
          />
        </ActionBar>
      }
    >
      {!existing && role ? (
        <Stack.Screen
          options={{
            title: t(
              role === 'supplier'
                ? 'invoicing.thirdParties.newSupplier'
                : 'invoicing.thirdParties.newCustomer',
            ),
          }}
        />
      ) : null}
      <TextField
        label={t('invoicing.thirdParties.nif')}
        name="nif"
        value={nif}
        onChangeText={setNif}
        autoCapitalize="characters"
        editable={!existing}
        maxLength={20}
        testID="third-party-nif"
      />
      <TextField
        label={t('invoicing.thirdParties.name')}
        name="name"
        value={name}
        onChangeText={setName}
        maxLength={200}
        testID="third-party-name"
      />
      {showRoles ? (
        <>
          <Text variant="labelLarge">{t('invoicing.thirdParties.roles')}</Text>
          <FieldGroup name="roles" style={styles.chips}>
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
          </FieldGroup>
        </>
      ) : null}
      <TextField
        label={t('invoicing.thirdParties.email')}
        name="email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="third-party-email"
      />
      <TextField
        label={t('invoicing.thirdParties.phone')}
        name="phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        testID="third-party-phone"
      />
      {error && !duplicate ? <ErrorText>{error}</ErrorText> : null}
      {duplicate ? (
        <Banner
          action={
            <Button
              title={t('invoicing.thirdParties.openExisting')}
              variant="text"
              onPress={() => router.replace(`/invoices/third-parties/${duplicate}`)}
            />
          }
        >
          {error ?? t('invoicing.thirdParties.openExisting')}
        </Banner>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
