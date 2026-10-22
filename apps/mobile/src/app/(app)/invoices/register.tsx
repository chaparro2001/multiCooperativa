import type { ExtractionField, Operation } from '@multicooperativa/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { allItems } from '@/api/paged';
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
import { Chip, Segmented } from '@/ui/chip';
import { formatDay } from '@/i18n/format';
import { ActionBar } from '@/ui/action-bar';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { DayField } from '@/ui/date-field';
import { FieldGroup, FormSummary } from '@/ui/field';
import { ErrorText, Screen } from '@/ui/screen';
import { SectionTitle } from '@/ui/section-title';
import { TextField } from '@/ui/text-field';
import { Icon, Text, TextInput, TouchableRipple, useTheme } from '@/ui/paper';
import { colors, space } from '@/ui/theme';

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
  // Low-confidence fields carry an alert icon in warning inside the field (the label stays plain).
  const warnIcon = (field: ExtractionField) =>
    review(field) ? <TextInput.Icon icon="alert-outline" color={colors.warning} /> : undefined;
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
    <Screen
      testID="register-screen"
      form={form}
      footer={
        <ActionBar>
          <FormSummary form={form}>{error}</FormSummary>
          <Button
            title={t('invoicing.form.confirm')}
            block
            onPress={submit}
            loading={registerInvoice.isPending || registerNote.isPending}
            testID="confirm-registration"
          />
        </ActionBar>
      }
    >
      {params.noData === '1' && <Banner testID="no-data">{t('invoicing.form.noData')}</Banner>}
      {draft.lowConfidence.length > 0 && (
        <Banner testID="low-confidence">{t('invoicing.form.reviewFields')}</Banner>
      )}

      <SectionTitle>{t('invoicing.form.sections.document')}</SectionTitle>

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
        label={t('invoicing.form.number')}
        right={warnIcon('number')}
        name="number"
        value={draft.number}
        onChangeText={(number) => patch({ number })}
        autoCapitalize="characters"
        maxLength={50}
        testID="form-number"
      />
      <DayField
        label={isInvoice ? t('invoicing.form.issueDate') : t('invoicing.form.noteDate')}
        warning={review('date')}
        name="date"
        value={draft.date}
        onChange={(date) => patch({ date })}
        testID="form-date"
      />

      {isInvoice && (
        <>
          <DayField
            label={t('invoicing.form.dueDate')}
            warning={review('dueDate')}
            name="dueDate"
            value={draft.dueDate}
            onChange={(dueDate) => patch({ dueDate })}
            suggested={() => dueDateAfter(draft.date)}
            testID="form-due-date"
          />
          <SectionTitle>{t('invoicing.form.sections.amounts')}</SectionTitle>
          <TextField
            label={t('invoicing.form.base')}
            right={warnIcon('base')}
            name="base"
            value={draft.base}
            onChangeText={(base) => patch({ base })}
            keyboardType="decimal-pad"
            testID="form-base"
          />
          <TextField
            label={t('invoicing.form.vatRate')}
            right={warnIcon('vatRate')}
            name="vatRate"
            value={draft.vatRate}
            onChangeText={(vatRate) => patch({ vatRate })}
            keyboardType="decimal-pad"
            testID="form-vat"
          />
          <TextField
            label={t('invoicing.form.total')}
            right={warnIcon('total')}
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

      {isInvoice && !!draft.thirdPartyId && (
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
      <View style={styles.labelRow}>
        <Text variant="labelLarge">{t('invoicing.form.thirdParty')}</Text>
        {warn ? <Icon source="alert-outline" size={18} color={colors.warning} /> : null}
      </View>
      {draft.suggestedParty && !draft.thirdPartyId && (
        <Card style={styles.boxContent}>
          <>
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
          </>
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
          onPress={() =>
            router.push(
              `/invoices/third-parties/editor?type=${draft.operation === 'purchase' ? 'supplier' : 'customer'}`,
            )
          }
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
      <View style={styles.labelRow}>
        <SectionTitle>
          {t('invoicing.form.lines')}
          {required ? ' *' : ''}
        </SectionTitle>
        {warn ? <Icon source="alert-outline" size={18} color={colors.warning} /> : null}
      </View>
      {lines.map((line, index) => (
        <Card key={index} style={styles.boxContent}>
          <>
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
          </>
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
  const { colors: theme } = useTheme();
  const notes = useDeliveryNotes(operation, { pendingFor: thirdPartyId });
  const items = allItems(notes.data);
  if (items.length === 0) return null;
  return (
    <FieldGroup name="deliveryNoteIds" style={styles.group} testID="notes-to-group">
      <SectionTitle>{t('invoicing.home.notes')}</SectionTitle>
      <Text variant="bodyMedium" style={{ color: theme.onSurfaceVariant }}>
        {t('invoicing.form.groupNotes')}
      </Text>
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
  group: { gap: space[2] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  boxContent: { gap: space[2] },
  lineRow: { flexDirection: 'row', gap: space[2] },
  flex: { flex: 1 },
  remove: { color: colors.danger },
  scan: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[2],
    alignItems: 'center',
  },
  scanText: { flexShrink: 1 },
});

/** Usual payment term: 30 days after the issue date (or today while it is empty). */
function dueDateAfter(issueDate: string): Date {
  const [year, month, day] = issueDate.split('-').map(Number);
  const base = year && month && day ? new Date(year, month - 1, day) : new Date();
  base.setDate(base.getDate() + 30);
  return base;
}
