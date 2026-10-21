import type { ExtractionField, Operation } from '@multicooperativa/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import { computeTotal } from '@/features/invoicing/amounts';
import {
  buildDeliveryNoteInput,
  buildInvoiceInput,
  emptyDraft,
  type LineDraft,
  peekPendingDraft,
  type RegistrationDraft,
  setPendingDraft,
} from '@/features/invoicing/draft';
import {
  isRegistrationField,
  REGISTRATION_SERVER_MAPPING,
  validateRegistration,
} from '@/features/invoicing/form-validation';
import {
  useCreateThirdParty,
  useDeliveryNotes,
  useRegisterDeliveryNote,
  useRegisterInvoice,
  useThirdParties,
} from '@/features/invoicing/queries';
import { Chip, Segmented } from '@/features/invoicing/segmented';
import { formatDay } from '@/i18n/format';
import { Button } from '@/ui/button';
import { DayField } from '@/ui/date-field';
import { FieldGroup, FormSummary } from '@/ui/field';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { Card, Text, TouchableRipple, useTheme } from '@/ui/paper';
import { colors } from '@/ui/theme';

/**
 * US-INV-02, US-INV-03 and the review step of US-INV-05. Whether typed or proposed by the
 * model, nothing is saved until the person confirms here (BR-INV-11); the original scan is
 * attached to the record that gets created.
 */
export default function RegisterScreen() {
  const { colors: theme } = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    operation?: Operation;
    kind?: string;
    from?: string;
    noData?: string;
  }>();
  const [draft, setDraft] = useState<RegistrationDraft>(
    () =>
      (params.from === 'capture' ? peekPendingDraft() : null) ??
      emptyDraft(
        params.operation === 'sale' ? 'sale' : 'purchase',
        params.kind === 'delivery_note' ? 'delivery_note' : 'invoice',
      ),
  );
  const registerInvoice = useRegisterInvoice();
  const registerNote = useRegisterDeliveryNote();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ values: draft, validate: validateRegistration });

  const patch = (change: Partial<RegistrationDraft>) => setDraft((d) => ({ ...d, ...change }));
  const review = (field: ExtractionField) => draft.lowConfidence.includes(field);
  const mark = (label: string, field: ExtractionField) => (review(field) ? `${label} ⚠` : label);
  const isInvoice = draft.kind === 'invoice';

  async function submit() {
    setError(null);
    // Every wrong field is marked, the first one is scrolled to; nothing is sent.
    if (!form.validateAll()) return;
    try {
      if (isInvoice) {
        const record = buildInvoiceInput(draft);
        if (!record) return setError(t('invoicing.form.invalid'));
        const created = await registerInvoice.mutateAsync({ record, file: draft.scan });
        setPendingDraft(null);
        router.replace(`/invoices/invoice/${created.id}`);
      } else {
        const record = buildDeliveryNoteInput(draft);
        if (!record) return setError(t('invoicing.form.invalid'));
        const created = await registerNote.mutateAsync({ record, file: draft.scan });
        setPendingDraft(null);
        router.replace(`/invoices/delivery-note/${created.id}`);
      }
    } catch (failure) {
      // US-INV-03: a total that does not match says by how much, on the total field.
      const routed = routeServerError(failure, REGISTRATION_SERVER_MAPPING, isRegistrationField);
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  const suggestedTotal = computeTotal(draft.base, draft.vatRate);

  return (
    <Screen testID="register-screen" form={form}>
      {params.noData === '1' && (
        <Text variant="bodyMedium" style={styles.notice} testID="no-data">
          {t('invoicing.form.noData')}
        </Text>
      )}
      {draft.lowConfidence.length > 0 && (
        <Text variant="bodyMedium" style={styles.notice} testID="low-confidence">
          {t('invoicing.form.reviewFields')}
        </Text>
      )}

      <Segmented
        value={draft.kind}
        onChange={(kind) => patch({ kind })}
        options={(['invoice', 'delivery_note'] as const).map((value) => ({
          value,
          label: t(`invoicing.form.kind.${value}`),
        }))}
        testIDPrefix="kind"
      />
      <Segmented
        value={draft.operation}
        onChange={(operation) => patch({ operation, thirdPartyId: null, deliveryNoteIds: [] })}
        options={(['purchase', 'sale'] as const).map((value) => ({
          value,
          label: t(`enums.operation.${value}`),
        }))}
        testIDPrefix="form-operation"
      />

      <PartyPicker draft={draft} patch={patch} warn={review('thirdParty')} />

      <TextField
        label={mark(t('invoicing.form.number'), 'number')}
        name="number"
        value={draft.number}
        onChangeText={(number) => patch({ number })}
        autoCapitalize="characters"
        maxLength={50}
        testID="form-number"
      />
      <DayField
        label={mark(
          isInvoice ? t('invoicing.form.issueDate') : t('invoicing.form.noteDate'),
          'date',
        )}
        name="date"
        value={draft.date}
        onChange={(date) => patch({ date })}
        testID="form-date"
      />

      {isInvoice && (
        <>
          <DayField
            label={mark(t('invoicing.form.dueDate'), 'dueDate')}
            name="dueDate"
            value={draft.dueDate}
            onChange={(dueDate) => patch({ dueDate })}
            suggested={() => dueDateAfter(draft.date)}
            testID="form-due-date"
          />
          <TextField
            label={mark(t('invoicing.form.base'), 'base')}
            name="base"
            value={draft.base}
            onChangeText={(base) => patch({ base })}
            keyboardType="decimal-pad"
            testID="form-base"
          />
          <TextField
            label={mark(t('invoicing.form.vatRate'), 'vatRate')}
            name="vatRate"
            value={draft.vatRate}
            onChangeText={(vatRate) => patch({ vatRate })}
            keyboardType="decimal-pad"
            testID="form-vat"
          />
          <TextField
            label={mark(t('invoicing.form.total'), 'total')}
            name="total"
            value={draft.total}
            onChangeText={(total) => patch({ total })}
            placeholder={suggestedTotal ?? undefined}
            keyboardType="decimal-pad"
            testID="form-total"
          />
          {suggestedTotal && draft.total !== suggestedTotal ? (
            <TouchableRipple
              onPress={() => patch({ total: suggestedTotal })}
              accessibilityRole="button"
            >
              <Text variant="bodyMedium" style={{ color: theme.primary }}>
                {t('invoicing.form.useComputedTotal', { total: suggestedTotal })}
              </Text>
            </TouchableRipple>
          ) : null}
        </>
      )}

      <LinesEditor
        lines={draft.lines}
        onChange={(lines) => patch({ lines })}
        warn={review('lines')}
        required={!isInvoice || draft.deliveryNoteIds.length > 0}
      />

      {isInvoice && draft.thirdPartyId && (
        <NotesToGroup
          operation={draft.operation}
          thirdPartyId={draft.thirdPartyId}
          selected={draft.deliveryNoteIds}
          onChange={(deliveryNoteIds) => patch({ deliveryNoteIds })}
        />
      )}

      {draft.scan && (
        <View style={styles.scan}>
          <Text variant="bodyMedium" style={styles.scanText}>
            {t('invoicing.form.attached', { name: draft.scan.name })}
          </Text>
          <TouchableRipple onPress={() => patch({ scan: null })} accessibilityRole="button">
            <Text variant="bodyMedium" style={styles.remove}>
              {t('common.actions.remove')}
            </Text>
          </TouchableRipple>
        </View>
      )}

      {error ? <ErrorText>{error}</ErrorText> : null}
      <FormSummary form={form} />
      <Button
        title={t('invoicing.form.confirm')}
        onPress={submit}
        loading={registerInvoice.isPending || registerNote.isPending}
        testID="confirm-registration"
      />
    </Screen>
  );
}

function PartyPicker({
  draft,
  patch,
  warn,
}: {
  draft: RegistrationDraft;
  patch(change: Partial<RegistrationDraft>): void;
  warn: boolean;
}) {
  const { colors: theme } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const create = useCreateThirdParty();
  const [error, setError] = useState<string | null>(null);
  const parties = useThirdParties(draft.operation === 'purchase' ? 'supplier' : 'customer', search);
  const selected = parties.data?.items.find((p) => p.id === draft.thirdPartyId);

  async function createSuggested() {
    if (!draft.suggestedParty) return;
    setError(null);
    try {
      // The person chose to create it from what was read: a normal create call (BR-INV-11).
      const party = await create.mutateAsync({
        nif: draft.suggestedParty.nif,
        name: draft.suggestedParty.name || draft.suggestedParty.nif,
        isSupplier: draft.operation === 'purchase',
        isCustomer: draft.operation === 'sale',
        email: null,
        phone: null,
      });
      patch({ thirdPartyId: party.id, suggestedParty: null });
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <FieldGroup name="thirdPartyId" style={styles.group} testID="party-picker">
      <Text variant="labelLarge">
        {warn ? `${t('invoicing.form.thirdParty')} ⚠` : t('invoicing.form.thirdParty')}
      </Text>
      {draft.suggestedParty && !draft.thirdPartyId && (
        <Card mode="contained">
          <Card.Content style={styles.boxContent}>
            <Text variant="bodyMedium">
              {t('invoicing.form.unknownParty', {
                name: draft.suggestedParty.name,
                nif: draft.suggestedParty.nif,
              })}
            </Text>
            <Button
              title={t('invoicing.form.createParty')}
              variant="secondary"
              loading={create.isPending}
              onPress={createSuggested}
              testID="create-suggested-party"
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
          </Card.Content>
        </Card>
      )}
      <TextField
        label={t('invoicing.form.searchParty')}
        value={search}
        onChangeText={setSearch}
        testID="form-party-search"
      />
      <View style={styles.chips}>
        {(parties.data?.items ?? [])
          .filter((p) => p.active)
          .slice(0, 12)
          .map((party) => (
            <Chip
              key={party.id}
              label={party.name}
              selected={draft.thirdPartyId === party.id}
              onPress={() => patch({ thirdPartyId: party.id, deliveryNoteIds: [] })}
              testID={`party-${party.nif}`}
            />
          ))}
      </View>
      {selected ? (
        <Text variant="bodyMedium">
          {selected.name} · {selected.nif}
        </Text>
      ) : null}
      {parties.data && parties.data.items.length === 0 && (
        <TouchableRipple
          onPress={() => router.push('/invoices/third-parties/editor')}
          accessibilityRole="button"
        >
          <Text variant="bodyMedium" style={{ color: theme.primary }}>
            {t('invoicing.form.noParties')}
          </Text>
        </TouchableRipple>
      )}
    </FieldGroup>
  );
}

function LinesEditor({
  lines,
  onChange,
  warn,
  required,
}: {
  lines: LineDraft[];
  onChange(lines: LineDraft[]): void;
  warn: boolean;
  required: boolean;
}) {
  const { t } = useTranslation();
  const update = (index: number, change: Partial<LineDraft>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  return (
    <FieldGroup name="lines" style={styles.group} testID="lines">
      <Text variant="labelLarge">
        {warn ? `${t('invoicing.form.lines')} ⚠` : t('invoicing.form.lines')}
        {required ? ' *' : ''}
      </Text>
      {lines.map((line, index) => (
        <Card key={index} mode="contained">
          <Card.Content style={styles.boxContent}>
            <TextField
              label={t('invoicing.form.concept')}
              name={`lines.${index}.concept`}
              value={line.concept}
              onChangeText={(concept) => update(index, { concept })}
              testID={`line-concept-${index}`}
            />
            <View style={styles.lineRow}>
              <View style={styles.flex}>
                <TextField
                  label={t('invoicing.form.quantity')}
                  name={`lines.${index}.quantity`}
                  value={line.quantity}
                  onChangeText={(quantity) => update(index, { quantity })}
                  keyboardType="decimal-pad"
                  testID={`line-quantity-${index}`}
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  label={t('invoicing.form.unit')}
                  name={`lines.${index}.unit`}
                  value={line.unit}
                  onChangeText={(unit) => update(index, { unit })}
                  autoCapitalize="none"
                  testID={`line-unit-${index}`}
                />
              </View>
            </View>
            <TouchableRipple
              accessibilityRole="button"
              onPress={() => onChange(lines.filter((_, i) => i !== index))}
            >
              <Text variant="bodyMedium" style={styles.remove}>
                {t('invoicing.form.removeLine')}
              </Text>
            </TouchableRipple>
          </Card.Content>
        </Card>
      ))}
      <Button
        title={t('invoicing.form.addLine')}
        variant="secondary"
        onPress={() => onChange([...lines, { concept: '', quantity: '', unit: 'kg' }])}
        testID="add-line"
      />
    </FieldGroup>
  );
}

/** BR-INV-06: only pending delivery notes of the same third party and operation. */
function NotesToGroup({
  operation,
  thirdPartyId,
  selected,
  onChange,
}: {
  operation: Operation;
  thirdPartyId: string;
  selected: string[];
  onChange(ids: string[]): void;
}) {
  const { t } = useTranslation();
  const notes = useDeliveryNotes(operation, { pendingFor: thirdPartyId });
  const items = notes.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <FieldGroup name="deliveryNoteIds" style={styles.group} testID="notes-to-group">
      <Text variant="labelLarge">{t('invoicing.form.groupNotes')}</Text>
      <View style={styles.chips}>
        {items.map((note) => (
          <Chip
            key={note.id}
            label={`${note.number} · ${formatDay(note.date)}`}
            selected={selected.includes(note.id)}
            onPress={() =>
              onChange(
                selected.includes(note.id)
                  ? selected.filter((id) => id !== note.id)
                  : [...selected, note.id],
              )
            }
            testID={`group-note-${note.number}`}
          />
        ))}
      </View>
    </FieldGroup>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.warningContainer,
    color: colors.warning,
    borderRadius: 10,
    padding: 10,
  },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boxContent: { gap: 8 },
  lineRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  remove: { color: colors.danger },
  scan: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  scanText: { flexShrink: 1 },
});

/** Usual payment term: 30 days after the issue date (or today while it is empty). */
function dueDateAfter(issueDate: string): Date {
  const [year, month, day] = issueDate.split('-').map(Number);
  const base = year && month && day ? new Date(year, month - 1, day) : new Date();
  base.setDate(base.getDate() + 30);
  return base;
}
