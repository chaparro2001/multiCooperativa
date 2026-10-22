import type { InvoicingSettings } from '@multicooperativa/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';
import { FormScope, useForm } from '@/forms/use-form';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { FormSummary } from '@/ui/field';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { Card, Divider, Text, useTheme } from '@/ui/paper';

import { useInvoicingSettings, useUpdateInvoicingSettings } from './queries';
import {
  draftFrom,
  INVOICING_SETTINGS_FIELDS,
  type InvoicingSettingsDraft,
  toSettings,
  validateInvoicingSettings,
} from './settings-validation';

type Block = 'invoiceNotice' | 'noteDeadline' | 'noteNotice';

/** Before the settings arrive there is nothing to edit or validate. */
const NO_DRAFT = {} as InvoicingSettingsDraft;

const BLOCKS: readonly Block[] = ['invoiceNotice', 'noteDeadline', 'noteNotice'];

/**
 * BR-INV-15: the administrator decides, per alert, whether it is on and for how many days:
 * invoices' notice before the due date, the deadline to invoice delivery notes and the notice
 * before that deadline. A switched-off alert shows its number disabled and keeps it.
 */
export function InvoicingSettingsSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const settings = useInvoicingSettings();
  const update = useUpdateInvoicingSettings();
  const [draft, setDraft] = useState<InvoicingSettingsDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const form = useForm({
    values: draft ?? NO_DRAFT,
    validate: (values) => (draft ? validateInvoicingSettings(values) : {}),
  });

  // The draft follows the stored settings (adjusting state during render, not in an effect).
  const [seenData, setSeenData] = useState<typeof settings.data>();
  if (settings.data !== seenData) {
    setSeenData(settings.data);
    if (settings.data) setDraft(draftFrom(settings.data));
  }

  function change(changes: Partial<InvoicingSettingsDraft>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setSaved(false);
    update.reset();
  }

  function save() {
    setSaved(false);
    setBanner(null);
    if (!draft || !settings.data || !form.validateAll()) return;
    update.mutate(toSettings(draft, settings.data), {
      onSuccess: () => setSaved(true),
      onError: (failure) => {
        const routed = routeServerError(failure, {}, (field) =>
          (INVOICING_SETTINGS_FIELDS as readonly string[]).includes(field),
        );
        form.setServerErrors(routed.fields);
        setBanner(routed.banner);
      },
    });
  }

  return (
    <FormScope form={form}>
      <View style={styles.section} testID="invoicing-settings-section">
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {t('settings.invoicing.title')}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('settings.invoicing.description')}
        </Text>
        {settings.isError && <ErrorText>{messageFor(settings.error)}</ErrorText>}
        {draft &&
          BLOCKS.map((block) => (
            <AlertBlock
              key={block}
              block={block}
              draft={draft}
              deadlineOff={block === 'noteNotice' && !draft.noteDeadlineEnabled}
              onChange={change}
            />
          ))}
        {banner && <ErrorText>{banner}</ErrorText>}
        <FormSummary form={form} />
        {saved && !banner && (
          <Text variant="bodyMedium" accessibilityLiveRegion="polite" testID="invoicing-saved">
            {t('settings.invoicing.saved')}
          </Text>
        )}
        <Button
          title={t('settings.invoicing.save')}
          loading={update.isPending}
          disabled={!draft}
          onPress={save}
          testID="invoicing-save"
        />
        <Divider />
      </View>
    </FormScope>
  );
}

function AlertBlock({
  block,
  draft,
  deadlineOff,
  onChange,
}: {
  block: Block;
  draft: InvoicingSettingsDraft;
  /** The note notice announces the deadline: without it, it has no effect. */
  deadlineOff: boolean;
  onChange(changes: Partial<InvoicingSettingsDraft>): void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const enabledKey = `${block}Enabled` as keyof InvoicingSettings & keyof InvoicingSettingsDraft;
  const daysKey = `${block}Days` as keyof InvoicingSettings & keyof InvoicingSettingsDraft;
  const enabled = draft[enabledKey] as boolean;
  const text = draft[daysKey] as string;
  const inactive = !enabled || deadlineOff;
  const muted = { color: theme.colors.onSurfaceVariant };
  return (
    <Card mode="outlined" testID={`${block}-block`}>
      <Card.Content style={styles.block}>
        <Text variant="titleSmall">{t(`settings.invoicing.${block}.title`)}</Text>
        <Checkbox
          label={t('settings.invoicing.enabled')}
          checked={enabled}
          onChange={(checked) => onChange({ [enabledKey]: checked })}
          testID={`${block}-enabled`}
        />
        <View style={inactive && styles.inactive}>
          <TextField
            label={t('settings.invoicing.days')}
            name={daysKey}
            value={text}
            onChangeText={(value) => onChange({ [daysKey]: value })}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={3}
            editable={!inactive}
            testID={`${block}-days`}
          />
        </View>
        <Text variant="bodyMedium" style={muted}>
          {t(`settings.invoicing.${block}.hint`)}
        </Text>
        {!enabled && (
          <Text variant="bodyMedium" style={muted}>
            {t(`settings.invoicing.${block}.off`)}
          </Text>
        )}
        {enabled && deadlineOff && (
          <Text variant="bodyMedium" style={muted}>
            {t('settings.invoicing.noteNotice.deadlineOff')}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  label: { textTransform: 'uppercase' },
  block: { gap: 8 },
  inactive: { opacity: 0.5 },
});
